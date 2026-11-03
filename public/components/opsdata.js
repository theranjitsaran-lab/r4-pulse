// Operations for a period, from the done stops since January 2025 (routehistory query) and the costed route days
// (components/routecost.js). The server runs it (server/views.js, view/operations) and model/ops.test.js holds it together.
//   periods(latest, date)                 Day to Year, each with the period before and whether the history covers it
//   opsPeriod(rows, Z, R, period)         the figures, routes, postcodes and road stretches for one period
//   opsMonths(rows, R)                    services a route day and route cost a service, month by month
//   costlyAreas({ rc, AR, M, Z, R })      far areas with a year of cost, revenue, margin and the moves that would improve them
//   opsPoints(view, costly)               the three lit points, from computed fields only
//
// The stop order is not in the data: rorder is one number for the whole day, and porder and sorder run no closer to a
// sensible round than a shuffle (checked 3 November 2026). Lines therefore follow likelyRound, and say so on screen.
import * as Fmt from './format.js';
import { roadPath, miles, YARD, allocate, cheaper, NEAR_DAYS } from './routemap.js';
import { marginBand } from './margin.js';

export const HISTORY_FROM = '2025-01-01', FAR_MILES = 20, MIN_VISITS = 12;
const WITHIN = 10;
export const BANDS = [[0, 5, 'Within 5 miles'], [5, 10, '5 to 10'], [10, 20, '10 to 20'], [20, 35, '20 to 35'], [35, Infinity, 'Beyond 35']];
const D = s => new Date(s + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));
const addMonths = (s, n) => { const d = D(s.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); };
const endOf = s => addDays(addMonths(s, 1), -1);
const mon = (s, year) => D(s).toLocaleDateString('en-GB', { month: 'short', ...(year ? { year: '2-digit' } : {}), timeZone: 'UTC' });
const dayName = s => D(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const span = (a, b) => a.slice(0, 7) === b.slice(0, 7) ? D(a).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }) : `${mon(a)} to ${mon(b)}`;

// The latest month counts once it has run to its 28th; before that a month is the one before, so a period is never a few days.
export function periods(latest, date = null) {
  const lastMonth = +latest.slice(8) >= 28 ? latest.slice(0, 7) + '-01' : addMonths(latest, -1);
  const months = (n, label, key) => {
    const from = addMonths(lastMonth, 1 - n), to = endOf(lastMonth), prevFrom = addMonths(from, -n), prevTo = addDays(from, -1);
    const twelve = n === 12;
    return { key, label, from, to, prevFrom, prevTo, name: twelve ? `${mon(from, true)} to ${mon(to, true)}` : span(from, to), prevName: twelve ? 'the year before' : span(prevFrom, prevTo), yearFrom: twelve ? null : addMonths(from, -12), yearTo: twelve ? null : endOf(addMonths(lastMonth, -12)) };
  };
  const day = date || latest, monday = addDays(day, -((D(day).getUTCDay() + 6) % 7));
  const out = {
    day: { key: 'day', label: 'Day', from: day, to: day, prevFrom: addDays(day, -7), prevTo: addDays(day, -7), name: dayName(day), prevName: `the ${D(day).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} before` },
    week: { key: 'week', label: 'Week', from: monday, to: addDays(monday, 6), prevFrom: addDays(monday, -7), prevTo: addDays(monday, -1), name: `Week of ${D(monday).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}`, prevName: 'the week before' },
    month: months(1, 'Month', 'month'), q: months(3, '3 months', 'q'), h: months(6, '6 months', 'h'), y: months(12, 'Year', 'y'),
  };
  for (const p of Object.values(out)) {
    p.inName = p.key === 'week' ? p.name.replace('Week', 'the week') : p.name;
    p.compare = p.prevFrom >= HISTORY_FROM;
    if (p.yearFrom && p.yearFrom < HISTORY_FROM) { p.yearFrom = null; p.yearTo = null; }
    if (!p.compare) p.why = 'History starts in January 2025, so there is no full period before this one';
  }
  return out;
}

