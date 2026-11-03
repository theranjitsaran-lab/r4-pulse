// Gross margin per account and per line of business, from the /api/margin fixture and
// model/rates.js. The same arithmetic as scripts/prompt4_before_after.js, so the screens and the
// checks agree. Revenue is as invoiced over the last twelve months; cost is built from volumes.
//
//   const book = buildMargins(R, M, { exclude: [6714] })
//   book.accounts: [{ level1, customer, revenue, cost, margin, fam: { family: { revenue, cost } } }]
//   book.families: { family: { revenue, cost } }   'other' is revenue with no cost family (fees, scanning)
'use strict';

import * as Fmt from './format.js';
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

// A flat-fee account's fee over the year, else 0. The fee is billed on code IR and its bin rotations at $0
// (data rule 12), so the money and the route cost sit on different orders: an order has no margin of its own.
export function flatFeeYear(lines) {
  const fee = lines.filter(l => l.servcode === 'IR').reduce((t, l) => t + l.revenue, 0);
  const rotations = lines.filter(l => /^B\d$/.test(l.servcode));
  return fee > 0 && rotations.some(l => l.units > 0) && rotations.every(l => !l.revenue) ? fee : 0;
}

// Every job of one account, costed so the jobs add up to the line the margin shows. Nothing is costed twice:
// each working line of accountCosts is shared out to the jobs by what drives it.
//   route lines   its real share of each route day (routecost.js daily), split between its jobs that day. A
//                 route day with no billed job on this line stays in unallocated, and a job on a day with no
//                 stop carries no route cost and says so. With no route days: the average visit, by job day.
//   every other   by the job's own units of what drives the line: movements, pounds, boxes, hours.
// orders: [{ woid, date, items: [{ code, units, revenue }] }] from customerJobs, tagged as margin() tags them.
// Returns { [family]: { revenue, cost, jobs, unallocated, why, working } } and noLine: invoiced service with no line.
const ROUTE_NAMES = new Set(['Travel to site', 'Truck time', 'Time on site']);
const sayDay = t => new Date(t + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const UNIT_WORD = { 'Truck hours': 'hours', 'Drive to the job': 'hours', 'Warehouse handling': 'movements', 'Box handling': 'boxes', 'Shred plant': 'lb', 'Plant throughput': 'devices', 'Driver time': 'hours', 'Service Centre time': 'hours' };
const famKey = l => l && l.family && l.family !== 'none' ? l.family : 'other';
export function accountJobs(R, acct, lines, orders, { daily = null, moveDaily = null } = {}) {
  const meta = new Map(lines.map(l => [l.servcode, l])), m = c => meta.get(c) || {};
  const working = accountCosts(R, acct, lines), fams = {};
  const fam = f => fams[f] || (fams[f] = { family: f, revenue: 0, cost: 0, jobs: [], unallocated: 0, why: [], working: [] });
  for (const l of lines) if (famKey(l) !== 'storage') fam(famKey(l)).revenue += l.revenue;
  if (acct.storage_revenue) fam('storage').revenue += acct.storage_revenue;
  for (const o of orders) {
    const by = {};
    for (const i of o.items) { const f = famKey(m(i.code)); if (f !== 'storage') (by[f] || (by[f] = [])).push(i); }
    for (const [f, items] of Object.entries(by)) fam(f).jobs.push({ woid: o.woid, date: o.date, items, revenue: items.reduce((t, i) => t + (i.revenue || 0), 0), lines: [], cost: 0, margin: 0 });
  }
  const unitsOf = (j, pred) => j.items.reduce((t, i) => pred(i, m(i.code)) ? t + (i.units || 0) : t, 0);
  const lbOnDate = new Map();
  for (const o of orders) for (const i of o.items) if (i.code === 'S5B') lbOnDate.set(o.date, (lbOnDate.get(o.date) || 0) + (i.units || 0));
  const money = v => Fmt.money(v);
  for (const [f, results] of Object.entries(working)) {
    const F = fam(f), js = F.jobs, onDate = new Map();
    for (const j of js) onDate.set(j.date, (onDate.get(j.date) || 0) + 1);
    const dayCount = onDate.size;
    const source = f === 'bin' && R.routeFor && R.routeFor(acct.level1) ? daily : f === 'movement' && R.movementFor && R.movementFor(acct.level1) ? moveDaily : null;
    // the shares of one working line, and what each share is
    const share = (l, name) => {
      const amount = l[1];
      F.working.push(l);
      if (!js.length) { F.unallocated += amount; return; }
      let weight, total, say;
      if (ROUTE_NAMES.has(name)) {
        if (source) {
          const field = name === 'Time on site' ? 'onsite' : 'travel';
          total = Object.values(source).reduce((t, d) => t + d[field], 0);
          weight = j => { const d = source[j.date]; return d ? d[field] / onDate.get(j.date) : 0; };
          say = j => { const d = source[j.date], n = onDate.get(j.date); return d ? `Its share of the route day on ${sayDay(j.date)}${n > 1 ? `, split between its ${n} jobs that day` : ''}.` : `No stop recorded for this account on ${sayDay(j.date)}, so no route cost falls on this job.`; };
        } else {
          total = dayCount;
          weight = j => 1 / onDate.get(j.date);
          say = () => `The model's average visit: ${money(amount)} over ${dayCount} job days. This line has no route days to read.`;
        }
      } else {
        const pred = name === 'Truck hours' || name === 'Drive to the job' ? i => i.code === 'S0'
          : name === 'Warehouse handling' ? (i, x) => x.family === 'handling' && x.drives_cost
          : name === 'Box handling' ? (i, x) => x.family === 'movement' && x.drives_cost && x.unit === 'box'
          : name === 'Plant throughput' ? (i, x) => x.family === 'itad' && x.drives_cost
          : name === 'Driver time' ? (i, x) => x.family === 'labour' && x.drives_cost && !CENTRE_HOURS.has(i.code)
          : name === 'Service Centre time' ? (i, x) => x.family === 'labour' && x.drives_cost && CENTRE_HOURS.has(i.code)
          : f === 'shred' ? (l[2].includes(' lb') || l[2].includes('pound') ? i => i.code === 'S3' || i.code === 'S5P' : (i, x) => x.family === 'shred' && x.drives_cost && (x.unit === 'box' || x.unit === 'cubic foot'))
          : i => /^B\d$/.test(i.code);
        // pounds on S5 sit on the date's bins, not always on the same order
        if (name === 'Shred plant' && f === 'bin' && lbOnDate.size) { weight = j => (lbOnDate.get(j.date) || 0) / onDate.get(j.date); total = js.reduce((t, j) => t + weight(j), 0); }
        else { weight = j => unitsOf(j, pred); total = js.reduce((t, j) => t + weight(j), 0); }
        const word = name === 'Shred plant' && f === 'shred' && !(l[2].includes(' lb') || l[2].includes('pound')) ? 'boxes' : name === 'Shred plant' && f === 'bin' && !lbOnDate.size ? 'bins' : UNIT_WORD[name] || 'units';
        say = j => { const w = weight(j); return `${Fmt.grouped(Math.round(w * 10) / 10)} of the line's ${Fmt.grouped(Math.round(total))} ${word} at ${Fmt.money(amount / total, { dp: amount / total < 1 ? 4 : 2 })}.`; };
      }
      if (!total || Math.abs(total) < 1e-9) { F.unallocated += amount; F.why.push(`${name}: ${money(amount)} has no job carrying what drives it.`); return; }
      let given = 0;
      for (const j of js) {
        const v = amount * weight(j) / total;
        given += v;
        if (Math.abs(v) > 0.005 || (ROUTE_NAMES.has(name) && source)) j.lines.push([name, v, say(j), l[3]]);
        if (source && ROUTE_NAMES.has(name) && !source[j.date]) j.noRoute = true;
        if (source && ROUTE_NAMES.has(name) && source[j.date]) j.real = true;
      }
      if (Math.abs(amount - given) > 0.005) { F.unallocated += amount - given; F.why.push(`${name}: ${money(amount - given)} on route days with no billed job on this line.`); }
    };
    for (const r of results) { F.cost += r.total; for (const l of r.lines) share(l, l[0]); }
  }
  const flat = flatFeeYear(lines);
  for (const F of Object.values(fams)) for (const j of F.jobs) {
    j.lines = j.lines.filter(l => Math.abs(l[1]) > 0.005);
    j.cost = j.lines.reduce((t, l) => t + l[1], 0); j.margin = j.revenue - j.cost;
    j.route = j.lines.some(l => ROUTE_NAMES.has(l[0]));
    j.flatFee = !!flat && F.family === 'bin' && !j.revenue;
  }
  const lined = Object.values(fams).filter(F => F.family !== 'storage').reduce((t, F) => t + F.revenue, 0);
  return { fams, noLine: (acct.service_revenue || 0) - lined, flat };
}

// What would move an account's margin or one of its lines: each on its own, in dollars a year, from the
// functions the rest of the app prices with. They overlap, so they are never added together.
//   row: its customerBook row; B: the book. family: one line, or all of them
export function marginLevers(R, acct, lines, F, { row = null, position = null, family = null } = {}) {
  const out = [], fams = Object.values(F.fams).filter(x => !family || x.family === family);
  for (const x of fams) {
    if (!(x.cost > 0) && !(x.revenue > 0)) continue;
    const name = FAMILY_NAMES[x.family] || x.family;
    const p = row && position && row.fam && row.fam[x.family] ? position(row, x.family) : null;
    if (p && p.toMedian > 250 && p.pct < .5) out.push({ kind: 'price', family: x.family, title: `${name}: move to its peers' median`, say: `${p.n} accounts of a similar size pay a median ${Fmt.money(p.med, { dp: p.med < 1 ? 3 : 2 })} a ${p.unit}; it pays ${Fmt.money(row.fam[x.family].price, { dp: row.fam[x.family].price < 1 ? 3 : 2 })}.`, worth: p.toMedian });
    if (x.cost > 0 && x.revenue < x.cost / .6 && x.family !== 'other') out.push({ kind: 'price', family: x.family, title: `${name}: price for a 40% margin`, say: `${Fmt.money(x.revenue)} of revenue on ${Fmt.money(x.cost)} to serve est.`, worth: x.cost / .6 - x.revenue });
  }
  // fewer, fuller visits: the same units on half the stops, costed the way a quote is
  const S = R.SETTINGS, binF = F.fams.bin;
  if (binF && (!family || family === 'bin') && acct.bins > 0 && acct.visits >= 24) {
    const r = R.routeFor && R.routeFor(acct.level1), lb = lines.filter(l => l.servcode === 'S5B').reduce((t, l) => t + l.units, 0), base = lb > 0 ? { pounds: lb } : { binCode: acct.main_bin };
    let saving = 0;
    if (r) {
      const mins = r.stops * S.stopMin + r.services * S.serviceMin, perMin = mins > 0 ? r.onsite / mins : 0, tps = r.travel / r.stops;
      const at = v => v * tps + v * perMin * (S.stopMin + S.serviceMin * r.services / v);
      saving = (at(r.stops) - at(r.stops / 2)) * acct.bins / r.services;
    } else saving = R.costToServe('bin', acct.bins, { visits: acct.visits, ...base }).total - R.costToServe('bin', acct.bins, { visits: Math.round(acct.visits / 2), ...base }).total;
    if (saving > 0) out.push({ kind: 'ops', family: 'bin', title: `Bin service: half as many visits, ${Fmt.grouped(Math.round(acct.visits / 2))} a year`, say: 'The same bins on fewer stops, each one fuller.', worth: saving });
  }
  const moveF = F.fams.movement, trips = lines.filter(l => l.servcode === '01').reduce((t, l) => t + l.units, 0);
  if (moveF && (!family || family === 'movement') && trips >= 24) {
    const route = R.movementFor && R.movementFor(acct.level1), travel = (moveF.working || []).filter(l => ROUTE_NAMES.has(l[0])).reduce((t, l) => t + l[1], 0);
    if (travel > 0) out.push({ kind: 'ops', family: 'movement', title: `Delivery: batch into half as many trips, ${Fmt.grouped(Math.round(trips / 2))} a year`, say: route ? 'The same boxes on fewer stops, from its own delivery days.' : "The same boxes on fewer stops, at the model's average visit.", worth: travel / 2 });
  }
  return out.filter(l => l.worth > 0).sort((a, b) => b.worth - a.worth);
}

// The one definition of a margin, used on every button, pill, tile and pop-out: Healthy, Normal, Thin, from the two
// cut-offs on Settings (model/rates.js SETTINGS marginHealthy and marginThin). g, a, r are its colours.
export function marginBand(R, m) {
  if (m == null) return { cls: 'n', word: 'Not costed' };
  const S = R.SETTINGS;
  return m < 0 ? { cls: 'r', word: 'Thin, losing money' } : m < S.marginThin ? { cls: 'r', word: 'Thin' } : m < S.marginHealthy ? { cls: 'a', word: 'Normal' } : { cls: 'g', word: 'Healthy' };
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
    // bins costed from the account's real route days are not under review; the average visit is
    const realBins = !!(R.routeFor && R.routeFor(m.level1));
    const realMove = !!(R.movementFor && R.movementFor(m.level1));
    const routeCost = ROUTE_FAMILIES.filter(f => !(f === 'bin' && realBins) && !(f === 'movement' && realMove)).reduce((t, f) => t + ((m.fam[f] || {}).cost || 0), 0);
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
  if (trips > 0 || dboxes > 0) put('movement', R.costToServe('movement', dboxes, { visits: trips || null, route: R.movementFor ? R.movementFor(a.level1) : null }));
  const binLb = units(l => l.servcode === 'S5B');
  // bins: from the account's real route days when they are known (components/routecost.js), else the average visit
  if (a.bins > 0) put('bin', R.costToServe('bin', a.bins, Object.assign({ visits: a.visits || null, route: R.routeFor ? R.routeFor(a.level1) : null }, binLb > 0 ? { pounds: binLb } : { binCode: a.main_bin })));
  const devices = units(l => l.family === 'itad' && l.drives_cost);
  if (devices > 0) put('itad', R.costToServe('itad', devices, { visits: days(l => l.family === 'itad' && l.drives_cost) || null }));
  const shredLb = units(l => l.servcode === 'S3' || l.servcode === 'S5P');
  if (shredLb > 0) put('shred', R.costToServe('shred', shredLb));
  const shredBoxes = units(l => l.family === 'shred' && l.drives_cost && (l.unit === 'box' || l.unit === 'cubic foot'));
  if (shredBoxes > 0) put('shred', R.costToServe('shred', shredBoxes, { unit: 'box' }));
  const centre = units(l => l.family === 'labour' && l.drives_cost && CENTRE_HOURS.has(l.servcode));
  const driver = units(l => l.family === 'labour' && l.drives_cost && !CENTRE_HOURS.has(l.servcode) && l.servcode !== 'S0');
  if (centre > 0) put('labour', R.costToServe('labour', centre, { isCentre: true }));
  if (driver > 0) put('labour', R.costToServe('labour', driver));
  const truck = units(l => l.servcode === 'S0');
  if (truck > 0) put('labour', R.costToServe('labour', truck, { truck: true, jobs: days(l => l.servcode === 'S0') || 1 }));
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
  const trips = units(i => i.code === '01' && i.units <= 1), dboxes = units((i, m) => i.code === '01' ? i.units > 1 : m.family === 'movement' && m.drives_cost && m.unit === 'box');
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
  const driver = units((i, m) => m.family === 'labour' && m.drives_cost && !CENTRE_HOURS.has(i.code) && i.code !== 'S0');
  if (centre > 0) parts.push(R.costToServe('labour', centre, { isCentre: true }));
  if (driver > 0) parts.push(R.costToServe('labour', driver));
  const truck = units(i => i.code === 'S0');
  if (truck > 0) parts.push(R.costToServe('labour', truck, { truck: true, jobs: 1 }));

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
const m0 = v => Fmt.money(v, { hyphen: true });
function dayLines(R, { day, alloc }, share) {
  const a = alloc, me = a.me, part = share > 1 ? `, and this order is one of the account's ${share} that day, so it carries ${share === 2 ? 'half' : share === 3 ? 'a third' : `1/${share}`}` : '';
  const route = /\d/.test(day.route) ? day.route : day.route.charAt(0) + day.route.slice(1).toLowerCase();
  return [
    ['Travel to site', me.travel / share,
      `Route ${route} cost ${m0(a.total)} that day, shared between its ${a.stops} stop${a.stops === 1 ? '' : 's'} by minutes. This account's stops added ${me.detour != null ? Fmt.fixed(me.detour, 1) : '0'} of the day's ${Math.round(a.dayMiles)} miles, ${Math.round(me.driveMin)} minutes at ${R.SETTINGS.mph} mph: ${m0(me.travel)}${part}.`, 'route'],
    ['Time on site', me.onsite / share,
      `${Math.round(me.dropMin)} minutes on site (${R.SETTINGS.stopMin} at each stop, ${R.SETTINGS.serviceMin} a service, ${me.services} service${me.services === 1 ? '' : 's'}) out of the day's ${Math.round(a.minutes.drive + a.minutes.drop)}: ${m0(me.onsite)}${part}.`, 'route'],
  ];
}

// Cost lines grouped for the bar: storage space, handling, route, shred plant, labour.
export const PARTS = [
  ['space', 'Storage space', ['Warehouse space']],
  ['handling', 'Handling', ['Warehouse handling', 'Box handling']],
  ['route', 'Route', ['Travel to site', 'Truck time', 'Time on site', 'Truck hours', 'Drive to the job']],
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
