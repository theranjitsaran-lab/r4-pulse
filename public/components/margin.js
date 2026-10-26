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

    // cost by family
    if (a.boxes > 0) add(fam, 'cost', 'storage', R.costToServe('storage', a.boxes).total);
    const handling = units(l => l.family === 'handling' && l.drives_cost);
    if (handling > 0) add(fam, 'cost', 'handling', R.costToServe('handling', handling).total);
    const trips = units(l => l.servcode === '01'), dboxes = units(l => l.family === 'movement' && l.drives_cost && l.unit === 'box');
    if (trips > 0 || dboxes > 0) add(fam, 'cost', 'movement', R.costToServe('movement', dboxes, { visits: trips || null }).total);
    const binLb = units(l => l.servcode === 'S5B');
    if (a.bins > 0) add(fam, 'cost', 'bin', R.costToServe('bin', a.bins, Object.assign({ visits: a.visits || null }, binLb > 0 ? { pounds: binLb } : { binCode: a.main_bin })).total);
    const devices = units(l => l.family === 'itad' && l.drives_cost);
    if (devices > 0) add(fam, 'cost', 'itad', R.costToServe('itad', devices, { visits: days(l => l.family === 'itad' && l.drives_cost) || null }).total);
    const shredLb = units(l => l.servcode === 'S3' || l.servcode === 'S5P');
    if (shredLb > 0) add(fam, 'cost', 'shred', R.costToServe('shred', shredLb).total);
    const shredBoxes = units(l => l.family === 'shred' && l.drives_cost && (l.unit === 'box' || l.unit === 'cubic foot'));
    if (shredBoxes > 0) add(fam, 'cost', 'shred', R.costToServe('shred', shredBoxes, { unit: 'box' }).total);
    const centre = units(l => l.family === 'labour' && l.drives_cost && CENTRE_HOURS.has(l.servcode));
    const driver = units(l => l.family === 'labour' && l.drives_cost && !CENTRE_HOURS.has(l.servcode));
    if (centre > 0) add(fam, 'cost', 'labour', R.costToServe('labour', centre, { isCentre: true }).total);
    if (driver > 0) add(fam, 'cost', 'labour', R.costToServe('labour', driver).total);

    const revenue = a.storage_revenue + a.service_revenue;
    const cost = Object.values(fam).reduce((t, f) => t + f.cost, 0);
    accounts.push({ level1: a.level1, customer: a.customer, revenue, cost, margin: revenue - cost, fam });
  }
  return { accounts, families };
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
//   jobCost(R, [{ code, units, revenue }], meta, share) → { lines: [[name, amount, why, flag]], total, route }
export function jobCost(R, items, meta, share = 1) {
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
      if (share > 1) l = [l[0], l[1] / share, `${l[2]} One visit served ${share} orders that day, so this order carries a ${share === 2 ? 'half' : share === 3 ? 'third' : `1/${share}`} share.`].concat(l.slice(3));
    }
    if (l[1] > 0.005) lines.push(l);
  }
  return { lines, total: lines.reduce((t, l) => t + l[1], 0), route: seen.size > 0 };
}
