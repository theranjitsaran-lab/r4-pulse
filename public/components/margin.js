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