// the shortest likely round from the yard: nearest next, then undoing any crossing. Postcode centres, straight miles.
const rounds = new Map();
export function likelyRound(postcodes, Z) {
  const set = [...new Set(postcodes)].filter(p => Z[p]).sort(), key = set.join();
  if (rounds.has(key)) return rounds.get(key);
  const left = set.slice(), t = [];
  let at = YARD;
  while (left.length) { let b = 0, bd = Infinity; left.forEach((p, i) => { const m = miles(at, Z[p]); if (m < bd) { bd = m; b = i; } }); const p = left.splice(b, 1)[0]; t.push(p); at = Z[p]; }
  const len = l => { let m = 0, a = YARD; for (const p of l) { m += miles(a, Z[p]); a = Z[p]; } return m + miles(a, YARD); };
  for (let better = t.length > 2; better;) {
    better = false;
    for (let i = 0; i < t.length - 1; i++) for (let j = i + 1; j < t.length; j++) { const n = [...t.slice(0, i), ...t.slice(i, j + 1).reverse(), ...t.slice(j + 1)]; if (len(n) < len(t) - 1e-6) { t.splice(0, t.length, ...n); better = true; } }
  }
  rounds.set(key, t);
  return t;
}

const inRange = (rows, a, b) => rows.filter(r => r.date >= a && r.date <= b);
const pc5 = p => p ? String(p).slice(0, 5) : null;
const routeWord = r => /\d/.test(r) ? r : r.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');

// the plain figures for a set of stops
export function tally(rows, Z, R) {
  const days = new Set(), routes = new Map();
  let services = 0, located = 0, near = 0;
  for (const r of rows) {
    const k = r.date + '|' + r.route;
    days.add(k); services += r.services;
    const x = routes.get(r.route) || routes.set(r.route, { route: r.route, services: 0, days: new Set(), stops: 0, drivers: new Map() }).get(r.route);
    x.services += r.services; x.days.add(k); x.stops++;
    if (r.driver) x.drivers.set(r.driver, (x.drivers.get(r.driver) || 0) + r.services);
    const pt = Z[pc5(r.postcode)];
    if (pt) { located += r.services; if (miles(YARD, pt) < WITHIN) near += r.services; }
  }
  return {
    services, routeDays: days.size, stops: rows.length, perDay: days.size ? services / days.size : null, located,
    within10: located ? near / located : null, costPerService: services ? R.routeDayNow() * days.size / services : null,
    routes: [...routes.values()].map(x => ({ route: x.route, driver: [...x.drivers].sort((a, b) => b[1] - a[1]).map(d => d[0])[0] || null, services: x.services, routeDays: x.days.size, stops: x.stops, perDay: x.services / x.days.size })),
  };
}

// every road stretch driven in a set of stops, with how many route days used it, in all and by route. A leg with no road
// between its postcodes is one straight stretch, marked.
export function stretches(rows, Z) {
  const days = new Map(), S = new Map();
  for (const r of rows) { const pt = pc5(r.postcode); if (!Z[pt]) continue; const k = r.date + '|' + r.route; (days.get(k) || days.set(k, { route: r.route, pcs: [] }).get(k)).pcs.push(pt); }
  const q = v => Math.round(v * 1e4) / 1e4;
  for (const d of days.values()) {
    const way = [YARD, ...likelyRound(d.pcs, Z).map(p => Z[p]), YARD], seen = new Set();
    for (let i = 1; i < way.length; i++) {
      const rp = roadPath(way[i - 1], way[i]), pts = rp ? rp.pts : [way[i - 1], way[i]];
      for (let j = 1; j < pts.length; j++) {
        const a = [q(pts[j - 1][0]), q(pts[j - 1][1])], b = [q(pts[j][0]), q(pts[j][1])], ka = a.join(), kb = b.join();
        if (ka === kb) continue;
        const key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        if (seen.has(key)) continue;
        seen.add(key);
        const x = S.get(key) || S.set(key, { a, b, n: 0, r: {}, straight: !rp }).get(key);
        x.n++; x.r[d.route] = (x.r[d.route] || 0) + 1;
      }
    }
  }
  return [...S.values()];
}

// postcodes busiest first, for the shading
function postcodesOf(rows, Z) {
  const m = new Map();
  for (const r of rows) { const p = pc5(r.postcode); if (!Z[p]) continue; const x = m.get(p) || m.set(p, { postcode: p, services: 0, customers: new Set(), visits: new Set() }).get(p); x.services += r.services; if (r.level1 != null) x.customers.add(r.level1); x.visits.add(r.date + '|' + r.route + '|' + r.level1); }
  return [...m.values()].map(x => ({ postcode: x.postcode, services: x.services, customers: x.customers.size, visits: x.visits.size })).sort((a, b) => b.services - a.services);
}

