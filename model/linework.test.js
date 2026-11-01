// Lines of business: every figure Home's lines show must add up to the figure above it.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const load = n => require(`../fixtures/${n}.json`).data;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.5, `${msg}: ${a} against ${b}`);

test('a line, its customers and all others add up, in every month and line', async () => {
  const L = await import('../public/components/linework.js');
  const D = { P: load('pulse'), A: load('activity'), C: load('customers'), M: load('margin'), SG: load('segments'), LW: load('linework') };
  const V = L.lineView(D);
  for (const m of V.pick) for (const r of V.rows) {
    const d = L.lineDetail(D, r.key, m);
    near(d.top.reduce((t, x) => t + x.v, 0) + d.others, d.total, `${r.key} ${m}`);
    near(d.total, r.by[m].v, `${r.key} ${m} tile`);
  }
});

test('a priced month by account agrees with the segments query; a bill breakdown adds up to the bill', async () => {
  const L = await import('../public/components/linework.js');
  const D = { P: load('pulse'), A: load('activity'), C: load('customers'), M: load('margin'), SG: load('segments'), LW: load('linework') };
  const m = L.lineView(D).lastPriced;
  for (const key of ['bin', 'shred', 'itad', 'handling', 'movement', 'labour', 'other']) {
    const seg = D.SG.rows.filter(r => r.month === m && r.family === key).reduce((t, r) => t + r.revenue, 0);
    const byAcc = D.LW.priced.filter(r => r.month === m && r.family === key).reduce((t, r) => t + r.revenue, 0);
    near(byAcc, seg, `${key} ${m}`);
  }
  const last = D.P.monthly[D.P.monthly.length - 1], B = L.billBreakdown(D, last.month, last.core);
  near(B.top.reduce((t, p) => t + p.v, 0) + B.rest, last.core, 'bill');
});

test('a flat-fee account is not priced at the book: its own $0 rate stands', async () => {
  const L = await import('../public/components/linework.js');
  const row = o => ({ month: '2026-09-01', level1: 1, servcode: 'B2', family: 'bin', revenue: 0, units: 100, lines: 10, ...o });
  const other = row({ level1: 2, revenue: 900, units: 10 });
  const LW = { priced: [row(), other], orders: [{ month: '2026-10-01', level1: 1, servcode: 'B2', description: 'x', family: 'bin', orders: 5, units: 50 }] };
  const W = L.workEstimate(LW, { latestDone: '2026-10-30' }, {});
  assert.strictEqual(W.byMonth.get('2026-10-01').byFam.bin, 0);
});
