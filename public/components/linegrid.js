// Money's table: lines of business by month, and what each month cost to serve est. No DOM.
// Revenue is the same series as Today's lines (linework.js), so October here is Today's headline.
// A month's cost: each account's own cost a unit for the line (accountCosts, twelve months' volumes) × its
// units that month; storage is the rate × that month's boxes. Nothing is a percentage of revenue. A month
// with no priced units has no margin yet: it is not estimated twice over.
import { lineSeries, LINE_NAMES } from './linework.js';
import { accountCosts } from './margin.js';

const CITADEL = 6714;

export function lineGrid(D, n = 25) {
  const { W, months, val } = lineSeries(D);
  const list = months.slice(-n), latest = list[list.length - 1];
  const rows = Object.keys(LINE_NAMES).map(k => ({ key: k, name: LINE_NAMES[k], rev: list.map(m => val(k, m)) }))
    .sort((a, b) => b.rev[b.rev.length - 1] - a.rev[a.rev.length - 1]);
  const e = W.byMonth.get(latest);
  return { months: list, est: list.filter(m => W.byMonth.has(m)), rows, jobs: e ? e.jobsValue : 0 };
}

// The units each of an account's cost results follows in a priced line, in accountCosts' order. Kinds of unit
// are never added together: pounds and boxes are separate results, and trips stand in for boxes on delivery.
// The month's pound line (S5) holds bin and plant pounds together; the year's split says how much is plant.
function followers(f, lines) {
  const has = c => lines.some(l => l.servcode === c), u = c => lines.filter(l => l.servcode === c).reduce((t, l) => t + (l.units || 0), 0);
  const line = code => lines.find(l => l.servcode === code);
  if (f === 'bin') return [(p) => { const l = line(p.servcode); return l && l.family === 'bin' && l.unit === 'service' ? p.units : 0; }];
  if (f === 'movement') return [(p) => { if (has('01')) return p.servcode === '01' ? p.units : 0; const l = line(p.servcode); return l && l.family === 'movement' && l.drives_cost && l.unit === 'box' ? p.units : 0; }];
  if (f === 'shred') {
    const s5 = u('S5B') + u('S5P') + u('S5T'), plant = s5 > 0 ? u('S5P') / s5 : 0, lb = u('S3') + u('S5P') > 0;
    const pounds = p => p.servcode === 'S3' ? p.units : p.servcode === 'S5' ? p.units * plant : 0;
    const boxes = p => { const l = line(p.servcode); return l && l.family === 'shred' && l.drives_cost && (l.unit === 'box' || l.unit === 'cubic foot') ? p.units : 0; };
    return lb ? [pounds, boxes] : [boxes];
  }
  return [(p) => { const l = line(p.servcode); return l && l.family === f && l.drives_cost ? p.units : 0; }];
}

// The last twelve priced months stand in for the margin data's year, so the months add back to the year's
// cost by construction: the split gives each month its share, it does not test the year.
export function lineCosts(D, grid) {
  const { M, LW, S, R } = D, idx = new Map(grid.months.map((m, i) => [m, i]));
  const costs = Object.fromEntries(grid.rows.map(r => [r.key, grid.months.map(() => 0)]));
  const byAcc = new Map(), pricedBy = new Map();
  for (const l of M.lines) (byAcc.get(l.level1) || byAcc.set(l.level1, []).get(l.level1)).push(l);
  for (const p of LW.priced) if (idx.has(p.month)) (pricedBy.get(p.level1) || pricedBy.set(p.level1, []).get(p.level1)).push(p);
  const priced = grid.months.map(m => !grid.est.includes(m) && LW.priced.some(p => p.month === m));
  const window = new Set(grid.months.filter((m, i) => priced[i]).slice(-12));
  for (const a of M.accounts) {
    if (a.level1 === CITADEL) continue;
    const lines = byAcc.get(a.level1) || [], mine = pricedBy.get(a.level1) || [];
    for (const [f, rs] of Object.entries(accountCosts(R, a, lines))) {
      if (f === 'storage' || !costs[f]) continue;
      const follow = followers(f, lines);
      rs.forEach((r, n) => {
        const units = follow[Math.min(n, follow.length - 1)];
        const year = mine.filter(p => window.has(p.month)).reduce((t, p) => t + units(p), 0);
        // no billed units to follow, as on a flat fee: the year falls evenly across its months
        if (!(year > 0)) { grid.months.forEach((m, i) => { if (priced[i]) costs[f][i] += r.total / 12; }); return; }
        for (const p of mine) { const i = idx.get(p.month); if (priced[i]) costs[f][i] += r.total / year * units(p); }
      });
    }
  }
  const boxes = new Map(((S && S.months) || []).map(m => [m.month, m.boxes]));
  grid.months.forEach((m, i) => { if (boxes.has(m) && priced[i]) costs.storage[i] = R.costToServe('storage', boxes.get(m)).total / 12; });
  return { priced, costs };
}

// One account's lines by month billed: storage, each line on its invoices, and whatever on the invoices is on no
// priced line (tax and surcharges), so the lines add to the account's row.
export function accountLines(AM, AL, level1) {
  const a = AM.accounts.find(x => x.level1 === level1);
  if (!a) return null;
  const at = new Map(AM.months.map((m, i) => [m, i])), lines = new Map();
  for (const r of AL.rows) {
    if (r.level1 !== level1 || !at.has(r.month)) continue;
    (lines.get(r.family) || lines.set(r.family, AM.months.map(() => 0)).get(r.family))[at.get(r.month)] += r.revenue;
  }
  const rows = [];
  if (a.storage.some(Boolean)) rows.push({ key: 'storage', name: LINE_NAMES.storage, values: a.storage });
  for (const k of Object.keys(LINE_NAMES)) if (lines.has(k) && lines.get(k).some(Boolean)) rows.push({ key: k, name: LINE_NAMES[k], values: lines.get(k) });
  const left = AM.months.map((m, i) => a.service[i] - [...lines.values()].reduce((t, v) => t + v[i], 0));
  if (left.some(v => Math.abs(v) >= 1)) rows.push({ key: 'rest', name: 'Tax and other, not itemised', values: left });
  return { months: AM.months, rows };
}

// ── what the table reads ──
export const STORAGE_KEY = 'storage';
export function gridRows(grid, C, group) {
  const rows = grid.rows.map(r => ({ ...r, cost: C ? C.costs[r.key] : null, costed: !!C && r.key !== 'other' }));
  if (group !== 'ss') return rows;
  const svc = rows.filter(r => r.key !== STORAGE_KEY), add = (f, cond) => grid.months.map((m, i) => svc.filter(cond).reduce((t, r) => t + f(r)[i], 0));
  return [rows.find(r => r.key === STORAGE_KEY), { key: 'service', name: 'Service', rev: add(r => r.rev, () => true), costedRev: C ? add(r => r.rev, r => r.costed) : null, cost: C ? add(r => r.cost, r => r.costed) : null, costed: !!C }];
}
// revenue that has a cost against it, in the months that have one
const costedRev = (r, i) => r.costedRev ? r.costedRev[i] : r.rev[i];
export function marginOver(rows, indexes, priced) {
  let rev = 0, cost = 0;
  for (const r of rows) if (r.costed) for (const i of indexes) if (priced[i]) { rev += costedRev(r, i); cost += r.cost[i]; }
  return { rev, cost, margin: rev - cost, pct: rev > 0 ? (rev - cost) / rev : null };
}
