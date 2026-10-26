// Gross margin per account and per line of business, from the /api/margin fixture and
// model/rates.js. The same arithmetic as scripts/prompt4_before_after.js, so the screens and the
// checks agree. Revenue is as invoiced over the last twelve months; cost is built from volumes.
//
//   const book = buildMargins(R, M, { exclude: [6714] })
//   book.accounts: [{ level1, customer, revenue, cost, margin, fam: { family: { revenue, cost } } }]
//   book.families: { family: { revenue, cost } }   'other' is revenue with no cost family (fees, scanning)
'use strict';

const CENTRE_HOURS = new Set(['53', '54']);   // customer support, data entry: Service Centre rate

export function buildMargins(R, M, opts = {}) {
  const exclude = new Set(opts.exclude || []);
  const byAcc = new Map();
  for (const l of M.lines) {
    if (!byAcc.has(l.level1)) byAcc.set(l.level1, []);
    byAcc.get(l.level1).push(l);
  }
  const families = {};
  const add = (fam, key, f, v) => {
    fam[f] = fam[f] || { revenue: 0, cost: 0 };
    fam[f][key] += v;
    families[f] = families[f] || { revenue: 0, cost: 0 };
    families[f][key] += v;
  };
  const accounts = [];
  for (const a of M.accounts) {
    if (exclude.has(a.level1)) continue;
    const lines = byAcc.get(a.level1) || [];
    const fam = {};
    const units = (pred) => lines.filter(pred).reduce((t, l) => t + l.units, 0);
    const days = (pred) => lines.filter(pred).reduce((t, l) => Math.max(t, l.days), 0);

    // revenue by family: storage from the invoices, everything else from its priced lines
    if (a.storage_revenue) add(fam, 'revenue', 'storage', a.storage_revenue);
    for (const l of lines) {
      if (l.family === 'storage') continue;
      add(fam, 'revenue', l.family && l.family !== 'none' ? l.family : 'other', l.revenue);
    }

    // cost by family: every cost-to-serve result, kept so a screen can show its working
    for (const [f, rs] of Object.entries(accountCosts(R, a, lines))) for (const r of rs) add(fam, 'cost', f, r.total);

    const revenue = a.storage_revenue + a.service_revenue;
    const cost = Object.values(fam).reduce((t, f) => t + f.cost, 0);
    accounts.push({ level1: a.level1, customer: a.customer, revenue, cost, margin: revenue - cost, fam });
  }
  return { accounts, families };
}

// The book's margin as Home and the Margin view show it, from one place so they always agree:
// accounts over $1,000 a year (Citadel apart) with their margin %, a flag when route costs are over
// half their cost (under review), the margin on the lines costed with confidence, and the accounts
// that cost more to serve than they pay.
const ROUTE_FAMILIES = ['bin', 'handling', 'movement'];
const SOLID_FAMILIES = ['storage', 'shred', 'labour', 'itad'];
export function marginSummary(R, M, exclude = [6714]) {
  const book = buildMargins(R, M, { exclude });
  const accounts = book.accounts.filter(a => a.revenue > 1000).map(m => {
    const routeCost = ROUTE_FAMILIES.reduce((t, f) => t + ((m.fam[f] || {}).cost || 0), 0);
    return { ...m, pc: m.revenue > 0 ? m.margin / m.revenue : null, review: m.cost > 0 && routeCost > 0.5 * m.cost };
  });
  const solid = Object.entries(book.families).filter(([f, v]) => SOLID_FAMILIES.includes(f) && v.revenue > 0);
  const solidPc = 1 - solid.reduce((t, [, v]) => t + v.cost, 0) / solid.reduce((t, [, v]) => t + v.revenue, 0);
  const losers = accounts.filter(a => a.margin < 0);
  return { book, accounts, solidPc, losers, lossTotal: -losers.reduce((t, a) => t + a.margin, 0), below: accounts.filter(a => a.pc < 0.15) };
}