export function opsPeriod(rows, Z, R, p) {
  const here = inRange(rows, p.from, p.to), before = p.compare ? inRange(rows, p.prevFrom, p.prevTo) : [];
  const now = tally(here, Z, R), prev = p.compare ? tally(before, Z, R) : null, year = p.yearFrom ? tally(inRange(rows, p.yearFrom, p.yearTo), Z, R) : null;
  const prevBy = new Map((prev ? prev.routes : []).map(r => [r.route, r]));
  const routes = now.routes.map(r => ({ ...r, prev: prevBy.get(r.route) || null })).sort((a, b) => b.services - a.services);
  // what moved most, in route days; a route that stopped still counts
  const changes = prev ? [...routes.map(r => ({ route: r.route, now: r.routeDays, before: r.prev ? r.prev.routeDays : 0 })), ...prev.routes.filter(r => !now.routes.some(x => x.route === r.route)).map(r => ({ route: r.route, now: 0, before: r.routeDays }))]
    .map(c => ({ ...c, d: c.now - c.before })).filter(c => c.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 5) : [];
  const postcodes = postcodesOf(here, Z);
  const bands = BANDS.map(([a, b, l]) => { const v = postcodes.filter(x => { const m = miles(YARD, Z[x.postcode]); return m >= a && m < b; }).reduce((t, x) => t + x.services, 0); return { l, services: v, share: now.located ? v / now.located : 0 }; });
  const { routes: _n, ...nowFigures } = now, trim = t => t && (({ routes: _r, ...rest }) => rest)(t);
  return { period: p, now: nowFigures, prev: trim(prev), year: trim(year), routes, changes, postcodes, bands, stretches: stretches(here, Z), prevStretches: p.compare ? stretches(before, Z) : [] };
}

// month by month, complete months only
export function opsMonths(rows, R) {
  const m = new Map();
  for (const r of rows) { const k = r.date.slice(0, 7) + '-01'; const x = m.get(k) || m.set(k, { month: k, services: 0, days: new Set() }).get(k); x.services += r.services; x.days.add(r.date + '|' + r.route); }
  return [...m.values()].sort((a, b) => a.month < b.month ? -1 : 1).map(x => ({ month: x.month, services: x.services, routeDays: x.days.size, perDay: x.services / x.days.size, cost: R.routeDayNow() * x.days.size / x.services }));
}

// the same months a year apart, only where both exist: is the work denser than a year ago?
export function density(months) {
  const by = new Map(months.map(m => [m.month, m])), last = months.slice(-12);
  const both = last.filter(m => by.has(addMonths(m.month, -12)));
  const sum = (l, f) => l.reduce((t, x) => t + f(x), 0), was = both.map(m => by.get(addMonths(m.month, -12)));
  const now = both.length ? sum(both, x => x.services) / sum(both, x => x.routeDays) : null, then = both.length ? sum(was, x => x.services) / sum(was, x => x.routeDays) : null;
  return { rows: last.map(m => ({ ...m, before: by.get(addMonths(m.month, -12)) || null })), now, then, change: then ? now / then - 1 : null, from: both.length ? both[0].month : null, to: both.length ? both[both.length - 1].month : null };
}

