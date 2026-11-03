// A margin reads one way everywhere: the grid's pill and the drawer's label are the same word and colour, for every account, and nothing
// in the code keeps a second definition. On the real snapshot.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = require('./rates.js');
const J = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data;
const near = (a, b, t = 1) => assert.ok(Math.abs(a - b) <= t, `${a} against ${b}`);

test('the band follows the cut-offs on Settings', async () => {
  const { marginBand } = await import('../public/components/margin.js');
  const S = R.SETTINGS, w = v => marginBand(R, v).word;
  assert.strictEqual(w(S.marginHealthy), 'Healthy');
  assert.strictEqual(w(S.marginHealthy - .001), 'Normal');
  assert.strictEqual(w(S.marginThin), 'Normal');
  assert.strictEqual(w(S.marginThin - .001), 'Thin');
  assert.strictEqual(w(-.01), 'Thin, losing money');
  assert.strictEqual(w(.27), 'Normal', 'not Thin, as the drawer once said');
  assert.strictEqual(w(null), 'Not costed');
});

test('the grid pill and the drawer label agree for every account', async () => {
  const { marginBand, marginHead } = await import('../public/components/margin.js');
  const { ragLabel } = await import('../public/components/lit.js');
  const { customerBook } = await import('../public/components/custbook.js');
  const B = customerBook({ C: J('customers'), M: J('margin'), PR: J('pricing'), R });
  let n = 0;
  for (const r of B.rows) {
    if (r.revenue == null || r.cost == null) continue;
    const pill = marginBand(R, r.pc), head = marginHead(R, r.revenue, r.cost);
    assert.strictEqual(head.band.word, pill.word, r.customer);
    assert.strictEqual(head.band.cls, pill.cls, r.customer);
    assert.ok(ragLabel(R, head.pc).includes(`rag static ${pill.cls}`));
    n++;
  }
  assert.ok(n > 100, `checked ${n}`);
});

test("a drawer's lines add up to the margin the pill was showing", async () => {
  const { accountJobs, marginHead, marginBand, FAMILY_NAMES } = await import('../public/components/margin.js');
  const { customerBook } = await import('../public/components/custbook.js');
  const M = J('margin'), B = customerBook({ C: J('customers'), M, PR: J('pricing'), R });
  const orders = J('jobs').accounts;
  void FAMILY_NAMES;
  const row = n => B.rows.find(r => r.customer.toUpperCase().startsWith(n));
  for (const name of ['CITY OF CHICAGO', 'ICU MEDICAL']) {
    const r = row(name), a = M.accounts.find(x => x.level1 === r.level1), o = orders.find(x => x.level1 === r.level1);
    const F = accountJobs(R, a, M.lines.filter(l => l.level1 === r.level1), o.orders, {});
    near(Object.values(F.fams).reduce((t, x) => t + x.revenue, 0) + (F.noLine || 0), r.revenue, 2);
    assert.strictEqual(marginHead(R, r.revenue, r.cost).band.word, marginBand(R, r.pc).word);
  }
});

test('the fixes rank by how realistic, the best is never unrealistic, and a big rise is said as a multiple', async () => {
  const { marginFixes, fixChange, drawerPoints, ASK_EASY, ASK_MAX } = await import('../public/components/margin.js');
  const F = { fams: { storage: { family: 'storage', revenue: 1000, cost: 500 }, movement: { family: 'movement', revenue: 100, cost: 300 } } };
  const out = marginFixes([{ kind: 'price', family: 'movement', title: 'Delivery: price for a 40% margin', say: 'x', worth: 900 }, { kind: 'price', family: 'storage', title: 'Storage: price for a 40% margin', say: 'x', worth: 100 }, { kind: 'ops', family: 'movement', title: 'Delivery: batch', say: 'x', worth: 50 }], [{ kind: 'price', line: 'storage', key: 'price:1:storage', code: 'STO', value: 600, reason: 'r' }], F, []);
  assert.deepStrictEqual(out.real.map(f => f.worth), [600, 100, 50]);
  assert.ok(out.real[0].best);
  assert.deepStrictEqual(out.hard.map(f => f.worth), [900]);
  assert.strictEqual(out.real[1].ask, 'easy'); assert.ok(.1 <= ASK_EASY);
  assert.strictEqual(out.real[0].ask, 'mid'); assert.ok(.6 <= ASK_MAX);
  assert.strictEqual(out.real[2].ask, 'easy');
  assert.strictEqual(fixChange(out.real[0]), '+60%');
  assert.strictEqual(fixChange(out.hard[0]), '10.0× today');
  assert.strictEqual(fixChange(out.real[2]), 'no price change');
  const pts = drawerPoints(F, out, v => `$${v}`);
  assert.strictEqual(pts.length, 3);
  assert.ok(/Storage/.test(pts[0].lead)); assert.strictEqual(pts[1].tone, 'r'); assert.ok(/Best fix: storage to the book median/.test(pts[2].lead));
});

test('no second definition is written anywhere', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /\.js$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const f of [...walk('public/components'), ...walk('public/views')]) {
    const t = fs.readFileSync(f, 'utf8');
    assert.ok(!/15(%|–| to )\s*(and )?50%|between 15%|Thin, 15/.test(t), `${f} keeps the old band`);
  }
});
