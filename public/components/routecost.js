// What bins really cost to serve, from the route days they were served on (31 October 2026, Theran's
// method). For each route day: the route, every stop in order, and each stop's share of that day's
// cost by time (routemap.js allocate: drive minutes from its road-mile detour, plus drop minutes).
// Summed by account, an account's bin cost is the sum of its stops' shares over its days; summed by
// postcode, a new bin quote is costed from what route days there actually cost a service.
//
//   rows: route-day stops [{ date, route, stop, seq, level1, company, postcode, services, pounds }]
//         (server/queries.js routestops(); offline, the drill's routes and the route orders)
//   routeCosts(R, rows, Z) → { from, to, days, stops, services, accounts: { level1: {...} },
//                              postcodes: { postcode: {...} }, settings }
//   postcodeCost(rc, postcode, Z) → { perService, travel, onsite, services, days, postcodes, basis } | null
//
// Caveat, labelled wherever it shows: days when the truck also delivered boxes are not in the route
// data yet, so the stops on them carry the whole day and read high.
import * as Fmt from './format.js';
import { allocate, miles, YARD } from './routemap.js';

const pc5 = p => p ? String(p).slice(0, 5) : null;

// rows → route days, each { date, route, stops: [{ ..., postcode, pt }] } in route order
export function daysFrom(rows, Z) {
  const by = new Map();
  for (const r of rows) {
    if (!r.date || !r.route) continue;
    const k = r.date + '|' + r.route;
    if (!by.has(k)) by.set(k, { date: r.date, route: r.route, stops: new Map() });
    const d = by.get(k), sk = r.stop || ('a' + r.level1);
    const x = d.stops.get(sk);
    if (x) { x.services += r.services || 0; x.pounds += r.pounds || 0; if (r.seq != null && (x.seq == null || r.seq < x.seq)) x.seq = r.seq; }
    else d.stops.set(sk, { stop: r.stop, seq: r.seq, level1: r.level1, company: r.company, postcode: pc5(r.postcode), services: r.services || 0, pounds: r.pounds || 0 });
  }
  return [...by.values()].map(d => ({
    date: d.date, route: d.route,
    stops: [...d.stops.values()]
      .sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || String(a.stop).localeCompare(String(b.stop)))
      .map(s => ({ ...s, pt: (Z && Z[s.postcode]) || null })),
  })).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.route).localeCompare(String(b.route)));
}

// Every day costed once; its stops' shares summed by account and by postcode.
//   deliveries: [{ date, level1, orders, trips, postcode }] from VCK (server/queries.js deliverydays).
//   Box deliveries ride the shred trucks (Theran, 1 November 2026), but VCK does not say on which
//   route. With R.SETTINGS.deliveryMatch on, each delivery is placed on the route that passes closest
//   to it that day: every route that ran that date, every gap between its stops, the one where it adds
//   fewest miles. The day is then shared by minutes with the delivery as one more stop, so the route
//   day's cost is unchanged and spread over more work; the delivery's share goes to delivery and
//   pickup (movement), never to the account's bins. A delivery with no postcode (the customer has no
//   Veri-Shred address; VCK holds none) or on a date no route ran is counted, not placed. Off,
//   everything is exactly as before.
export function placeDeliveries(days, deliveries, Z, typed = {}) {
  const byDate = new Map();
  for (const d of days) (byDate.get(d.date) || byDate.set(d.date, []).get(d.date)).push(d);
  const out = { placed: 0, noPostcode: 0, noRoute: 0, orders: 0, trips: 0, basis: { site: 0, account: 0, typed: 0 }, missing: {} };
  // one stop per customer per day
  const merged = new Map();
  for (const d of deliveries || []) {
    if (!d.date || d.level1 == null) continue;
    const k = d.date + '|' + d.level1, x = merged.get(k) || { date: d.date, level1: d.level1, postcode: pc5(d.postcode), basis: d.postcode ? (d.basis || 'account') : null, orders: 0, trips: 0, revenue: 0 };
    x.orders += d.orders || 0; x.trips += d.trips || d.orders || 0; x.revenue += d.revenue || 0;
    if (!x.postcode && d.postcode) { x.postcode = pc5(d.postcode); x.basis = d.basis || 'account'; }
    merged.set(k, x);
  }
  for (const d of merged.values()) {
    out.orders += d.orders; out.trips += d.trips;
    // no postcode in the data: one typed on Settings (typed[level1]), if any
    if (!d.postcode && typed && typed[d.level1]) { d.postcode = String(typed[d.level1]).padStart(5, '0'); d.basis = 'typed'; }
    const pt = d.postcode && Z ? Z[d.postcode] : null;
    if (!pt) {
      out.noPostcode++;
      const m = out.missing[d.level1] || (out.missing[d.level1] = { level1: d.level1, days: 0, revenue: 0 });
      m.days++; m.revenue += d.revenue;
    }
    const routes = byDate.get(d.date);
    if (!routes || !routes.length) { out.noRoute++; continue; }
    // no postcode: it still rode a truck that day, so it takes its share of the fullest route and the average detour,
    // rather than a cost on top of route days already shared out in full
    if (!pt) {
      const day = routes.reduce((a, b) => b.stops.length > a.stops.length ? b : a);
      day.stops.push({ stop: 'D' + d.level1, level1: d.level1, postcode: null, pt: null, services: d.trips || 1, pounds: 0, delivery: true, orders: d.orders });
      out.unlocated = (out.unlocated || 0) + 1;
      continue;
    }
    let best = null;
    for (const day of routes) {
      const pts = [YARD, ...day.stops.filter(s => s.pt).map(s => s.pt), YARD];
      const at = [];   // index into day.stops after which a gap sits
      day.stops.forEach((s, i) => { if (s.pt) at.push(i); });
      for (let g = 0; g < pts.length - 1; g++) {
        const add = miles(pts[g], pt) + miles(pt, pts[g + 1]) - miles(pts[g], pts[g + 1]);
        if (!best || add < best.add) best = { add, day, after: g === 0 ? -1 : at[g - 1] };
      }
    }
    best.day.stops.splice(best.after + 1, 0, { stop: 'D' + d.level1, level1: d.level1, postcode: d.postcode, pt, services: d.trips || 1, pounds: 0, delivery: true, orders: d.orders });
    out.placed++; out.basis[d.basis || 'account'] = (out.basis[d.basis || 'account'] || 0) + 1;
  }
  // the accounts with no postcode, largest delivery revenue first: for Settings, to type one in
  out.missing = Object.values(out.missing).sort((a, b) => b.revenue - a.revenue || b.days - a.days).slice(0, 30)
    .map(m => ({ ...m, revenue: Math.round(m.revenue) }));
  return out;
}

