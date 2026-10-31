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
import { allocate, miles } from './routemap.js';

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
export function routeCosts(R, rows, Z) {
  const days = daysFrom(rows, Z);
  const accounts = {}, postcodes = {};
  let services = 0, stops = 0, roundMin = 0;
  for (const day of days) {
    const a = allocate(R, day);
    roundMin += a.minutes.round;
    const seenAcc = new Set(), seenPc = new Set();
    for (const s of day.stops) {
      stops++; services += s.services || 0;
      if (s.level1 != null) {
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
  for (const o of [...Object.values(accounts), ...Object.values(postcodes)]) for (const f of ['cost', 'travel', 'onsite', 'detour', 'pounds']) if (o[f] != null) o[f] = r2(o[f]);
  return {
    from: days.length ? days[0].date : null, to: days.length ? days[days.length - 1].date : null,
    days: days.length, stops, services, accounts, postcodes,
    // the time model's day against the eight to nine hours a route day really runs: Mike's check
    avgRoundHours: days.length ? roundMin / days.length / 60 : null,
    settings: { mph: R.SETTINGS.mph, stopMin: R.SETTINGS.stopMin, serviceMin: R.SETTINGS.serviceMin },
  };
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

// A quote's route cost from a postcode's real days: each visit is one stop, carrying the stop's drive
// share there and its minutes on site at what a minute on site cost there (stopMin, plus serviceMin
// for each bin on the visit). Returned as costToServe's route option.
export function quoteRoute(pcCost, units, visits, S) {
  if (!pcCost || !(units > 0)) return null;
  const v = Math.max(1, visits || units), k = units / v;
  const travel = v * pcCost.travelPerStop, onsite = v * pcCost.perMinute * ((S.stopMin ?? 8) + (S.serviceMin ?? 3) * k);
  const where = pcCost.basis === 'postcode' ? `stops in ${pcCost.postcode}` : `stops within ${NEAR} miles of ${pcCost.postcode} (${pcCost.postcodes} postcodes)`;
  return { services: units, travel, onsite, days: pcCost.days,
    label: `${Math.round(v)} visits, each costed as the ${pcCost.stops.toLocaleString('en-US')} real ${where} cost: ${'$' + pcCost.travelPerStop.toFixed(2)} of drive time a stop, ${'$' + pcCost.perMinute.toFixed(2)} a minute on site` };
}
