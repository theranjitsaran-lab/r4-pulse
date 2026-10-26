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
  const B = bridge({ P, PR, CA, M });
  const step = k => (B.steps.find(s => s.key === k) || B.minor.find(s => s.key === k) || { v: 0 }).v;
  near(step('cross'), buildWhitespace(M, { exclude: [6714], top: CROSS_SELL_DEPTH }).total / 12, 0.01, 'cross-sell');
  const gaps = [...serviceGaps(PR).values()].reduce((t, a) => t + a.worth, 0) + storageGaps(PR).rows.reduce((t, r) => t + r.worth, 0);
  near(step('price'), gaps / 2, 0.01, 'price');
  near(B.today + B.levers + B.newBusiness, Math.max(1e6, B.today + B.levers), 0.01, 'bridge closes at $1.0m');
});
