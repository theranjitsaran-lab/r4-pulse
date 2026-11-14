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

// Every account's months by line, in dollars and in units, for Accounts' line filter and its $ / Units switch
// (Theran, 14 November 2026). Aligned to AM's months (month billed). Storage is the account's storage on each bill and
// its boxes; a service line is its priced lines and their units (accountlines). Bins serviced are Veri-Shred's done bin
// services, by the month the work was done, so they sit a month ahead of the bill that charges them.
//   lineMonths(AM, AL) → Map(level1 → { [line]: { r: [..], u: [..] | null }, binsDone: [..] | null })
export function lineMonths(AM, AL) {
  const at = new Map(AM.months.map((m, i) => [m, i])), n = AM.months.length, out = new Map();
  const get = id => out.get(id) || out.set(id, {}).get(id);
  const arr = () => new Array(n).fill(0);
  for (const a of AM.accounts) if (a.storage.some(Boolean)) get(a.level1).storage = { r: a.storage.slice(), u: null };
  const hasUnits = !!(AL && AL.rows && AL.rows.some(r => r.units != null));
  for (const r of (AL && AL.rows) || []) {
    if (!at.has(r.month)) continue;
    const o = get(r.level1), x = o[r.family] || (o[r.family] = { r: arr(), u: hasUnits ? arr() : null }), i = at.get(r.month);
    x.r[i] += r.revenue; if (x.u && r.units != null) x.u[i] += r.units;
  }
  for (const b of (AL && AL.boxes) || []) {
    if (!at.has(b.month)) continue;
    const o = get(b.level1), x = o.storage || (o.storage = { r: arr(), u: null });
    (x.u || (x.u = arr()))[at.get(b.month)] += b.boxes;
  }
  for (const b of (AL && AL.bins) || []) {
    if (!at.has(b.month)) continue;
    const o = get(b.level1); (o.binsDone || (o.binsDone = arr()))[at.get(b.month)] += b.bins;
  }
  return out;
}
// One account's months by line over as many months as the line data holds (25 live), for the move drawer
// (movebridge.js). Storage from the customer series (C, 24 months) where it has the account, else AM. What the bill
// carries beyond its itemised lines (tax and the like) is its own line, so the lines add to the account's total.
//   accountHistory({ C, AM, AL }, level1) → { months, lines: { key: { name, r, u } }, customer } | null
export function accountHistory({ C, AM, AL }, level1) {
  const months = [...new Set((AL && AL.rows || []).map(r => r.month))].sort();
  if (!months.length) return null;
  const at = new Map(months.map((m, i) => [m, i])), z = () => months.map(() => 0);
  const src = (C && C.accounts.find(a => a.level1 === level1)) ? C : AM;
  const acc = src && src.accounts.find(a => a.level1 === level1);
  if (!acc) return null;
  const storage = z(), service = z(), known = months.map(() => false);
  src.months.forEach((m, i) => { if (at.has(m)) { const j = at.get(m); storage[j] = acc.storage[i] || 0; service[j] = acc.service[i] || 0; known[j] = true; } });
  const hasU = AL.rows.some(r => r.units != null);
  const lines = {};
  if (storage.some(Boolean)) lines.storage = { name: LINE_NAMES.storage, r: storage, u: null };
  for (const r of AL.rows) {
    if (r.level1 !== level1 || !at.has(r.month)) continue;
    const x = lines[r.family] || (lines[r.family] = { name: LINE_NAMES[r.family] || r.family, r: z(), u: hasU ? z() : null });
    x.r[at.get(r.month)] += r.revenue; if (x.u && r.units != null) x.u[at.get(r.month)] += r.units;
  }
  for (const b of AL.boxes || []) if (b.level1 === level1 && at.has(b.month) && lines.storage) (lines.storage.u || (lines.storage.u = z()))[at.get(b.month)] += b.boxes;
  const rest = months.map((_, i) => known[i] ? service[i] - Object.entries(lines).filter(([k]) => k !== 'storage').reduce((t, [, l]) => t + l.r[i], 0) : 0);
  if (rest.some(v => Math.abs(v) >= 1)) lines.rest = { name: 'Tax and other, not itemised', r: rest, u: null };
  // only the months the account's own series covers
  const first = known.indexOf(true);
  if (first < 0) return null;
  const cut = a => a ? a.slice(first) : a;
  for (const l of Object.values(lines)) { l.r = cut(l.r); l.u = cut(l.u); }
  return { months: months.slice(first), lines, customer: acc.customer };
}

// What each line's units are, for labels
export const LINE_UNITS = { storage: 'boxes stored', bin: 'bin services', shred: 'boxes shredded', itad: 'devices', handling: 'boxes moved', labour: 'hours', movement: 'delivery trips', other: null };

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
