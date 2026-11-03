// Operations, Phase 1: cost, revenue and margin of a visit in far areas, and a back-test of a cost-per-visit formula
// against what real route days cost. Fixtures only; reads nothing live, writes nothing. Run with USE_FIXTURES=1:
//   DATABASE_URL= USE_FIXTURES=1 node --no-warnings scripts/far_areas_check.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const J = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data;
const R = require('../model/rates.js'), { routeCosts } = require('../server/routecost.js');
const rc = await routeCosts('phase1');
const { roadPath, miles, YARD } = await import('../public/components/routemap.js');
const { marginBand } = await import('../public/components/margin.js');
const Z = JSON.parse(fs.readFileSync('public/data/zcta.json', 'utf8')), A = J('activity'), M = J('margin'), L = J('accountlines').rows;
const S = R.SETTINGS, rate = R.routeHourRate();
const FROM = '2025-11-01', TO = '2026-10-01';   // the twelve months the stops cover, near enough; October 2025 has one day

// the route-borne revenue of an account over those months, shared to a postcode by services
const FAM = new Set(['bin', 'itad']);
const rev = new Map(), revAll = new Map();
for (const r of L) { if (r.month < FROM || r.month > TO) continue; revAll.set(r.level1, (revAll.get(r.level1) || 0) + r.revenue); if (FAM.has(r.family)) rev.set(r.level1, (rev.get(r.level1) || 0) + r.revenue); }
const name = new Map(M.accounts.map(a => [a.level1, a.customer]));

