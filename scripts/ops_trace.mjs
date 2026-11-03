// Operations: one route and one far area, every figure against the source rows. Read-only; run on the PC with the database up:
//   node --no-warnings scripts/ops_trace.mjs [route] [postcode]
// Reads the same stops the page reads through its own functions, then asks the database separately and compares.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const pg = require('pg');
const url = process.env.DATABASE_URL;
process.env.USE_FIXTURES = '1'; process.env.DATABASE_URL = '';
const fs = require('fs');
const R = require('../model/rates.js'), { routeCosts } = require('../server/routecost.js');
const rc = await routeCosts('trace');
const O = await import('../public/components/opsdata.js');
const J = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data;
const Z = JSON.parse(fs.readFileSync('public/data/zcta.json', 'utf8')), RH = J('routehistory'), AR = J('arearevenue'), M = J('margin'), A = J('activity');
const ROUTE = process.argv[2] || 'MARK', AREA = process.argv[3] || '60563';
const c = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
let bad = 0;
const say = (label, shown, source, tol = 0) => { const ok = Math.abs(shown - source) <= tol; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} shown ${String(+shown.toFixed(2)).padStart(10)}  source ${String(+source.toFixed(2)).padStart(10)}`); };

const P = O.periods(A.latestDone), V = O.opsPeriod(RH, Z, R, P.q), row = V.routes.find(r => r.route === ROUTE);
console.log(`\nRoute ${ROUTE}, ${P.q.from} to ${P.q.to}`);
const [q] = (await c.query(`SELECT count(*)::int AS services, count(DISTINCT date)::int AS days, count(DISTINCT (date, slocid))::int AS stops
  FROM vs_service_orders WHERE billable = 'true' AND route = $1 AND NULLIF(date, '')::date BETWEEN $2 AND $3`, [ROUTE, P.q.from, P.q.to])).rows;
say('services', row.services, q.services); say('route days', row.routeDays, q.days); say('stops', row.stops, q.stops);
say('services a route day', row.perDay, q.services / q.days, .001);
const [all] = (await c.query(`SELECT count(*)::int AS services, count(DISTINCT (date, route))::int AS days FROM vs_service_orders
  WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL AND route <> '--' AND NULLIF(date, '')::date BETWEEN $1 AND $2`, [P.q.from, P.q.to])).rows;
say('all routes: services', V.now.services, all.services); say('all routes: route days', V.now.routeDays, all.days);
say('route cost a service', V.now.costPerService, R.routeDayNow() * all.days / all.services, .001);
const drove = V.stretches.reduce((m, s) => Math.max(m, s.r[ROUTE] || 0), 0);
console.log(`      busiest stretch for ${ROUTE}: ${drove} route days of its ${row.routeDays}`);
if (drove > row.routeDays) { bad++; console.log('FAIL  a stretch cannot have more route days than its route'); }

const costly = O.costlyAreas({ rc, AR, M, Z, R }), a = costly.find(x => x.postcode === AREA);
console.log(`\nArea ${AREA}, twelve months to ${A.latestDone}: ${a.who.map(w => w.name).join(', ')}`);
const [v] = (await c.query(`SELECT count(*)::int AS services, count(DISTINCT (date, route, level1))::int AS visits, count(DISTINCT (date, route, slocid))::int AS stops
  FROM vs_service_orders WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL AND left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) = $1
    AND NULLIF(date, '')::date > $2::date - 365 AND NULLIF(date, '')::date <= $2::date`, [AREA, A.latestDone])).rows;
say('services', a.services, v.services); say('visits (a customer, a route, a day)', a.visits, v.visits); say('stops', a.stops, v.stops);
// the cost, rebuilt stop by stop: the route day's cost times its share of that day's minutes
let cost = 0, travel = 0, days = 0;
for (const d of rc.dayList) {
  const mine = d.stops.filter(s => !s.delivery && s.postcode === AREA); if (!mine.length) continue;
  days++;
  const mins = d.stops.reduce((t, s) => t + s.driveMin + s.dropMin, 0);
  for (const s of mine) { cost += R.RATES.routeDay.v * (s.driveMin + s.dropMin) / mins; travel += R.RATES.routeDay.v * s.driveMin / mins; }
}
say('route cost a year', a.cost, cost, .01); say('of it driving', a.travel, travel, .01); say('cost a visit', a.perVisit, cost / v.visits, .01);
console.log(`      on ${days} route days`);
// no revenue lost or counted twice: an account's lines at every postcode and at none add to what VCK billed
const lead = a.who[0].level1;
const [b] = (await c.query(`SELECT coalesce(sum(p.totamt), 0)::float AS revenue, coalesce(sum(CASE WHEN s.servcode = 'S5' THEN p.units END), 0)::float AS pounds
  FROM priced_lines p JOIN servcode s USING (servcodeid) LEFT JOIN model.service_family sf ON sf.servcode = s.servcode
  WHERE p.level1 = $1 AND p.wodate > $2::date - 365 AND p.wodate <= $2::date AND sf.family IN ('bin', 'itad')`, [lead, A.latestDone])).rows;
say(`${a.who[0].name}: bin and ITAD revenue, all postcodes`, AR.filter(r => r.level1 === lead).reduce((t, r) => t + r.revenue, 0), b.revenue, .5);
const [s5] = (await c.query(`SELECT coalesce(sum(p.units), 0)::float AS lb FROM priced_lines p JOIN servcode s USING (servcodeid) WHERE s.servcode = 'S5' AND p.level1 = $1 AND p.wodate > $2::date - 365 AND p.wodate <= $2::date`, [lead, A.latestDone])).rows;
say(`${a.who[0].name}: S5 pounds, all postcodes`, AR.filter(r => r.level1 === lead).reduce((t, r) => t + r.pounds, 0), s5.lb, .5);
say('plant', a.plant, a.pounds * R.RATES.shredPlant.v, .01);
say('margin', a.margin, (a.revenue - a.cost - a.plant) / a.revenue, .0001);
console.log(`      revenue ${a.revenue.toFixed(0)}, ${a.revenuePerVisit.toFixed(0)} a visit; band ${a.band.word}`);
// the moves, by hand from the figures above
const perMin = a.cost / (a.driveMin + a.dropMin), find = k => (a.options.find(o => o.key === k) || { saving: 0 }).saving;
say('fewer, fuller visits', find('fewer'), a.travel / 2 + a.stops / 2 * R.SETTINGS.stopMin * perMin, .01);
say('add a neighbour', find('neighbour'), a.travel / 2, .01);
console.log(`      best move: ${a.best ? a.best.title + ', ' + a.best.saving.toFixed(0) : 'none'}; every option: ${a.options.map(o => o.key + ' ' + o.saving.toFixed(0)).join(', ')}`);
await c.end();
console.log(bad ? `\n${bad} did not tie` : '\nall tie');
process.exit(bad ? 1 : 0);
