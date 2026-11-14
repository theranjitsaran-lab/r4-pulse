'use strict';
// The UI pass of 14 November 2026: room on the routes, the fuel cover, and a posted month opened by account and line.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = n => require(`../fixtures/${n}.json`).data;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);
const sum = a => a.reduce((t, v) => t + v, 0);

test('room on the routes: the fleet is the most routes on one day, and room is never negative', async () => {
  const O = await import('../public/components/opsdata.js');
  const RH = load('routehistory'), R = O.routeRoom(RH);
  const day = new Map();
  for (const r of RH) if (r.date >= R.from) { const s = day.get(r.date) || day.set(r.date, new Set()).get(r.date); s.add(r.route); }
  assert.equal(R.fleet, Math.max(...[...day.values()].map(s => s.size)));
  for (const x of R.routes) { assert.ok(x.room >= 0, x.route); assert.ok(x.busiest >= x.typical, x.route); }
  // a known case
  const rh = [];
  for (let d = 1; d <= 20; d++) for (let k = 0; k < (d === 20 ? 9 : 4); k++) rh.push({ date: `2026-01-${String(d).padStart(2, '0')}`, route: 'A', stop: `s${k}`, postcode: '60601' });
  const K = O.routeRoom(rh);
  assert.equal(K.fleet, 1); assert.equal(K.routes[0].typical, 4); assert.equal(K.routes[0].busiest, 4); assert.equal(K.routes[0].room, 0);
});

test('fuel cover: the percentage times service is the trucks\' cost', async () => {
  const O = await import('../public/components/opsdata.js');
  const f = O.fuelCover({ vehicles: 240000, service: 3000000 });
  near(f.pct * f.service, f.vehicles, 0.01, 'cover');
  assert.equal(O.fuelCover({ vehicles: 0, service: 1 }), null);
});

test('a posted month opened: accounts and lines each add to invoiced core, and the month before is every account', async () => {
  const L = await import('../public/components/linework.js');
  const AM = load('accountmonths'), AL = load('accountlines'), P = load('pulse');
  const T = L.monthBilled({ AM, AL });
  const core = new Map(P.monthly.map(m => [m.month, m.core]));
  near(T.total, core.get(T.month), 1, 'total is invoiced core');
  near(sum(T.byCustomer.map(r => r.total)), T.total, 1, 'accounts add up');
  near(sum(T.byLine.map(l => l.v)), T.total, 1, 'lines add up');
  near(T.prevAt, core.get(T.prevMonth), 1, 'the month before is invoiced core then');
});
