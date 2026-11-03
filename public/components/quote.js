// One priced line's cost to serve, for Pricing and the quote builder (views/pricing.js) and Ask's quote
// tool (server/ask.js): the same function, so a quote in Ask matches the screen to the cent.
//   SERVICES: the service codes the cost model prices, with their family and unit
//   lineCost(R, { code, units, visits, miles, level1, postcode }, { acct, lines, Z })
//     acct: the account's margin record (fixtures/margin.json accounts), lines: its priced lines
//     returns costToServe's result with perUnit, and routeBasis for bins: 'account' (its own route days), 'nearby'
//     (route days within three miles), 'yard' (none near: its own trip), 'ride' (what the stop adds to one route),
//     'book' (the book's stop, no place chosen yet). The last two run on the route-hour rate (Settings).
//   nearestRoute · marginLabel · quoteOptions · visitParts · quoteFacts: the Quote screen's working, no DOM
import { nearbyCost, bookCost, quoteRoute } from './routecost.js';
import { miles, dist, YARD } from './routemap.js';
import * as Fmt from './format.js';

export const RIDE_MILES = 3.5;   // a route this close can carry the stop

export const SERVICES = {
  B2: { fam: 'bin', unit: 'bin service', size: 'B2' }, B3: { fam: 'bin', unit: 'bin service', size: 'B3' },
  B4: { fam: 'bin', unit: 'bin service', size: 'B4' }, B5: { fam: 'bin', unit: 'bin service', size: null },
  B6: { fam: 'bin', unit: 'bin service', size: 'B6' },
  R3: { fam: 'shredbox', unit: 'box' }, R4: { fam: 'shredbox', unit: 'box' }, R5: { fam: 'shredbox', unit: 'box' },
  S3: { fam: 'shredlb', unit: 'lb' },
  S4: { fam: 'itad', unit: 'device' }, S6: { fam: 'itad', unit: 'device' }, SR: { fam: 'itad', unit: 'device' },
  '01': { fam: 'trip', unit: 'trip' }, '02': { fam: 'handling', unit: 'box' },
  '90': { fam: 'trip', unit: 'trip', rush: true }, '20': { fam: 'handling', unit: 'box' }, '25': { fam: 'handling', unit: 'box' }, '30': { fam: 'handling', unit: 'box' }, '33': { fam: 'handling', unit: 'box' },
  '55': { fam: 'driver', unit: 'hour' }, S0: { fam: 'driver', unit: 'hour' }, '54': { fam: 'centre', unit: 'hour' },
  STO: { fam: 'storage', unit: 'box a month' },
};

