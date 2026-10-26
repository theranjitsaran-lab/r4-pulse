'use strict';
// The bridge to $1.0m and the lists behind it must agree: each step is the sum of the accounts its
// list shows. Runs on the committed fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const J = n => require(`../fixtures/${n}.json`).data;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);

test('whitespace: the total is the sum of its not-bought cells, and no cell exceeds the account', async () => {
  const { buildWhitespace, LINES } = await import('../public/components/whitespace.js');
  const W = buildWhitespace(J('margin'), { exclude: [6714], top: 200 });
  const cells = W.rows.flatMap(r => LINES.map(x => r.cells[x.key]).filter(c => !c.have));
  near(W.total, cells.reduce((t, c) => t + c.opp, 0), 0.01, 'total');
  for (const r of W.rows) for (const x of LINES) {
    const c = r.cells[x.key];
    if (!c.have) assert.ok(c.opp <= r.total + 0.01, `${r.customer} ${x.key}: ${c.opp} over ${r.total}`);
  }
  assert.ok(!W.rows.some(r => r.level1 === 6714), 'Citadel held apart');
});

test('bridge: cross-sell step is the cross-sell grid; price step is half the price-gap list', async () => {
  const { bridge, serviceGaps, storageGaps, CROSS_SELL_DEPTH } = await import('../public/components/levers.js');
  const { buildWhitespace } = await import('../public/components/whitespace.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin');
  const B = bridge({ P, PR, CA, M, C: J('customers') });
  const step = k => (B.steps.find(s => s.key === k) || B.minor.find(s => s.key === k) || { v: 0 }).v;
  near(step('cross'), buildWhitespace(M, { exclude: [6714], top: CROSS_SELL_DEPTH }).total / 12, 0.01, 'cross-sell');
  const gaps = [...serviceGaps(PR).values()].reduce((t, a) => t + a.worth, 0) + storageGaps(PR).rows.reduce((t, r) => t + r.worth, 0);
  near(step('price'), gaps / 2, 0.01, 'price');
  near(B.today + B.levers + B.newBusiness, Math.max(1e6, B.today + B.levers), 0.01, 'bridge closes at $1.0m');
});

test('overdue boxes: Home and the Overdue boxes list read the same figures', async () => {
  const { bridge, overdueBoxes } = await import('../public/components/levers.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin');
  const B = bridge({ P, PR, CA, M, C: J('customers') }), O = overdueBoxes(CA, PR);
  near(B.overdue.boxes, O.rows.reduce((t, r) => t + r.boxes, 0), 0.01, 'boxes');
  near(B.overdue.storageLost, O.rows.reduce((t, r) => t + r.lost, 0), 0.01, 'storage lost');
  assert.ok(!O.rows.some(r => r.level1 === 6714), 'Citadel held apart');
});

test('margin: Home\'s row and the Margin view count the same loss-making accounts and dollars', async () => {
  const { marginSummary, buildMargins } = await import('../public/components/margin.js');
  const R = require('./rates');
  const MS = marginSummary(R, J('margin'), [6714]);
  // the Margin view's below-cost filter, rebuilt independently from buildMargins
  const loss = buildMargins(R, J('margin'), { exclude: [6714] }).accounts.filter(a => a.revenue > 1000 && a.margin < 0);
  assert.equal(MS.losers.length, loss.length, 'accounts');
  near(MS.lossTotal, -loss.reduce((t, a) => t + a.margin, 0), 0.01, 'dollars');
  assert.ok(MS.losers.every(a => MS.below.includes(a)), 'every loss-making account is in the below-cost filter');
});

test('slipping, pace and the bill: each figure shown twice comes from one source', async () => {
  const { bridge, slippingAccounts, crossSellPace, billNow } = await import('../public/components/levers.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin'), C = J('customers');
  const B = bridge({ P, PR, CA, M, C });
  const slipList = slippingAccounts(C);
  near((B.steps.concat(B.minor).find(s => s.key === 'slip') || { v: 0 }).v, slipList.reduce((t, d) => t - d.move.d, 0) / 2, 0.01, 'slipping step = half the list');
  assert.ok(slipList.every(d => d.move.pct <= -0.1), 'every slipping account is down 10% or more on its own run');
  assert.ok(!slipList.some(d => d.level1 === 6714), 'Citadel held apart');
  assert.deepEqual(B.pace, crossSellPace(M.history), 'Home and the grid read one pace');
  const run = P.currentRun.find(r => r.part === 'run');
  near(billNow(P).core, run.storage + run.service - run.citadel, 0.01, 'bill = run core');
});

test('projection: done to date + days left × pace; the band is backtested leave-one-out', async () => {
  const { project, dailyFrom, weekdaysOf, curve } = await import('../public/components/projection.js');
  // fifteen months of synthetic work, 100 a weekday with a month-by-month swing, then 4 days of October
  const daily = [];
  for (let m = 0; m < 15; m++) {
    const month = new Date(Date.UTC(2025, 6 + m, 1)).toISOString().slice(0, 10);
    for (const d of weekdaysOf(month)) daily.push({ date: d, done: 100 + 10 * Math.sin(m), booked: 190 });
  }
  const latest = '2026-10-06';
  for (const d of weekdaysOf('2026-10-01').filter(d => d <= latest)) daily.push({ date: d, done: 120, booked: 200 });
  const x = project({ daily, latest, perService: 100, storage: 400000 });
  assert.equal(x.elapsed, 4); assert.equal(x.remaining, 18); assert.equal(x.doneToDate, 480);
  near(x.services.central, 480 + 18 * x.pace, 1e-6, 'central');
  near(x.bill.central, 400000 + x.services.central * 100, 1e-6, 'bill');
  assert.ok(x.backtest && x.backtest.n === 12, 'twelve months backtested');
  assert.ok(x.services.lo <= x.services.central && x.services.central <= x.services.hi, 'band holds the central');
  assert.ok(x.services.lo >= x.doneToDate, 'never below the work already done');
  // on the fixtures (no backtest yet): the bill is the storage plus the work at last month's value
  const P = J('pulse'), A = J('activity'), run = P.currentRun.find(r => r.part === 'run');
  const f = project({ daily: dailyFrom(P, A), latest: A.latestDone, perService: 114.5, storage: run.storage, routeDays: A.routeDays });
  near(f.bill.central, run.storage + f.services.central * 114.5, 1e-6, 'fixture bill');
  // a past month's curve ends on its total
  const c = curve(daily, '2026-09-01', 100, 0);
  near(c[c.length - 1].done, daily.filter(r => r.date.startsWith('2026-09')).reduce((t, r) => t + r.done, 0), 1e-6, 'curve total');
});
