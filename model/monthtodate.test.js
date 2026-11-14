'use strict';
// The month so far (Today's main figure and its pop-out): storage on the month's bill plus the work done so far,
// against the month before at the same point. Every customer row and every line must add to the figure shown.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = n => require(`../fixtures/${n}.json`).data;
const D = () => ({ P: load('pulse'), A: load('activity'), C: load('customers'), M: load('margin'), SG: load('segments'), LW: load('linework'), AM: load('accountmonths') });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);
const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

test('the month so far: storage plus work, and the customer rows and the lines each add to it', async () => {
  const L = await import('../public/components/linework.js');
  const T = L.monthToDate(D());
  assert.ok(T, 'a month in progress');
  near(T.total, T.storage + T.work, 0.01, 'total = storage + work');
  near(sum(T.byLine, l => l.v), T.total, 0.01, 'lines add up');
  near(sum(T.byCustomer, r => r.total), T.total, 0.5, 'customers add up');
  near(sum(T.byCustomer, r => r.work), T.work, 0.5, 'customer work adds up');
  assert.ok(T.byCustomer.every(r => r.level1 !== 6714 || r.work === 0), 'Citadel\'s work held apart; its storage is core');
  const unplaced = T.byCustomer.find(r => r.level1 == null);
  assert.ok(!unplaced || Math.abs(unplaced.total) < 0.01 * T.storage, `storage not on an account is small: ${unplaced && unplaced.total}`);
  const est = L.workEstimate(D().LW, D().A, D().P).byMonth.get(T.month);
  near(T.work, est.total, 0.01, 'work is the line estimate, jobs to check left out');
});

test('the month before at the same point: storage whole, work scaled to the same share of working days', async () => {
  const L = await import('../public/components/linework.js');
  const d = D(), T = L.monthToDate(d), S = L.lineSeries(d);
  const services = T.byLine.filter(l => l.key !== 'storage');
  near(T.byLine.find(l => l.key === 'storage').prevAt, S.val('storage', T.prevMonth), 0.01, 'storage compared whole');
  for (const l of services) near(l.prevAt, S.val(l.key, T.prevMonth) * T.frac, 0.01, `${l.key} scaled`);
  near(T.prevAt, sum(T.byLine, l => l.prevAt), 0.01, 'the comparison adds up');
  assert.ok(T.day >= 1 && T.day <= T.workdays, 'day within the month');
});