// The cost-to-serve results behind one account's cost, by family: { family: [costToServe result] }.
// buildMargins sums them; the customer page shows their lines as the working.
export function accountCosts(R, a, lines) {
  const out = {};
  const put = (f, r) => (out[f] = out[f] || []).push(r);
  const units = (pred) => lines.filter(pred).reduce((t, l) => t + l.units, 0);
  const days = (pred) => lines.filter(pred).reduce((t, l) => Math.max(t, l.days), 0);
  if (a.boxes > 0) put('storage', R.costToServe('storage', a.boxes));
  const handling = units(l => l.family === 'handling' && l.drives_cost);
  if (handling > 0) put('handling', R.costToServe('handling', handling));
  const trips = units(l => l.servcode === '01'), dboxes = units(l => l.family === 'movement' && l.drives_cost && l.unit === 'box');
  if (trips > 0 || dboxes > 0) put('movement', R.costToServe('movement', dboxes, { visits: trips || null }));
  const binLb = units(l => l.servcode === 'S5B');
  if (a.bins > 0) put('bin', R.costToServe('bin', a.bins, Object.assign({ visits: a.visits || null }, binLb > 0 ? { pounds: binLb } : { binCode: a.main_bin })));
  const devices = units(l => l.family === 'itad' && l.drives_cost);
  if (devices > 0) put('itad', R.costToServe('itad', devices, { visits: days(l => l.family === 'itad' && l.drives_cost) || null }));
  const shredLb = units(l => l.servcode === 'S3' || l.servcode === 'S5P');
  if (shredLb > 0) put('shred', R.costToServe('shred', shredLb));
  const shredBoxes = units(l => l.family === 'shred' && l.drives_cost && (l.unit === 'box' || l.unit === 'cubic foot'));
  if (shredBoxes > 0) put('shred', R.costToServe('shred', shredBoxes, { unit: 'box' }));
  const centre = units(l => l.family === 'labour' && l.drives_cost && CENTRE_HOURS.has(l.servcode));
  const driver = units(l => l.family === 'labour' && l.drives_cost && !CENTRE_HOURS.has(l.servcode));
  if (centre > 0) put('labour', R.costToServe('labour', centre, { isCentre: true }));
  if (driver > 0) put('labour', R.costToServe('labour', driver));
  return out;
}

export const FAMILY_NAMES = {
  storage: 'Storage', bin: 'Bin rotation', shred: 'Shredding by weight or box', handling: 'Retrieval and handling',
  movement: 'Delivery and pickup', itad: 'ITAD and media', labour: 'Labour', other: 'Fees, scanning and other',
};

// One work order's cost to serve, by the same rules as buildMargins: its items costed by family,
// one visit for the order, and the route lines (travel, time on site) counted once however many
// route families the order touches. meta maps a service code to { family, unit, drives_cost }.
// share: how many of the account's orders that day needed the route, so one visit is split
// between them rather than charged in full to each.
// day: when the account was on a Veri-Shred route that day, { day, alloc } from routemap.js. The
// route lines are then the account's real share of that route day (allocate), split between its
// route orders that day, in place of the model's average visit; so the job's cost and its route
// map show the same figure. Without it the order says it is costed at the average.
//   jobCost(R, [{ code, units, revenue }], meta, share, day) → { lines: [[name, amount, why, flag]], total, route, real }
export function jobCost(R, items, meta, share = 1, day = null) {
  const of = c => meta.get(c) || {};
  const units = pred => items.filter(i => pred(i, of(i.code))).reduce((t, i) => t + (i.units || 0), 0);
  const parts = [];
  const handling = units((i, m) => m.family === 'handling' && m.drives_cost);
  if (handling > 0) parts.push(R.costToServe('handling', handling));
  const trips = units(i => i.code === '01'), dboxes = units((i, m) => m.family === 'movement' && m.drives_cost && m.unit === 'box');
  if (trips > 0 || dboxes > 0) parts.push(R.costToServe('movement', dboxes, { visits: 1 }));
  // account level counts bins from Veri-Shred; at order level the bin codes themselves are the bins
  const bins = units((i, m) => m.family === 'bin' && /^B\d$/.test(i.code)), binLb = units(i => i.code === 'S5B' || (i.code === 'S5' && bins > 0));   // S5 on an order with bins is their weight
  if (bins > 0) parts.push(R.costToServe('bin', bins, Object.assign({ visits: 1 }, binLb > 0 ? { pounds: binLb } : { binCode: (items.find(i => of(i.code).family === 'bin') || {}).code })));
  const devices = units((i, m) => m.family === 'itad' && m.drives_cost);
  if (devices > 0) parts.push(R.costToServe('itad', devices, { visits: 1 }));
  const shredLb = units(i => i.code === 'S3' || i.code === 'S5P' || (i.code === 'S5' && bins === 0));
  if (shredLb > 0) parts.push(R.costToServe('shred', shredLb));
  const shredBoxes = units((i, m) => m.family === 'shred' && m.drives_cost && (m.unit === 'box' || m.unit === 'cubic foot'));
  if (shredBoxes > 0) parts.push(R.costToServe('shred', shredBoxes, { unit: 'box' }));
  const centre = units((i, m) => m.family === 'labour' && m.drives_cost && CENTRE_HOURS.has(i.code));
  const driver = units((i, m) => m.family === 'labour' && m.drives_cost && !CENTRE_HOURS.has(i.code));
  if (centre > 0) parts.push(R.costToServe('labour', centre, { isCentre: true }));
  if (driver > 0) parts.push(R.costToServe('labour', driver));

  const ROUTE = new Set(['Travel to site', 'Truck time', 'Time on site']);
  const seen = new Set(), lines = [];
  for (const p of parts) for (let l of p.lines) {
    if (ROUTE.has(l[0])) {
      const k = l[0] === 'Truck time' ? 'Travel to site' : l[0];
      if (seen.has(k)) continue;
      seen.add(k);
      if (day) { lines.push(...dayLines(R, day, share).filter(x => x[0] === k)); continue; }
      if (share > 1) l = [l[0], l[1] / share, `${l[2]} One visit served ${share} orders that day, so this order carries a ${share === 2 ? 'half' : share === 3 ? 'third' : `1/${share}`} share.`].concat(l.slice(3));
    }
    if (l[1] > 0.005) lines.push(l);
  }
  return { lines, total: lines.reduce((t, l) => t + l[1], 0), route: seen.size > 0, real: !!day && seen.size > 0 };
}

