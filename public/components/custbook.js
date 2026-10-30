// The customer book: one row per account with everything the Customers table sorts and filters on,
// and the peers each figure is judged against. No DOM; Customers draws it, the pop-outs explain it.
//
//   const B = customerBook({ C, M, PR, R })
//   B.rows: [{ level1, customer, ltm, last, lastPct, d, movePct, ytdPct, spark, margin, pc, review,
//             opp, gap, fam: { family: { revenue, cost, units, unit, price, costPer } } }]
//   B.book: { family: { unit, price: { p25, med, p75, n }, costPer: { med } } }   the book's middle half
//
// Sales are as invoiced (customers fixture, 24 months; margin fixture for the rest of the book).
// Cost is modelled ◇ from model/rates.js through margin.js. Price per unit is the line's revenue over
// the units that drive it: storage a box a month, bins a service, ITAD a device, retrieval a box
// moved, delivery a trip, labour an hour, destruction a pound (or a box where it is billed by the box).
import { seriesOf } from './series.js';
import { buildMargins, accountCosts } from './margin.js';
import { serviceGaps, storageGaps, CITADEL, CROSS_SELL_DEPTH } from './levers.js';
import { buildWhitespace } from './whitespace.js';

export const FAMS = [
  { key: 'storage',  name: 'Storage',     unit: 'box a month' },
  { key: 'bin',      name: 'Shred bins',  unit: 'bin service' },
  { key: 'shred',    name: 'Destruction', unit: 'lb' },
  { key: 'itad',     name: 'ITAD',        unit: 'device' },
  { key: 'handling', name: 'Retrieval',   unit: 'box moved' },
  { key: 'movement', name: 'Delivery',    unit: 'trip' },
  { key: 'labour',   name: 'Labour',      unit: 'hour' },
];
const MIN_REVENUE = 250;   // a line under this a year is noise, not a customer of the line

const sum = (a, f = x => x) => a.reduce((t, x) => t + (f(x) || 0), 0);
const q = (s, f) => s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(f * (s.length - 1))))] : null;
const ch = (a, b) => b > 0 ? a / b - 1 : null;

// the units that drive a family's price, from the account's priced lines
function unitsOf(key, a, lines) {
  const u = pred => sum(lines.filter(pred), l => l.units);
  switch (key) {
    case 'storage': return { units: a.boxes || 0, unit: 'box a month', months: 12 };
    case 'bin': return { units: a.bins || u(l => l.family === 'bin' && l.unit === 'service'), unit: 'bin service' };
    case 'itad': return { units: u(l => l.family === 'itad' && l.drives_cost), unit: 'device' };
    case 'handling': return { units: u(l => l.family === 'handling' && (l.unit === 'box' || l.unit === 'file')), unit: 'box moved' };
    case 'movement': return { units: u(l => l.servcode === '01'), unit: 'trip' };
    case 'labour': return { units: u(l => l.family === 'labour' && l.unit === 'hour'), unit: 'hour' };
    case 'shred': {
      const lb = u(l => l.family === 'shred' && l.unit === 'lb');
      return lb > 0 ? { units: lb, unit: 'lb' } : { units: u(l => l.family === 'shred' && (l.unit === 'box' || l.unit === 'cubic foot')), unit: 'box' };
    }
  }
  return { units: 0, unit: '' };
}

