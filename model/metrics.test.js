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

test('#10 the stamp turns amber when the feed is held back a working day, and not over a weekend', async () => {
  const { freshStamp } = await import('../public/components/metrics.js');
  assert.equal(freshStamp({ done_work: '2026-10-30' }, '2026-11-01').late, false, 'Sunday: Friday is the last working day');
  assert.equal(freshStamp({ done_work: '2026-10-30' }, '2026-11-02').late, false, 'Monday: Friday is the last working day');
  const held = freshStamp({ done_work: '2026-10-30' }, '2026-11-03');
  assert.equal(held.late, true, 'Tuesday: Monday is missing');
  assert.match(held.text, /Veri-Shred/);
});

test('#19 a briefing point has to be worth about $25K a year', async () => {
  const { pointsView, monthView, customerView, crossSellView, densityView } = await import('../public/components/home2data.js');
  const d = D(), dens = densityView(d), args = { month: monthView(d), cust: customerView(d), cross: crossSellView(d), lines: null };
  assert.ok(pointsView(d, { ...args, dens: { ...dens, save: [{ ...dens.save[0], saving: 4000 }] } }).every(p => p.key !== 'location'));
  assert.ok(pointsView(d, { ...args, dens: { ...dens, save: [{ ...dens.save[0], saving: 30000 }] } }).some(p => p.key === 'location'));
});

test('#25 a session is a signed cookie: it survives a restart, and a forged one is refused', async () => {
  process.env.SESSION_SECRET = 'test-secret'; process.env.AUTH_USERS = `a:${require('bcryptjs').hashSync('p', 4)}:owner`;
  const express = require('express'), auth = require('../server/auth');
  const start = () => new Promise(ok => { const app = express(); app.use(express.urlencoded({ extended: false })); auth.install(app); app.get('/who', (q, r) => r.json(q.session.user)); const s = app.listen(0, () => ok(s)); });
  const s1 = await start(), url = s => `http://localhost:${s.address().port}`;
  const login = await fetch(url(s1) + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=a&password=p' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  s1.close();
  const s2 = await start();   // a restart: nothing kept on the server
  assert.equal((await (await fetch(url(s2) + '/who', { headers: { cookie } })).json()).role, 'owner');
  const forged = await fetch(url(s2) + '/who', { redirect: 'manual', headers: { cookie: cookie.slice(0, -3) + 'abc' } });
  assert.equal(forged.status, 302);
  s2.close();
});
