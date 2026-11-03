// Operations by period (components/opsdata.js): the periods, the likely round, and that the figures foot on small made-up stops.
const test = require('node:test');
const assert = require('node:assert');
const R = require('./rates.js');
const Z = { 60601: [41.885, -87.62], 60608: [41.85, -87.67], 60185: [41.89, -88.2], 60532: [41.79, -88.09] };
const load = () => import('../public/components/opsdata.js');
const stop = (date, route, postcode, services, level1 = 1, driver = 'AB', stopId = postcode) => ({ date, route, stop: stopId, driver, level1, postcode, services });

test('a period runs to the latest month once it has reached the 28th, and compare stops where history does', async () => {
  const { periods } = await load();
  const P = periods('2026-10-30');
  assert.deepStrictEqual([P.q.from, P.q.to, P.q.prevFrom, P.q.prevTo], ['2026-08-01', '2026-10-31', '2026-05-01', '2026-07-31']);
  assert.deepStrictEqual([P.q.yearFrom, P.q.yearTo], ['2025-08-01', '2025-10-31']);
  assert.strictEqual(P.y.compare, false);
  assert.strictEqual(P.h.compare, true);
  assert.strictEqual(P.month.name, 'October');
  const early = periods('2026-11-03');
  assert.strictEqual(early.month.from, '2026-10-01');
  assert.strictEqual(P.week.from, '2026-10-26');
  assert.strictEqual(P.day.prevFrom, '2026-10-23');
});

test('the likely round is shorter than a bad order and visits each place once', async () => {
  const { likelyRound } = await load();
  const t = likelyRound(['60185', '60601', '60532', '60601', '60608'], Z);
  assert.strictEqual(t.length, 4);
  assert.strictEqual(new Set(t).size, 4);
  const near = t.indexOf('60608'), far = t.indexOf('60185');
  assert.ok(Math.abs(t.indexOf('60532') - far) === 1, 'the two far postcodes sit together');
  assert.ok(near === 0 || near === 3 || t.indexOf('60601') === 0 || t.indexOf('60601') === 3);
});

test('a period foots: routes add to the figures, route days and stretches count each day once', async () => {
  const { opsPeriod, periods, tally, stretches } = await load();
  const rows = [
    stop('2026-10-05', 'MARK', '60601', 4), stop('2026-10-05', 'MARK', '60185', 6, 2),
    stop('2026-10-06', 'MARK', '60601', 5), stop('2026-10-06', 'DEMOND', '60608', 3, 3, 'CD'),
    stop('2026-09-07', 'MARK', '60601', 2), stop('2026-10-07', 'DEMOND', '99999', 1, 3, 'CD'),
  ];
  const V = opsPeriod(rows, Z, R, periods('2026-10-30').month);
  assert.strictEqual(V.now.services, 19);
  assert.strictEqual(V.now.routeDays, 4);
  assert.strictEqual(V.now.located, 18, 'a postcode with no centre is not placed');
  assert.strictEqual(V.routes.reduce((t, r) => t + r.services, 0), V.now.services);
  assert.strictEqual(V.routes.reduce((t, r) => t + r.routeDays, 0), V.now.routeDays);
  assert.strictEqual(V.prev.services, 2);
  assert.strictEqual(V.bands.reduce((t, b) => t + b.services, 0), V.now.located);
  assert.deepStrictEqual(V.changes.map(c => [c.route, c.d]).sort(), [['DEMOND', 2], ['MARK', 1]].sort());
  assert.strictEqual(V.routes.find(r => r.route === 'MARK').driver, 'AB');
  // a stretch is used at most once by a route day, even out and back
  const S = stretches([stop('2026-10-05', 'MARK', '60601', 1)], Z);
  assert.ok(S.length > 0);
  for (const s of S) { assert.strictEqual(s.n, 1); assert.strictEqual(s.r.MARK, 1); }
  assert.ok(Math.abs(tally(rows, Z, R).costPerService - R.routeDayNow() * 5 / 21) < 1e-9);
});

test('density compares the same months only where both years exist', async () => {
  const { density, opsMonths } = await load();
  const rows = [stop('2025-03-02', 'A', '60601', 20), stop('2026-03-02', 'A', '60601', 10), stop('2026-04-02', 'A', '60601', 50)];
  const D = density(opsMonths(rows, R));
  assert.strictEqual(D.then, 20);
  assert.strictEqual(D.now, 10, 'April has no April before it, so it is not in the comparison');
  assert.strictEqual(D.change, -0.5);
});

test('a far area ties to its route days and revenue, and a healthy one has no best move', async () => {
  const { costlyAreas } = await load();
  const stops = c => [{ level1: 7, postcode: '60185', services: 10, pounds: 100, cost: c, travel: c * .8, onsite: c * .2, driveMin: 40, dropMin: 20, pt: Z[60185] }];
  const dayList = Array.from({ length: 12 }, (_, i) => ({ date: `2026-0${(i % 9) + 1}-${10 + i}`, route: 'MARK', stops: stops(100) }));
  const area = rev => costlyAreas({ rc: { dayList }, AR: [{ level1: 7, postcode: '60185', revenue: rev, pounds: 1000 }], M: { accounts: [{ level1: 7, customer: 'SOME CO' }] }, Z, R })[0];
  const thin = area(1000);
  assert.strictEqual(thin.visits, 12);
  assert.strictEqual(thin.cost, 1200);
  assert.strictEqual(thin.travel + thin.onsite, 1200);
  assert.strictEqual(thin.plant, 1000 * R.RATES.shredPlant.v);
  assert.strictEqual(thin.band.cls, 'r');
  assert.ok(thin.best && thin.best.saving > 0);
  for (let i = 1; i < thin.options.length; i++) assert.ok(thin.options[i - 1].saving >= thin.options[i].saving, 'ranked');
  assert.strictEqual(area(100000).best, null);
  assert.strictEqual(costlyAreas({ rc: { dayList: dayList.slice(0, 11) }, AR: [], M: { accounts: [] }, Z, R }).length, 0, 'under twelve visits is not listed');
});