// every located stop, as the day shared it out
const areas = new Map(), acctServices = new Map(), dayCount = rc.dayList.length;
let dayMin = 0, chargedMin = 0;
for (const d of rc.dayList) for (const s of d.stops) {
  chargedMin += (s.driveMin || 0) + (s.dropMin || 0);
  if (s.delivery) continue;
  acctServices.set(s.level1, (acctServices.get(s.level1) || 0) + (s.services || 0));
  if (!s.postcode || !Z[s.postcode]) continue;
  const a = areas.get(s.postcode) || { pc: s.postcode, visits: new Set(), stops: 0, services: 0, cost: 0, travel: 0, onsite: 0, min: 0, drive: 0, pounds: 0, routes: new Map(), solo: 0, level1s: new Map(), dates: new Set() };
  a.visits.add(d.date + '|' + d.route + '|' + s.level1); a.stops++; a.services += s.services || 0; a.cost += s.cost; a.travel += s.travel; a.onsite += s.onsite;
  a.min += s.driveMin + s.dropMin; a.drive += s.driveMin; a.pounds += s.pounds || 0; a.routes.set(d.route, (a.routes.get(d.route) || 0) + 1); a.level1s.set(s.level1, (a.level1s.get(s.level1) || 0) + (s.services || 0)); a.dates.add(d.date);
  if (d.stops.length === 1) a.solo++;
  areas.set(s.postcode, a);
}
const roadMi = pc => { const p = roadPath(YARD, Z[pc]); return p ? p.miles : null; };
for (const a of areas.values()) {
  a.v = a.visits.size; a.crow = miles(YARD, Z[a.pc]); a.road = roadMi(a.pc) ?? a.crow * 1.25;
  // the formula on trial: its own round trip from the yard, plus time on site, at the route-hour rate
  a.solo$ = ((2 * a.road / S.mph * 60) + S.stopMin * a.stops / a.v + S.serviceMin * a.services / a.v) / 60 * rate;
  a.time$ = a.min / 60 * rate / a.v;       // the minutes these stops really add to their days, at the route-hour rate
  a.share$ = a.cost / a.v;                 // what the day's cost shared by minutes charges them
  a.revenue = [...a.level1s].reduce((t, [l, n]) => t + (rev.get(l) || 0) * n / (acctServices.get(l) || 1), 0);
  a.revAll = [...a.level1s].reduce((t, [l, n]) => t + (revAll.get(l) || 0) * n / (acctServices.get(l) || 1), 0);
  a.plant = a.pounds * R.RATES.shredPlant.v;
  const listed = A.postcodes.find(p => p.postcode === a.pc);
  a.screen = listed ? R.costToServe('movement', 0, { visits: listed.visits, miles: Math.round(a.crow * 10) / 10 }).total : null;
  a.names = [...a.level1s].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([l]) => name.get(l) || l).join(', ');
}
const m0 = v => v == null ? '—' : (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
const pc = v => v == null ? '—' : Math.round(v * 100) + '%';
const band = (a, cost) => a.revenue > 0 ? marginBand(R, (a.revenue - cost) / a.revenue).word : 'no bin revenue';
const table = (title, list) => {
  console.log('\n' + title);
  console.log('area  mi(road) visits svcs routes  screen$/yr | share/visit time/visit solo/visit | rev/visit  route$/yr  rev/yr margin(route) margin(route+plant) band | who');
  for (const a of list) {
    const mr = a.revenue > 0 ? (a.revenue - a.cost) / a.revenue : null, mp = a.revenue > 0 ? (a.revenue - a.cost - a.plant) / a.revenue : null;
    console.log([a.pc, Math.round(a.road), a.v, a.services, [...a.routes.keys()].join('+').slice(0, 18), m0(a.screen), '|', m0(a.share$), m0(a.time$), m0(a.solo$), '|', m0(a.revenue / a.v), m0(a.cost), m0(a.revenue), pc(mr), pc(mp), band(a, a.cost + a.plant), '|', a.names.slice(0, 44)].join('  '));
  }
};
const mock = ['60446', '60175', '60502', '60564', '60035', '60188', '60466', '60189'];
table("The mock-up's eight", mock.map(p => areas.get(p)).filter(Boolean));
console.log('  missing from route stops:', mock.filter(p => !areas.has(p)).join(', ') || 'none');
const far = [...areas.values()].filter(a => a.crow >= 20);
table('The eight costing most at 20 miles or more (share of real route days)', far.slice().sort((a, b) => b.cost - a.cost).slice(0, 8));

// the back-test: formula against real route days, for every area with enough visits to mean something
const test = (label, list, f) => {
  const errs = list.map(a => f(a) / a.share$ - 1).sort((x, y) => Math.abs(x) - Math.abs(y));
  const tF = list.reduce((t, a) => t + f(a) * a.v, 0), tA = list.reduce((t, a) => t + a.cost, 0), med = errs[Math.floor(errs.length / 2)], p90 = errs[Math.floor(errs.length * .9)];
  console.log(`  ${label.padEnd(38)} areas ${String(list.length).padStart(3)}  total ${m0(tF).padStart(9)} vs ${m0(tA).padStart(9)} (${pc(tF / tA - 1)})  median miss ${pc(Math.abs(med))}  90th ${pc(Math.abs(p90))}`);
};
const all = [...areas.values()], big = all.filter(a => a.v >= 12), near = big.filter(a => a.crow < 10), mid = big.filter(a => a.crow >= 10 && a.crow < 20), farB = big.filter(a => a.crow >= 20);
console.log('\nBack-test against each area\'s share of its real route days ($' + R.RATES.routeDay.v.toFixed(2) + ' a day, shared by minutes). 12 or more visits.');
for (const [l, f] of [['own round trip + on site, at the rate', a => a.solo$], ['minutes really added, at the rate', a => a.time$]]) { console.log(l); test('all', big, f); test('within 10 miles', near, f); test('10 to 20', mid, f); test('20 or more', farB, f); }
const onScreen = big.filter(a => a.screen != null); console.log("today's on-screen figure (visit cost at distance)"); test('all', onScreen, a => a.screen / a.v); test('20 or more', onScreen.filter(a => a.crow >= 20), a => a.screen / a.v);

console.log(`\nDays ${dayCount}, charged minutes a day ${(chargedMin / dayCount).toFixed(0)} (${(chargedMin / dayCount / 60).toFixed(1)} h), round hours a day as modelled ${rc.avgRoundHours.toFixed(1)}, against routeHours ${S.routeHours}. Rate $${rate.toFixed(2)} an hour.`);
console.log(`Far (>=20mi) share of stops on one-stop days: ${pc(far.reduce((t, a) => t + a.solo, 0) / far.reduce((t, a) => t + a.stops, 0))}. Revenue coverage: ${[...acctServices.keys()].filter(l => rev.has(l)).length} of ${acctServices.size} route accounts have bin or ITAD revenue.`);
const svc = all.reduce((t, a) => t + a.services, 0), tot = rc.services; console.log(`Services in located areas ${svc} of ${tot}, ${pc(svc / tot)}.`);
process.exit(0);