export function routeCosts(R, rows, Z, deliveries = []) {
  const days = daysFrom(rows, Z);
  const accounts = {}, postcodes = {}, movement = {}, daily = {}, moveDaily = {};
  // an account's share of one date, for its jobs (margin.js accountJobs): by level1, then date
  const onDay = (o, s, date) => { const by = o[s.level1] || (o[s.level1] = {}), x = by[date] || (by[date] = { cost: 0, travel: 0, onsite: 0, services: 0 }); x.cost += s.cost; x.travel += s.travel; x.onsite += s.onsite; x.services += s.services || 0; };
  let services = 0, stops = 0, roundMin = 0;
  const on = !!R.SETTINGS.deliveryMatch && (deliveries || []).length > 0;
  const dels = on ? placeDeliveries(days, deliveries, Z, R.SETTINGS.postcodes || {}) : null;
  for (const day of days) {
    const a = allocate(R, day);
    roundMin += a.minutes.round;
    const seenAcc = new Set(), seenPc = new Set(), seenMove = new Set();
    for (const s of day.stops) {
      stops++; services += s.services || 0;
      if (s.delivery) {   // a box delivery placed on this route: its share is delivery and pickup's
        onDay(moveDaily, s, day.date);
        const x = movement[s.level1] || (movement[s.level1] = { cost: 0, travel: 0, onsite: 0, services: 0, days: 0, from: day.date, to: day.date });
        x.cost += s.cost; x.travel += s.travel; x.onsite += s.onsite; x.services += s.services || 0;
        if (!seenMove.has(s.level1)) { seenMove.add(s.level1); x.days++; x.to = day.date; }
        continue;
      }
      if (s.level1 != null) {
        onDay(daily, s, day.date);
        const x = accounts[s.level1] || (accounts[s.level1] = { cost: 0, travel: 0, onsite: 0, services: 0, pounds: 0, stops: 0, days: 0, detour: 0, from: day.date, to: day.date });
        x.cost += s.cost; x.travel += s.travel; x.onsite += s.onsite; x.services += s.services || 0; x.pounds += s.pounds || 0; x.stops++; x.detour += s.detour || 0;
        if (!seenAcc.has(s.level1)) { seenAcc.add(s.level1); x.days++; x.to = day.date; }
      }
      if (s.postcode) {
        const p = postcodes[s.postcode] || (postcodes[s.postcode] = { cost: 0, travel: 0, onsite: 0, services: 0, stops: 0, days: 0, customers: new Set() });
        p.cost += s.cost; p.travel += s.travel; p.onsite += s.onsite; p.services += s.services || 0; p.stops++;
        if (s.level1 != null) p.customers.add(s.level1);
        if (!seenPc.has(s.postcode)) { seenPc.add(s.postcode); p.days++; }
      }
    }
  }
  for (const p of Object.values(postcodes)) p.customers = p.customers.size;
  const r2 = v => Math.round(v * 100) / 100;
  for (const o of [...Object.values(accounts), ...Object.values(postcodes), ...Object.values(movement)]) for (const f of ['cost', 'travel', 'onsite', 'detour', 'pounds']) if (o[f] != null) o[f] = r2(o[f]);
  const dates = (deliveries || []).map(d => d.date).filter(Boolean).sort();
  const out = {
    from: days.length ? days[0].date : null, to: days.length ? days[days.length - 1].date : null,
    days: days.length, stops, services, accounts, postcodes, movement,
    deliveries: { on, ...(dels || {}), customerDays: dels ? dels.placed + dels.noPostcode + dels.noRoute : null, accounts: Object.keys(movement).length,
      from: dates[0] || null, to: dates[dates.length - 1] || null },
    // the time model's day against the eight to nine hours a route day really runs: Mike's check
    avgRoundHours: days.length ? roundMin / days.length / 60 : null,
    settings: { ...R.SETTINGS },
  };
  // the working by day stays on the server: not enumerable, so never sent with view/routecost
  for (const [k, v] of Object.entries({ daily, moveDaily, dayList: days })) Object.defineProperty(out, k, { value: v, enumerable: false });
  return out;
}