export function lineCost(R, st, { acct = null, lines = [], Z = {} } = {}) {
  const svc = SERVICES[st.code];
  if (!svc) return null;
  const u = Math.max(1, st.units || 1), v = st.visits || null, mi = st.miles || R.RATES.avgMiles.v;
  let c;
  if (svc.fam === 'bin') {
    const a = acct, S = R.SETTINGS, vv = v || Math.max(1, Math.ceil(u / R.RATES.unitsVisit.v));
    const lb = a ? lines.filter(l => l.servcode === 'S5B').reduce((t, l) => t + l.units, 0) : 0;
    const share = a && a.bins ? Math.min(1, u / a.bins) : 1;
    // the route: one given (riding a route), else the account's own route days, else the real days near the place,
    // else its own trip from the yard, else the book's stop until a place is chosen
    const own = R.routeFor && R.routeFor(st.level1), rc = R.routeCostsNow && R.routeCostsNow(), pt = st.postcode && Z[st.postcode];
    let route = null, basis = 'average';
    if (st.route) { route = st.route; basis = 'ride'; }
    else if (own) { route = ownRoute(own, u, vv, S, lines, st.code, a); if (st.siteMin != null) route.onsite = vv * perMinOwn(own, S) * st.siteMin; basis = 'account'; }
    else if (pt) { const near = nearbyCost(rc, st.postcode, Z); if (near) { route = quoteRoute(near, u, vv, S); if (st.siteMin != null) route.onsite = vv * near.perMinute * st.siteMin; basis = 'nearby'; } else { route = hourRoute(R, dist(YARD, pt), u, vv, 'its own trip from the yard', st.siteMin); basis = 'yard'; } }
    else { const book = bookCost(rc); if (book) { route = quoteRoute(book, u, vv, S); if (st.siteMin != null) route.onsite = vv * book.perMinute * st.siteMin; basis = 'book'; } }
    c = R.costToServe('bin', u, Object.assign({ visits: v, miles: mi, route }, lb > 0 ? { pounds: lb * share } : { binCode: svc.size }));
    c.routeBasis = basis;
  } else if (svc.fam === 'handling') c = R.costToServe('handling', u);
  else if (svc.fam === 'trip') {
    const S = R.SETTINGS, n = v || u, pt = st.postcode && Z[st.postcode], rc = R.routeCostsNow && R.routeCostsNow(), own = R.movementFor && R.movementFor(st.level1);
    let route = null, basis = 'average';
    const shared = (cost, b) => { route = quoteRoute(cost, n, n, S); if (st.siteMin != null) route.onsite = n * cost.perMinute * st.siteMin; basis = b; };
    if (st.route) { route = st.route; basis = 'ride'; }
    else if (st.mode === 'dedicated') {
      route = hourRoute(R, pt ? dist(YARD, pt) : mi, n, n, 'a vehicle of its own, there and back from the yard', st.siteMin); basis = 'dedicated';
      // a truck and driver pulled out for one job cost at least the least hours on Settings
      const least = n * R.routeHourRate() * S.dedicatedMinHours, gap = least - route.travel - route.onsite;
      if (gap > 0) { route.travel += gap; route.topUp = gap / n; }
    }
    else if (own) { route = { ...own }; if (st.siteMin != null) route.onsite = (own.onsite / own.services) * own.services * st.siteMin / (S.stopMin + S.serviceMin); basis = 'account'; }
    else if (pt) { const near = nearbyCost(rc, st.postcode, Z); if (near) shared(near, 'nearby'); else { route = hourRoute(R, dist(YARD, pt), n, n, 'its own trip from the yard', st.siteMin); basis = 'yard'; } }
    else { const book = bookCost(rc); if (book) shared(book, 'book'); }
    c = R.costToServe('movement', 0, { visits: n, miles: mi, route });
    c.routeBasis = basis; c.topUp = route && route.topUp || 0;
  }
  else if (svc.fam === 'itad') c = R.costToServe('itad', u, { visits: v, miles: mi });
  else if (svc.fam === 'shredlb') c = R.costToServe('shred', u);
  else if (svc.fam === 'shredbox') c = R.costToServe('shred', u, { unit: 'box' });
  else if (svc.fam === 'driver') c = R.costToServe('labour', u);
  else if (svc.fam === 'centre') c = R.costToServe('labour', u, { isCentre: true });
  else if (svc.fam === 'storage') c = R.costToServe('storage', u / 12);
  if (svc.fam === 'trip' || svc.fam === 'storage') c.perUnit = c.total / u;
  return c;
}

const perMinOwn = (r, S) => { const mins = r.stops * S.stopMin + r.services * S.serviceMin; return mins > 0 ? r.onsite / mins : 0; };
// the model's time on site for a visit: minutes, Settings; the screen pre-fills it and anyone can change it
export const defaultSite = (R, services = 1) => R.SETTINGS.stopMin + R.SETTINGS.serviceMin * services;

// An account's own route days, a visit at a time, so fuller or fewer visits can be tried. Its line carries its share of
// the visit where it buys other services too.
function ownRoute(r, u, v, S, lines, code, a) {
  const line = lines.find(l => l.servcode === code), share = a && a.bins && line ? Math.min(1, line.units / a.bins) : 1;
  const visits = r.days || 1, mins = r.stops * S.stopMin + r.services * S.serviceMin, per = mins > 0 ? r.onsite / mins : 0;
  return { services: u, days: r.days, from: r.from, to: r.to, travel: v * share * r.travel / visits, onsite: v * per * (share * S.stopMin * r.stops / visits + S.serviceMin * u / v) };
}
// A trip priced by the hour: there and back over the miles given, plus the time on site. Used for what one more stop
// adds to a route that runs anyway, and for a place with no route near it.
export function hourRoute(R, mi, u, v, label, siteMin = null) {
  const S = R.SETTINGS, hr = R.routeHourRate(), k = u / v;
  return { services: u, days: null, label, travel: v * hr * (2 * mi / S.mph), onsite: v * hr * (siteMin ?? (S.stopMin + S.serviceMin * k)) / 60 };
}