// The route lines of one job from its real route day: the account's travel and time on site that
// day (routemap.js allocate), shared between the account's route orders that day.
const m0 = v => '$' + Math.round(v).toLocaleString('en-US');
function dayLines(R, { day, alloc }, share) {
  const a = alloc, me = a.me, part = share > 1 ? `, and this order is one of the account's ${share} that day, so it carries ${share === 2 ? 'half' : share === 3 ? 'a third' : `1/${share}`}` : '';
  const route = /\d/.test(day.route) ? day.route : day.route.charAt(0) + day.route.slice(1).toLowerCase();
  return [
    ['Travel to site', me.travel / share,
      `Route ${route} cost ${m0(a.total)} that day. ${Math.round(R.SETTINGS.split * 100)}% of a route day is travel, ${m0(a.travel)}, split by how far each stop took the driver out of the way: this account's stops added ${me.detour != null ? me.detour.toFixed(1) : '0'} of the day's ${Math.round(a.dayMiles)} miles, ${m0(me.travel)}${part}.`, 'route'],
    ['Time on site', me.onsite / share,
      `The other ${m0(a.onsite)} of the route day is time on site, split between the ${a.visits} customer${a.visits === 1 ? '' : 's'} visited (${a.stops} stop${a.stops === 1 ? '' : 's'}): ${m0(me.onsite)} for this account${part}.`, 'route'],
  ];
}

// Cost lines grouped for the bar: storage space, handling, route, shred plant, labour.
export const PARTS = [
  ['space', 'Storage space', ['Warehouse space']],
  ['handling', 'Handling', ['Warehouse handling', 'Box handling']],
  ['route', 'Route', ['Travel to site', 'Truck time', 'Time on site']],
  ['plant', 'Shred plant', ['Shred plant', 'Plant throughput']],
  ['labour', 'Labour', ['Driver time', 'Service Centre time']],
];
export function costParts(lines) {
  const out = Object.fromEntries(PARTS.map(p => [p[0], 0]));
  for (const l of lines) { const p = PARTS.find(x => x[2].includes(l[0])); if (p) out[p[0]] += l[1]; }
  return out;
}

// What to do about an account, from its own figures (v10's rules, in order). Accounts whose cost is
// mostly route cost under review get "Check routes" rather than a verdict built on a provisional cost.
//   m: a marginSummary account; travel: its travel cost a year
export function marginAction(m, travel) {
  const pc = m.pc ?? 0;
  if (pc >= 0.5) return { tag: 'Hold', cls: 'good', why: 'Keeps half or more of what it pays.' };
  if (m.review) return { tag: 'Check routes', cls: 'review', why: 'Most of its cost is route cost, still under review until delivery routes are in the data.' };
  if (pc < 0.15 && m.revenue < 5000) return { tag: 'Drop', cls: 'bad', why: 'Too small to fix: under $5,000 a year and under 15% left.' };
  if (pc < 0.15 && m.cost > 0 && travel / m.cost > 0.4) return { tag: 'Re-route', cls: 'bad', why: 'Under 15% left, and most of the cost is getting there.' };
  if (pc < 0.15) return { tag: 'Renegotiate', cls: 'bad', why: 'Costs more to serve than its prices allow.' };
  return { tag: 'Reprice', cls: 'warn', why: 'Thin: between 15% and 50% left.' };
}

// Every account's cost lines, a year, flattened: for its travel share and its bar.
export function accountLines(R, M) {
  const byAcc = new Map();
  for (const l of M.lines) { if (!byAcc.has(l.level1)) byAcc.set(l.level1, []); byAcc.get(l.level1).push(l); }
  const out = new Map();
  for (const a of M.accounts) out.set(a.level1, Object.values(accountCosts(R, a, byAcc.get(a.level1) || [])).flat().flatMap(r => r.lines));
  return out;
}