// ── far areas ──
// A year of each far area's stops as its route days share them out (routecost.js), and what the work there billed: each
// sub-account's lines at this postcode (arearevenue query), plus any with no postcode shared by the account's services here.
// Plant pounds from S5 where the account has it (data rule 6), else what Veri-Shred recorded at the stops.
export function costlyAreas({ rc, AR, M, Z, R }, { minVisits = MIN_VISITS, farMiles = FAR_MILES } = {}) {
  const list = (rc && rc.dayList) || [];
  const areas = new Map(), acct = new Map();
  let bookTravel = 0, bookVisits = 0;
  for (const d of list) {
    const seen = new Set();
    for (const s of d.stops) {
      if (s.delivery) continue;
      acct.set(s.level1, (acct.get(s.level1) || 0) + (s.services || 0));
      bookTravel += s.travel || 0;
      if (!seen.has(s.level1)) { seen.add(s.level1); bookVisits++; }
      if (!s.postcode || !Z[s.postcode]) continue;
      const a = areas.get(s.postcode) || areas.set(s.postcode, { postcode: s.postcode, keys: new Set(), stops: 0, services: 0, cost: 0, travel: 0, onsite: 0, driveMin: 0, dropMin: 0, pounds: 0, who: new Map(), routes: new Map(), days: [] }).get(s.postcode);
      a.keys.add(d.date + '|' + d.route + '|' + s.level1); a.stops++; a.services += s.services || 0; a.cost += s.cost; a.travel += s.travel; a.onsite += s.onsite; a.driveMin += s.driveMin; a.dropMin += s.dropMin; a.pounds += s.pounds || 0;
      a.who.set(s.level1, (a.who.get(s.level1) || 0) + (s.services || 0));
      a.routes.set(d.route, (a.routes.get(d.route) || 0) + 1);
      if (a.days[a.days.length - 1] !== d) a.days.push(d);
    }
  }
  const bookPerVisit = bookVisits ? bookTravel / bookVisits : 0;
  const site = new Map(), rest = new Map(), s5 = new Map();
  for (const r of AR || []) {
    s5.set(r.level1, (s5.get(r.level1) || 0) + (r.pounds || 0));
    const m = r.postcode ? site : rest, k = r.postcode ? r.level1 + '|' + r.postcode : r.level1, x = m.get(k) || m.set(k, { revenue: 0, pounds: 0 }).get(k);
    x.revenue += r.revenue || 0; x.pounds += r.pounds || 0;
  }
  const name = new Map((M.accounts || []).map(a => [a.level1, a.customer]));
  const history = list.map(d => ({ date: d.date, route: d.route, postcode_list: [...new Set(d.stops.filter(s => !s.delivery && s.postcode).map(s => s.postcode))].join(' ') }));
  const out = [];
  for (const a of areas.values()) {
    const visits = a.keys.size, mi = miles(YARD, Z[a.postcode]);
    if (visits < minVisits || mi < farMiles) continue;
    let revenue = 0, pounds = 0, usedS5 = false;
    for (const [l, n] of a.who) {
      const own = site.get(l + '|' + a.postcode), shared = rest.get(l), share = n / (acct.get(l) || 1);
      revenue += (own ? own.revenue : 0) + (shared ? shared.revenue * share : 0);
      const lb = (own ? own.pounds : 0) + (shared ? shared.pounds * share : 0);
      if (lb > 0) usedS5 = true;
      pounds += lb;
    }
    if (!usedS5) pounds = a.pounds;
    const plant = pounds * R.RATES.shredPlant.v, left = revenue - a.cost - plant, pc = revenue > 0 ? left / revenue : null, band = marginBand(R, pc);
    const who = [...a.who].sort((x, y) => y[1] - x[1]).map(([level1, services]) => ({ level1, services, name: name.get(level1) || String(level1) }));
    const area = {
      postcode: a.postcode, miles: mi, visits, stops: a.stops, services: a.services, cost: a.cost, travel: a.travel, onsite: a.onsite, driveMin: a.driveMin, dropMin: a.dropMin,
      revenue, plant, pounds, poundsFrom: usedS5 ? 'S5' : 'stops', left, margin: pc, band: { cls: band.cls, word: band.word },
      perVisit: a.cost / visits, revenuePerVisit: revenue / visits, who, routes: [...a.routes].sort((x, y) => y[1] - x[1]).map(([route, stops]) => ({ route, stops })),
    };
    area.options = moves(area, a, { R, Z, history, bookPerVisit });
    area.best = area.band.cls === 'g' || !area.options.length ? null : area.options[0];
    out.push(area);
  }
  return out.sort((x, y) => y.cost - x.cost);
}

