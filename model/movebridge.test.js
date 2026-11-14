'use strict';
// Why an account moved (components/movebridge.js), the units on Accounts (linegrid.js lineMonths) and the units behind a
// cross-sell gap (crossdrill.js): every split adds back to the figure it explains. Fixtures and small known cases.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = n => require(`../fixtures/${n}.json`).data;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);
const sum = a => a.reduce((t, v) => t + v, 0);

test('classifyWork: regular, occasional, one-off, new, and a spike on top', async () => {
  const { classifyWork } = await import('../public/components/movebridge.js');
  assert.equal(classifyWork([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]).kind, 'regular');
  assert.equal(classifyWork([0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 0]).kind, 'occasional');
  const once = classifyWork([0, 0, 0, 500, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(once.kind, 'oneoff'); assert.equal(once.extra[3], 500);
  assert.equal(classifyWork([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10, 10]).kind, 'new');
  const spike = classifyWork([10, 10, 10, 10, 10, 50, 10, 10, 10, 10, 10, 10]);
  assert.equal(spike.kind, 'regular'); assert.equal(spike.extra[5], 40);
});

test('explainMove: one-off and regular, volume and price, add to the move on every base', async () => {
  const { explainMove, windows } = await import('../public/components/movebridge.js');
  const months = Array.from({ length: 18 }, (_, i) => `2025-${String(i % 12 + 1).padStart(2, '0')}-01`);
  const lines = {
    bin: { name: 'Bins', r: months.map((_, i) => i < 15 ? 1000 : 800), u: months.map((_, i) => i < 15 ? 100 : 80) },
    labour: { name: 'Labour', r: months.map((_, i) => i === 10 ? 5000 : 0), u: months.map((_, i) => i === 10 ? 50 : 0) },
    storage: { name: 'Storage', r: months.map(() => 2000), u: null },
  };
  for (const base of ['avg12', 'prev3', 'ly3']) {
    assert.ok(windows(months.length, base), base);
    const x = explainMove({ months, lines, base });
    near(x.d, x.nowAvg - x.refAvg, 0.01, `${base}: move is now less then`);
    near(x.parts.oneOff + x.parts.regular, x.d, 0.01, `${base}: one-off + regular`);
    near(x.parts.volume + x.parts.price + x.parts.noUnits, x.parts.regular, 0.01, `${base}: volume + price + no units = regular`);
    near(sum(x.byLine.map(l => l.d)), x.d, 0.01, `${base}: lines add up`);
  }
  const x = explainMove({ months, lines, base: 'avg12' }), bin = x.byLine.find(l => l.key === 'bin'), lab = x.byLine.find(l => l.key === 'labour');
  assert.equal(lab.kind, 'oneoff'); near(lab.oneOff, lab.d, 0.01, 'a one-off line moves only as one-off');
  assert.ok(bin.volume < 0 && Math.abs(bin.price) < 0.01, 'bins fell on volume at the same price');
});

test('explainMove on the fixtures: every account with line history adds back to its own move', async () => {
  const G = await import('../public/components/linegrid.js'), M = await import('../public/components/movebridge.js');
  const C = load('customers'), AM = load('accountmonths'), AL = load('accountlines');
  let n = 0;
  for (const a of C.accounts.slice(0, 60)) {
    const H = G.accountHistory({ C, AM, AL }, a.level1); if (!H) continue;
    const x = M.explainMove({ months: H.months, lines: H.lines, base: 'prev3' }); if (!x) continue;
    near(sum(x.byLine.map(l => l.d)), x.d, 0.01, `${a.customer} lines`);
    near(x.parts.oneOff + x.parts.regular, x.d, 0.01, `${a.customer} parts`);
    // the lines add to the account's own months: storage + service as billed
    const tot = H.months.map((_, i) => sum(Object.values(H.lines).map(l => l.r[i])));
    const i = C.months.indexOf(H.months[H.months.length - 1]);
    near(tot[tot.length - 1], a.storage[i] + a.service[i], 0.5, `${a.customer} latest month`);
    n++;
  }
  assert.ok(n > 20, `accounts checked: ${n}`);
});

test('Accounts: with a line chosen, the table is that line only, and its total is the line in accountlines', async () => {
  const G = await import('../public/components/linegrid.js');
  const AM = load('accountmonths'), AL = load('accountlines'), LM = G.lineMonths(AM, AL);
  for (const fam of ['bin', 'handling', 'shred']) for (const m of AM.months.slice(-3)) {
    const i = AM.months.indexOf(m);
    const table = sum([...LM].filter(([id]) => id !== 6714).map(([, f]) => f[fam] ? f[fam].r[i] : 0));
    const lines = sum(AL.rows.filter(r => r.family === fam && r.month === m && r.level1 !== 6714).map(r => r.revenue));
    near(table, lines, 0.5, `${fam} ${m}`);
  }
  // units, where the snapshot carries them, follow the same months
  const withUnits = { rows: AL.rows.map(r => ({ ...r, units: 2 })), bins: [{ level1: AL.rows[0].level1, month: AM.months[AM.months.length - 1], bins: 7 }] };
  const LU = G.lineMonths(AM, withUnits), a = LU.get(AL.rows[0].level1);
  assert.equal(a.binsDone[AM.months.length - 1], 7);
  assert.ok(Object.values(a).some(f => f && f.u && f.u.some(v => v === 2)), 'units carried');
});

test('cross-sell: a gap in units, priced, is the gap in dollars', async () => {
  const X = await import('../public/components/crossdrill.js'), W = await import('../public/components/whitespace.js');
  const M = load('margin'), U = X.unitRates(M), ws = W.buildWhitespace(M, { exclude: [6714], top: 200 });
  let n = 0;
  for (const r of ws.rows.slice(0, 40)) for (const g of X.drillData(r, null, U).gaps) {
    if (!g.units) continue;
    near(g.units.units * g.units.price, g.gap, 0.01, `${r.customer} ${g.key}`);
    n++;
  }
  assert.ok(n > 10, `gaps checked: ${n}`);
});
