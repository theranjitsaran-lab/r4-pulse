// What each account buys, and what it doesn't buy yet. One row per account, one cell per line of
// business. A cell the account buys holds its twelve-month spend. A cell it doesn't buy holds what
// comparable accounts spend on that line, sized from the database:
//   handling, delivery, destruction for an account that stores: the median spend per 1,000 boxes
//     among storers (500+ boxes) that buy the line, times the account's boxes;
//   storage, bins, ITAD: the median ratio of that line's spend to the rest of the account's spend,
//     among accounts in the same size band that buy it as an add-on (under 40% of their spend),
//     times the account's other spend.
// The median comparable, not the best; a cell is never larger than the account's whole spend today.
// Read from fixtures/margin.json: accounts (storage_revenue, boxes) and lines by family.

export const LINES = [
  { key: 'storage',  name: 'Storage',      by: 'ratio' },
  { key: 'handling', name: 'Retrieval and refile', short: 'Retrieval', by: 'boxes' },
  { key: 'movement', name: 'Delivery',     by: 'boxes' },
  { key: 'shred',    name: 'Destruction',  by: 'boxes' },
  { key: 'bin',      name: 'Shred bins',   short: 'Bins', by: 'ratio' },
  { key: 'itad',     name: 'ITAD',         by: 'ratio' },
];
const BUYS = 250;          // twelve-month spend below this is noise, not a customer of the line
const STORER = 500;        // boxes before box-driven lines are sized
const MIN_PEERS = 8;
const ADDON = 0.4;         // a line is an add-on when it is under 40% of the account's spend       // fewer comparables than this and the band widens to the whole book
const band = t => t < 25e3 ? 0 : t < 100e3 ? 1 : 2;
const median = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function buildWhitespace(M, { exclude = [], top = 40 } = {}) {
  const skip = new Set(exclude);
  const acc = new Map();
  for (const a of M.accounts) {
    if (skip.has(a.level1)) continue;
    acc.set(a.level1, { level1: a.level1, customer: a.customer, boxes: a.boxes || 0, spend: { storage: Math.max(0, a.storage_revenue || 0) } });
  }
  for (const l of M.lines) {
    const a = acc.get(l.level1);
    if (!a || !LINES.some(x => x.key === l.family) || l.family === 'storage') continue;
    a.spend[l.family] = (a.spend[l.family] || 0) + l.revenue;
  }
  const all = [...acc.values()].map(a => {
    for (const x of LINES) a.spend[x.key] = Math.max(0, a.spend[x.key] || 0);
    a.total = LINES.reduce((t, x) => t + a.spend[x.key], 0);
    return a;
  }).filter(a => a.total > 0);

  // the comparables, line by line
  const rates = {};
  for (const x of LINES) {
    const buyers = all.filter(a => a.spend[x.key] >= BUYS);
    if (x.by === 'boxes') {
      const r = buyers.filter(a => a.boxes >= STORER).map(a => a.spend[x.key] / a.boxes * 1000);
      rates[x.key] = { per1000: median(r), peers: r.length };
    } else {
      const ratio = a => a.spend[x.key] / (a.total - a.spend[x.key]);
      // add-on buyers only: an account whose main business is this line (an electronics client for
      // ITAD, a pure storer) is not a comparable for selling it on
      const withOther = buyers.filter(a => a.total - a.spend[x.key] >= BUYS && a.spend[x.key] < ADDON * a.total);
      const byBand = [0, 1, 2].map(b => withOther.filter(a => band(a.total - a.spend[x.key]) === b).map(ratio));
      const whole = withOther.map(ratio);
      rates[x.key] = { bands: byBand.map(v => v.length >= MIN_PEERS ? { ratio: median(v), peers: v.length } : { ratio: median(whole), peers: whole.length, widened: true }) };
    }
  }

  const rows = all.sort((a, b) => b.total - a.total).slice(0, top).map(a => {
    const cells = {};
    for (const x of LINES) {
      if (a.spend[x.key] >= BUYS) { cells[x.key] = { have: true, spend: a.spend[x.key] }; continue; }
      let opp = 0, basis = '';
      if (x.by === 'boxes') {
        const r = rates[x.key];
        if (a.boxes >= STORER && r.per1000) {
          opp = r.per1000 * a.boxes / 1000;
          basis = `$${Math.round(r.per1000).toLocaleString('en-US')} a year per 1,000 boxes, the median of ${r.peers} storers that buy it, on ${Math.round(a.boxes).toLocaleString('en-US')} boxes`;
        }
      } else {
        const other = a.total - a.spend[x.key], r = rates[x.key].bands[band(other)];
        if (other >= BUYS && r.ratio) {
          opp = r.ratio * other;
          basis = `${Math.round(r.ratio * 100)}¢ on every dollar of other work, the median of ${r.peers} ${r.widened ? '' : 'similar-sized '}accounts that buy it`;
        }
      }
      opp = Math.min(opp, a.total);
      cells[x.key] = { have: false, spend: a.spend[x.key], opp, basis };
    }
    const opp = LINES.reduce((t, x) => t + (cells[x.key].have ? 0 : cells[x.key].opp), 0);
    return { level1: a.level1, customer: a.customer, boxes: a.boxes, total: a.total, cells, opp };
  });
  return { lines: LINES, rows, rates, total: rows.reduce((t, r) => t + r.opp, 0) };
}