export function customerBook({ C, M, PR, R }) {
  const ser = seriesOf(C);
  const mb = buildMargins(R, M, { exclude: [] });
  const marg = new Map(mb.accounts.map(a => [a.level1, a]));
  const linesBy = new Map();
  for (const l of M.lines) (linesBy.get(l.level1) || linesBy.set(l.level1, []).get(l.level1)).push(l);
  const ws = buildWhitespace(M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
  const opp = new Map(ws.rows.map(r => [r.level1, r]));
  const sg = serviceGaps(PR), st = storageGaps(PR), gap = new Map();
  for (const a of sg.values()) gap.set(a.level1, (gap.get(a.level1) || 0) + a.worth * 12);
  for (const r of st.rows) gap.set(r.level1, (gap.get(r.level1) || 0) + r.worth * 12);

  const months = ser.size ? [...ser.values()][0].months : [];
  const lastM = months[months.length - 1] || '', y = lastM.slice(0, 4);
  const yi = months.indexOf(`${y}-01-01`);

  const rows = [];
  for (const a of M.accounts) {
    const m = marg.get(a.level1), s = ser.get(a.level1);
    if (!m || m.revenue < 1000) continue;
    const lines = linesBy.get(a.level1) || [];
    const costs = accountCosts(R, a, lines);
    const fam = {};
    for (const f of FAMS) {
      const fm = m.fam[f.key];
      if (!fm || fm.revenue < MIN_REVENUE) continue;
      const u = unitsOf(f.key, a, lines);
      const per = u.units > 0 ? (u.months ? u.units * u.months : u.units) : 0;
      fam[f.key] = { revenue: fm.revenue, cost: fm.cost, units: u.units, unit: u.unit, price: per ? fm.revenue / per : null, costPer: per && fm.cost ? fm.cost / per : null,
        lines: (costs[f.key] || []).flatMap(r => r.lines) };
    }
    const t = s ? s.total : null, L = t ? t.length : 0;
    const ytd = t && yi >= 0 ? sum(t.slice(yi - (months.length - L))) : null;
    const ytdLy = t && yi >= 12 ? sum(t.slice(yi - 12 - (months.length - L), L - 12)) : null;
    const routeCost = ['bin', 'handling', 'movement'].reduce((x, f) => x + ((m.fam[f] || {}).cost || 0), 0);
    rows.push({
      level1: a.level1, customer: a.customer, citadel: a.level1 === CITADEL,
      ltm: s ? s.ltm : m.revenue, last: t ? t[L - 1] : null, lastPct: t ? ch(t[L - 1], t[L - 2]) : null,
      d: s && s.move ? s.move.d : null, movePct: s && s.move ? s.move.pct : null, move: s ? s.move : null,
      ytd, ytdPct: ytd != null && ytdLy ? ch(ytd, ytdLy) : null,
      spark: t ? t.slice(-13) : null,
      revenue: m.revenue, cost: m.cost, margin: m.margin, pc: m.revenue > 0 ? m.margin / m.revenue : null,
      review: m.cost > 0 && routeCost > 0.5 * m.cost, routeCost,
      opp: opp.has(a.level1) ? opp.get(a.level1).opp : 0, oppRow: opp.get(a.level1) || null,
      gap: gap.get(a.level1) || 0,
      boxes: a.boxes || 0, visits: a.visits || 0, bins: a.bins || 0,
      fam, mfam: m.fam,
    });
  }

  // the book's middle half for each family's price and cost per unit, Citadel apart, by unit
  const book = {};
  for (const f of FAMS) {
    const xs = rows.filter(r => !r.citadel && r.fam[f.key] && r.fam[f.key].price > 0);
    const byUnit = new Map();
    for (const r of xs) { const u = r.fam[f.key].unit; (byUnit.get(u) || byUnit.set(u, []).get(u)).push(r); }
    book[f.key] = {};
    for (const [u, rs] of byUnit) {
      const p = rs.map(r => r.fam[f.key].price).sort((a, b) => a - b), c = rs.map(r => r.fam[f.key].costPer).filter(v => v > 0).sort((a, b) => a - b);
      book[f.key][u] = { price: { p25: q(p, .25), med: q(p, .5), p75: q(p, .75), n: p.length, all: p }, costPer: { med: q(c, .5), n: c.length } };
    }
  }
  return { rows, book, months, ws };
}

// Where one account's price sits among accounts buying the same line in the same unit at a similar
// volume (a third to three times its units), widened to the whole book when fewer than eight: a bin
// service at a 100-bin hospital is not priced like one bin at a small office. Its percentile, the
// peers' middle half, and the gap to their median, a year.
export function pricePosition(B, row, key) {
  const f = row.fam[key]; if (!f || !(f.price > 0)) return null;
  const same = B.rows.filter(r => !r.citadel && r.level1 !== row.level1 && r.fam[key] && r.fam[key].unit === f.unit && r.fam[key].price > 0);
  let peers = same.filter(r => r.fam[key].units >= f.units / 3 && r.fam[key].units <= f.units * 3), widened = false;
  if (peers.length < 8) { peers = same; widened = true; }
  if (peers.length < 8) return null;
  const p = peers.map(r => r.fam[key].price).sort((x, y) => x - y), c = peers.map(r => r.fam[key].costPer).filter(v => v > 0).sort((x, y) => x - y);
  const med = q(p, .5), perYear = f.unit === 'box a month' ? f.units * 12 : f.units;
  return { p25: q(p, .25), med, p75: q(p, .75), n: p.length, all: p, widened, pct: p.filter(v => v < f.price).length / p.length,
    toMedian: widened ? null : (med - f.price) * perYear, unit: f.unit, costMed: q(c, .5),   // no gap claimed against a book of a different size
    names: peers.sort((x, y) => Math.abs(x.fam[key].units - f.units) - Math.abs(y.fam[key].units - f.units)).slice(0, 5).map(r => ({ level1: r.level1, customer: r.customer, price: r.fam[key].price, units: r.fam[key].units })) };
}

// Similar-sized accounts: within half and double this one's twelve months, Citadel apart, with a move
export function sizePeers(B, row) {
  const xs = B.rows.filter(r => !r.citadel && r.level1 !== row.level1 && r.movePct != null && r.ltm >= row.ltm / 2 && r.ltm <= row.ltm * 2);
  const mv = xs.map(r => r.movePct).sort((a, b) => a - b), pc = xs.map(r => r.pc).filter(v => v != null).sort((a, b) => a - b);
  return { n: xs.length, move: q(mv, .5), pc: q(pc, .5) };
}