// The closest route that really calls there: regular stops are a route at a postcode four or more times a year on that
// weekday. Road miles for the closest few; a route that only serves this account does not count.
//   Q: the quote-routes view
export function nearestRoute(Q, Z, postcode, level1 = null) {
  const pt = Z[postcode]; if (!pt || !Q) return null;
  const list = Q.regular.filter(x => Z[x.postcode] && (x.solo == null || x.solo !== level1)).map(x => ({ ...x, straight: miles(pt, Z[x.postcode]) })).sort((a, b) => a.straight - b.straight);
  if (!list.length) return null;
  const close = list.filter(x => x.straight <= list[0].straight + .5).slice(0, 12);
  const best = close.map(x => ({ ...x, miles: x.postcode === postcode ? 0 : dist(Z[x.postcode], pt) })).sort((a, b) => a.miles - b.miles || b.n - a.n)[0];
  const day = Q.days[best.day];
  return { ...best, day, carries: best.miles <= RIDE_MILES };
}

// Healthy, Thin, Too thin, Loses money: the thresholds are on Settings
export function marginLabel(R, m) {
  if (m == null) return { cls: '', word: '' };
  return m < 0 ? { cls: 'loss', word: 'Loses money' } : m < R.SETTINGS.marginThin ? { cls: 'loss', word: 'Too thin' } : m < R.SETTINGS.marginHealthy ? { cls: 'thin', word: 'Thin' } : { cls: 'good', word: 'Healthy' };
}

const ROUTE_LINE = new Set(['Travel to site', 'Truck time']), PLANT_LINE = new Set(['Shred plant', 'Plant throughput']);
// One line's cost cut up for the bar, for one visit (or one unit, for work with no visits)
export function visitParts(c, per) {
  const sum = pred => c.lines.reduce((t, l) => pred(l[0]) ? t + l[1] : t, 0) / per;
  const travel = sum(n => ROUTE_LINE.has(n)), time = sum(n => n === 'Time on site'), plant = sum(n => PLANT_LINE.has(n));
  const rest = c.lines.filter(l => !ROUTE_LINE.has(l[0]) && l[0] !== 'Time on site' && !PLANT_LINE.has(l[0]) && l[1] > 0.005);
  return { travel, time, plant, other: c.total / per - travel - time - plant, otherName: rest.length === 1 ? rest[0][0] : 'The work', cost: c.total / per };
}

const WEEKDAY = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
export const routeLabel = r => /\d/.test(r) ? r : r.charAt(0) + r.slice(1).toLowerCase();
export const dayLabel = d => WEEKDAY[d];

// The four ways to price it. st: { code, price, units, visits, bins, postcode, level1, miles }; band: { p25, p75 };
// each option's own state, cost and year, the same function the summary and the tests read.
export function quoteOptions(R, st, { acct = null, lines = [], Z = {}, near = null, band = null } = {}) {
  const svc = SERVICES[st.code], bin = !!svc && svc.fam === 'bin', trip = !!svc && svc.fam === 'trip', vis = st.visits;
  const make = (id, t, d, s, off = null) => {
    const c = lineCost(R, s, { acct, lines, Z }), per = s.visits || s.units || 1, rev = s.price * s.units;
    const cost = c ? c.total : null, left = c ? rev - cost : null;
    return { id, t, d, off, st: s, c, parts: c ? visitParts(c, per) : null, per, yrev: rev, year: left, m: c && rev > 0 ? left / rev : null, rev: s.price * s.units / per };
  };
  const unit = svc ? svc.unit : 'unit', list = [];
  const label = bin ? `${Fmt.fixed(st.bins, st.bins % 1 ? 1 : 0)} bin${st.bins === 1 ? '' : 's'} a visit, ${Fmt.num(vis)} visits a year` : `${Fmt.num(st.units)} ${svc && svc.fam === 'storage' ? 'box-months' : st.units === 1 ? unit : unit + 's'} a year`;
  list.push(make('now', 'As asked', label, st));
  const can = (bin || trip) && near && near.carries;
  const rideName = near ? `Ride ${routeLabel(near.route)}'s ${dayLabel(near.dow)}` : 'Ride a route';
  list.push(make('ride', rideName,
    can ? `Booked on the route that calls ${near.miles < .05 ? 'in the same postcode' : `${Fmt.fixed(near.miles, 1)} mi away`}. Counts only what the stop adds: the route runs anyway.` : '',
    can ? { ...st, route: hourRoute(R, near.miles, st.units, vis, `what the stop adds to ${routeLabel(near.route)}'s route`, st.siteMin) } : st,
    can ? null : !bin && !trip ? 'Only bins and deliveries ride a route.' : !st.postcode ? 'Choose a place first.' : `No route calls within ${RIDE_MILES} mi.`));
  const fv = bin && vis > 6 ? Math.max(6, Math.round(vis / 2)) : null;
  list.push(make('fewer', 'Fewer, fuller visits', fv ? `${Fmt.fixed(st.units / fv, st.units / fv % 1 ? 1 : 0)} bins, ${Fmt.num(fv)} visits a year: the same bins, half the trips.` : '',
    fv ? { ...st, visits: fv, bins: st.units / fv, siteMin: st.siteMin != null ? st.siteMin + R.SETTINGS.serviceMin * (st.units / fv - st.units / vis) : null } : st, fv ? null : bin ? 'Already as few visits as this schedule allows.' : 'Only bin services have visits to cut.'));
  const mid = band ? (band.p25 + band.p75) / 2 : null, dec = st.code === 'STO' ? 3 : 2;
  list.push(make('band', 'Price in the band', mid && st.price < mid ? `${Fmt.money(mid, { dp: dec })}, the middle of what accounts pay (${Fmt.money(band.p25, { dp: dec })} to ${Fmt.money(band.p75, { dp: dec })}).` : '',
    mid && st.price < mid ? { ...st, price: mid } : st, mid && st.price < mid ? null : 'Already at or above the middle of the band.'));
  const open = list.filter(o => !o.off && o.year != null);
  const top = open.length ? open.reduce((a, b) => b.year > a.year ? b : a) : null;
  for (const o of list) o.best = o === top;
  return list;
}

