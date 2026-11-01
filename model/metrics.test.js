// One figure, one source: anything shown on two screens must be the same number. Each test here names
// a contradiction found walking the live app (fix list, November 2026).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const J = n => require(`../fixtures/${n}.json`).data;
const R = require('../model/rates');
const D = () => ({ P: J('pulse'), A: J('activity'), C: J('customers'), M: J('margin'), PR: J('pricing'), CA: J('calls'), S: J('storage'), SG: J('segments'), LW: J('linework'), R, Z: require('../public/data/zcta.json') });

test('#20 shredding: Opportunities, Warehouse and Home count the same boxes for an account', async () => {
  const { opportunities } = await import('../public/components/opps.js');
  const { destructionView } = await import('../public/components/home2data.js');
  const d = D(), home = destructionView(d, 400), opp = opportunities(d, {}).rows.filter(r => r.kind === 'overdue');
  const byId = new Map(home.rows.map(r => [r.level1, r]));
  assert.ok(opp.length > 10);
  for (const o of opp) { const h = byId.get(o.level1); assert.ok(h, `${o.name} only on Opportunities`); assert.ok(Math.abs(o.value - h.fee) < 0.5, `${o.name}: ${o.value} against ${h.fee}`); }
});

test('#3 a move always says it is the total, and the service part is named as such', async () => {
  const { moveReason } = await import('../public/components/series.js');
  const t = moveReason({ d: -35000, dService: -33000, dStorage: -2000 }, v => '$' + Math.round(v / 1000) + 'K');
  assert.match(t, /down \$35K a month in total/);
  assert.match(t, /service down \$33K/);
});

test('#28 Anne\'s figure is the one her sentence quotes, a year', async () => {
  const { anneList } = await import('../public/components/lists.js');
  const d = D(), { calls } = anneList({ ...d, log: [], feedback: [], changes: { items: [] }, n: 10 });
  for (const c of calls) assert.equal(c.stake, c.sigs[0].stake, c.name);
});

test('#6 cross-sell in the briefing is a monthly figure, never a year', async () => {
  const { homeView } = await import('../public/components/home2data.js');
  const p = homeView(D()).points.find(x => x.key === 'cross');
  assert.doesNotMatch(p.say, /a year/);
  assert.match(p.say, /a month/);
});

test('#31 Numbers and Home read one gap', async () => {
  const { homeView, monthView } = await import('../public/components/home2data.js');
  const d = D();
  assert.equal(monthView(d).gap, homeView(d).month.gap);
});

test('#4 normal: one figure for a day, one for a route, each named', async () => {
  const { normalForDay, routeNorms, LABELS } = await import('../public/components/metrics.js');
  const { daySentence } = await import('../public/components/changes.js');
  const d = D(), date = d.A.latestDone, n = normalForDay(d.P, d.A, date);
  assert.ok(n > 0);
  assert.equal(daySentence(d.P, d.A, date).median, n);
  assert.match(daySentence(d.P, d.A, date).text, /normal for a /);
  assert.match(LABELS.normalRoute, /normal for this route/);
  const norms = routeNorms(d.A, date), r = d.A.routeDays.find(x => x.date === date && x.services_done > 0 && norms[x.route]);
  assert.ok(norms[r.route].done > 0);
});

test('#35 Mike is shown the next working day with work on it', async () => {
  const { bookedNext } = await import('../public/components/lists.js');
  const A = { latestDone: '2026-10-30', routeDays: [
    { date: '2026-10-31', route: '--', services: 3, customers: 1 },
    { date: '2026-11-02', route: 'MARK', services: 113, customers: 9 }] };
  const n = bookedNext(A);
  assert.equal(n.date, '2026-11-02');
  assert.equal(n.services, 113);
});

test('#37 a postcode\'s visits are the twelve-month count on every screen', async () => {
  const { densityView } = await import('../public/components/home2data.js');
  const d = D(), v = densityView(d), book = new Map(d.A.postcodes.map(p => [p.postcode, p.visits]));
  for (const r of v.save) assert.equal(r.visits, book.get(r.postcode), r.postcode);
});