// What would improve an area, each sized on its own from the cost model, never added together.
function moves(area, a, { R, Z, history, bookPerVisit }) {
  const stopMin = R.SETTINGS.stopMin, perMinute = (area.driveMin + area.dropMin) > 0 ? area.cost / (area.driveMin + area.dropMin) : 0;
  const out = [];
  // ride: on each of its days, another route within reach and days of it takes the stop for the extra miles
  let ride = 0, carried = 0;
  const riders = new Map();
  for (const d of a.days) {
    const mine = d.stops.filter(s => !s.delivery && s.postcode === area.postcode);
    d.stops.forEach(s => { s.mine = mine.includes(s); });
    const best = cheaper(d, allocate(R, d), history, Z, null).nearby[0];
    d.stops.forEach(s => { delete s.mine; });
    if (best && best.saving > 0) { ride += best.saving; carried++; riders.set(best.route, (riders.get(best.route) || 0) + 1); }
  }
  const rider = [...riders].sort((x, y) => y[1] - x[1])[0];
  if (rider && ride > 0) out.push({ key: 'ride', title: `Book it on ${routeWord(rider[0])}'s days`, say: `On ${carried} of its ${a.days.length} days another route passed within two miles within ${NEAR_DAYS} days, ${routeWord(rider[0])} most often.`, saving: ride, route: rider[0] });
  const fewer = area.travel / 2 + area.stops / 2 * stopMin * perMinute;
  if (fewer > 0) out.push({ key: 'fewer', title: 'Fewer, fuller visits', say: `${Fmt.count(area.visits)} visits a year become ${Fmt.count(Math.ceil(area.visits / 2))}; the same services, more on each.`, saving: fewer });
  const over = area.travel / area.visits - bookPerVisit;
  if (over > 0) out.push({ key: 'charge', title: 'A distance charge', say: `${Fmt.money(over)} a visit covers what its drive costs above the book's ${Fmt.money(bookPerVisit)}.`, saving: over * area.visits });
  out.push({ key: 'neighbour', title: 'Add a neighbour', say: `A second customer in ${area.postcode} on the same visits takes half the drive, before anything it bills.`, saving: area.travel / 2 });
  return out.filter(o => o.saving > 0).sort((x, y) => y.saving - x.saving);
}

// ── the three points ──
const by = (now, then) => now == null || !then ? null : now / then - 1;
const move = v => v == null ? '' : Math.abs(v) < .01 ? 'level with' : `${v > 0 ? 'up' : 'down'} ${Fmt.pct(v, { abs: true })} on`;
export function opsPoints(V, costly = null) {
  const { now, prev, year, period: p } = V, pts = [];
  if (!now.services) return [{ key: 'none', tone: 'a', lead: `No work done in ${p.inName}.`, rest: '' }];
  const dPrev = prev ? by(now.perDay, prev.perDay) : null, dYear = year ? by(now.perDay, year.perDay) : null;
  const head = `${Fmt.count(now.services)} services on ${Fmt.count(now.routeDays)} route days,`;
  pts.push({ key: 'work', tone: dYear != null && dYear <= -.1 ? 'a' : 'g', lead: head, rest: `${Fmt.fixed(now.perDay, 1)} a route day${dPrev != null ? `, ${move(dPrev)} ${p.prevName}` : ''}${dYear != null ? `, ${move(dYear)} ${p.key === 'month' ? 'the same month' : 'the same months'} a year ago` : ''}.` });
  const c = V.changes[0];
  if (c) pts.push({ key: 'route', tone: c.d < 0 ? 'a' : 'g', lead: `${routeWord(c.route)} moved most:`, rest: `${Fmt.count(c.now)} route days against ${Fmt.count(c.before)} in ${p.prevName}.` });
  else { const top = V.routes[0]; pts.push({ key: 'route', tone: 'g', lead: `${routeWord(top.route)} carried most:`, rest: `${Fmt.count(top.services)} services on ${Fmt.count(top.routeDays)} route days.` }); }
  const thin = (costly || []).filter(a => a.band && a.band.cls === 'r');
  if (costly && costly.length) pts.push({ key: 'far', tone: thin.length ? 'r' : 'g', lead: `${Fmt.count(thin.length)} of ${Fmt.count(costly.length)} far areas are thin,`, rest: `over twelve months est.${thin[0] ? ` The largest route cost among them is ${thin[0].postcode}, ${Fmt.money(thin[0].cost, { short: true })} a year.` : ''}` });
  else pts.push({ key: 'near', tone: 'g', lead: `${Fmt.pct(now.within10)} of the work is within ten miles of the yard`, rest: `in ${p.inName}.` });
  return pts;
}