// The three summary points, from computed fields only: every figure as the screen shows it. line goes to Claude;
// say is the plain version, shown first and whenever Claude is not there or fails the number check.
export function quoteFacts(o, list, { near = null, st = null, band = null, unit = 'bin', basis = null } = {}) {
  const m2 = v => (v < 0 ? '−' : '') + Fmt.money(Math.abs(v), { dp: Math.abs(v) < 1 ? 3 : 2 }), mk = v => (v < 0 ? '−' : '') + Fmt.money(Math.abs(v), { short: true }), pc = v => (v < 0 ? '−' : '') + Fmt.pct(Math.abs(v));
  const p = o.parts, how = { dedicated: 'as a vehicle of its own, there and back', nearby: 'on what real route days nearby cost', account: 'on its own route days', yard: 'as its own trip from the yard', ride: 'on what the stop adds to that route', book: "at the book's average stop, until a place is chosen" }[o.c.routeBasis] || 'on the cost model';
  const place = !!o.c.routeBasis;
  const parts = [p.travel > .005 ? `getting there ${m2(p.travel)}` : '', p.time > .005 ? `time on site ${m2(p.time)}` : '', p.plant > .005 ? `shredding ${m2(p.plant)}` : '', p.other > .005 ? `${p.otherName.toLowerCase()} ${m2(p.other)}` : ''].filter(Boolean).join(', ');
  const why = `Costed ${how}: ${parts}, against ${m2(o.rev)} billed, which leaves ${pc(o.m || 0)} est.`;
  const nearby = o.c.routeBasis === 'account' && near && !near.carries ? 'Costed on its own route days; no other route calls close by regularly.' : near ? (near.carries ? `${routeLabel(near.route)} already calls at ${near.postcode} on ${dayLabel(near.dow)}, ${near.miles < .05 ? 'the same postcode' : `${Fmt.fixed(near.miles, 1)} mi away`}, with ${Fmt.num(near.day ? near.day.customers : 0)} customers on that route.` : `No route calls within ${RIDE_MILES} mi regularly. The nearest that does is ${routeLabel(near.route)} on ${dayLabel(near.dow)}, ${Fmt.fixed(near.miles, 1)} mi away.`) : 'Choose a place to see the routes near it.';
  const alt = list.filter(x => x !== o && !x.off && x.year != null).sort((a, b) => b.year - a.year)[0];
  const better = alt && alt.year > o.year ? `${alt.t}: ${pc(alt.m || 0)} margin, ${mk(alt.year)} a year left, against ${mk(o.year)} this way est.` : 'This is already the strongest of the four est.';
  const under = st && band && st.price < band.p25 ? ` At ${m2(st.price)} it is also under the ${m2(band.p25)} where the middle half starts.` : '';
  return [{ key: 'why', line: why, say: why }, ...(place ? [{ key: 'nearby', line: nearby, say: nearby }] : []), { key: 'better', line: better + under, say: better + under }];
}