// What a bin service costs in a postcode: its own route days when it has at least MIN services,
// else its neighbours within NEAR miles pooled, else null (the model's average applies).
export const MIN_SERVICES = 20, NEAR = 3;
export function postcodeCost(rc, postcode, Z) {
  if (!rc || !rc.postcodes) return null;
  const pc = pc5(postcode), own = rc.postcodes[pc];
  const out = (list, basis) => {
    const t = list.reduce((a, p) => ({ cost: a.cost + p.cost, travel: a.travel + p.travel, onsite: a.onsite + p.onsite, services: a.services + p.services, stops: a.stops + p.stops, days: a.days + p.days }), { cost: 0, travel: 0, onsite: 0, services: 0, stops: 0, days: 0 });
    const S = rc.settings || {}, mins = t.stops * (S.stopMin ?? 8) + t.services * (S.serviceMin ?? 3);
    return { perService: t.cost / t.services, travel: t.travel / t.services, onsite: t.onsite / t.services, services: t.services, stops: t.stops, days: t.days,
      travelPerStop: t.travel / t.stops, perMinute: mins > 0 ? t.onsite / mins : 0, postcodes: list.length, basis, postcode: pc };
  };
  if (own && own.services >= MIN_SERVICES) return out([own], 'postcode');
  const at = Z && Z[pc];
  if (!at) return own && own.services > 0 ? out([own], 'postcode') : null;
  const near = Object.entries(rc.postcodes).filter(([p, v]) => v.services > 0 && Z[p] && miles(at, Z[p]) <= NEAR).map(([, v]) => v);
  const n = near.reduce((t, v) => t + v.services, 0);
  return n >= MIN_SERVICES ? out(near, 'near') : (own && own.services > 0 ? out([own], 'postcode') : null);
}

// What real route days cost near a place: every stop within NEAR miles pooled, whatever its size (back-tested on 20
// accounts, 2 November 2026: within 11% in total, about a third out on any one account; scripts/quote_backtest.mjs).
export function nearbyCost(rc, postcode, Z, mi = NEAR) {
  if (!rc || !rc.postcodes) return null;
  const pc = pc5(postcode), at = Z && Z[pc];
  if (!at) return null;
  return pooled(Object.entries(rc.postcodes).filter(([p, v]) => v.stops > 0 && Z[p] && miles(at, Z[p]) <= mi).map(([, v]) => v), rc, 'near', pc);
}
// the whole book's stop, until a place is chosen
export const bookCost = rc => rc && rc.postcodes ? pooled(Object.values(rc.postcodes).filter(v => v.stops > 0), rc, 'book', null) : null;
function pooled(list, rc, basis, postcode) {
  const t = list.reduce((a, p) => ({ travel: a.travel + p.travel, onsite: a.onsite + p.onsite, services: a.services + p.services, stops: a.stops + p.stops, days: a.days + p.days }), { travel: 0, onsite: 0, services: 0, stops: 0, days: 0 });
  if (!t.stops) return null;
  const S = rc.settings || {}, mins = t.stops * (S.stopMin ?? 8) + t.services * (S.serviceMin ?? 3);
  return { travelPerStop: t.travel / t.stops, perMinute: mins > 0 ? t.onsite / mins : 0, services: t.services, stops: t.stops, days: t.days, postcodes: list.length, basis, postcode };
}

// A quote's route cost from a postcode's real days: each visit is one stop, carrying the stop's drive
// share there and its minutes on site at what a minute on site cost there (stopMin, plus serviceMin
// for each bin on the visit). Returned as costToServe's route option.
export function quoteRoute(pcCost, units, visits, S) {
  if (!pcCost || !(units > 0)) return null;
  const v = Math.max(1, visits || units), k = units / v;
  const travel = v * pcCost.travelPerStop, onsite = v * pcCost.perMinute * ((S.stopMin ?? 8) + (S.serviceMin ?? 3) * k);
  const where = pcCost.basis === 'postcode' ? `stops in ${pcCost.postcode}` : pcCost.basis === 'book' ? 'stops across the book' : `stops within ${NEAR} miles of ${pcCost.postcode} (${pcCost.postcodes} postcodes)`;
  return { services: units, travel, onsite, days: pcCost.days,
    label: `${Math.round(v)} visits, each costed as the ${Fmt.grouped(pcCost.stops)} real ${where} cost: ${Fmt.money(pcCost.travelPerStop, { dp: 2 })} of drive time a stop, ${Fmt.money(pcCost.perMinute, { dp: 2 })} a minute on site` };
}