// A labour service's real jobs, from its priced lines: how long a job day runs, and what it bills an hour.
export function jobStats(allLines, code) {
  const ls = allLines.filter(l => l.servcode === code && l.units > 0 && l.days > 0);
  if (!ls.length) return null;
  const h = ls.map(l => l.units / l.days).sort((a, b) => a - b), units = ls.reduce((t, l) => t + l.units, 0);
  return { accounts: ls.length, median: h[Math.floor(h.length / 2)], shortest: h[0], perHour: ls.reduce((t, l) => t + l.revenue, 0) / units };
}

// Each cost on the screen in plain words: what it pays for, what it leaves out, and its largest parts. Figures from the
// cost model only. per: what the bar is a share of (a visit, a trip, a unit).
export function costNotes(R, o, { jobs = null } = {}) {
  if (!o.c) return [];
  const T = R.RATES, S = R.SETTINGS, b = o.c.routeBasis, hr = R.routeHourRate(), m2 = v => Fmt.money(v, { dp: 2 }), m4 = v => Fmt.money(v, { dp: 4 });
  const hourly = b === 'ride' || b === 'yard' || b === 'dedicated';
  const routeSay = hourly ? `${m2(hr)} a route hour: the ${m2(T.routeDay.v)} route day over ${Fmt.fixed(S.routeHours, 1)} hours (Settings). It pays for the driver, the truck and Routeware.` : `Its share of real route days, by the minutes it adds to the day. A route day costs ${m2(T.routeDay.v)}: the driver, the truck and Routeware.`;
  const NOTE = {
    'Warehouse space': [`R4's buildings and their upkeep, ${m4(T.facilities.v)} a box a month. It leaves out handling and delivery, which are costed when a box moves.`, 'facilities'],
    'Warehouse handling': [`Pulling, refiling or moving one box inside the warehouse: ${m2(T.handling.v)} a movement. No truck in this.`, 'handling'],
    'Box handling': [`Handling the boxes on the job: ${m2(T.handling.v)} a box.`, 'handling'],
    'Shred plant': [`Running paper through the shredder: ${m4(T.shredPlant.v)} a pound. Provisional: this pool is still over what the books show.`, 'shred_plant'],
    'Plant throughput': [`Taking devices through the plant: about ${T.lbPerItad.v} lb a unit at ${m4(T.shredPlant.v)} a pound.`, 'shred_plant'],
    'Travel to site': [`${hourly ? 'There and back at ' + S.mph + ' mph. ' : ''}${o.c.topUp > 0 ? `Includes ${m2(o.c.topUp)} to reach the ${Fmt.fixed(S.dedicatedMinHours, 1)} hours a dedicated vehicle is costed at, at the least (Settings). ` : ''}${routeSay}`, 'route_day'],
    'Truck time': [routeSay, 'route_day'],
    'Time on site': [`The time spent at the customer${hourly ? `, at ${m2(hr)} a route hour` : ', at what a minute of that route day costs'}. Pre-filled at ${S.stopMin} minutes a stop and ${S.serviceMin} a service, unless changed above.`, 'route_day'],
    'Driver time': [`${m2(T.driverHr.v)} is one driver's pay an hour with employer costs, from ADP. It leaves out the truck, fuel, the shredder and the drive to the job, so a truck job reads better than it is.`, null],
    'Service Centre time': [`${m2(T.centreHr.v)} is one service-centre person's pay an hour with employer costs, from ADP. No truck or travel in this.`, null],
  };
  return o.c.lines.filter(l => l[1] > 0.005).map(l => {
    const [say, pool] = NOTE[l[0]] || [String(l[2]).split('. ')[0] + '.', null], amount = l[1] / o.per;
    const shown = l[0] === 'Time on site' && o.c.lines.some(x => ROUTE_LINE.has(x[0]));
    const all = pool && !shown && R.poolBreakdown ? R.poolBreakdown(pool) : [], top = all.slice(0, 3), rest = all.slice(3).reduce((t, x) => t + x.share, 0);
    const parts = top.map(x => ({ name: x.name, share: x.share, amount: amount * x.share }));
    if (rest > 0.005) parts.push({ name: 'Everything else', share: rest, amount: amount * rest });
    const job = (l[0] === 'Driver time' || l[0] === 'Service Centre time') && jobs ? ` Over twelve months, ${Fmt.num(jobs.accounts)} accounts: a job day runs a median ${Fmt.fixed(jobs.median, 1)} hours, the shortest ${Fmt.fixed(jobs.shortest, 1)}, billed about ${m2(jobs.perHour)} an hour. The data records no minimum charge.` : '';
    return { name: l[0], amount, say: say + job, parts, est: !!l[3] };
  });
}
