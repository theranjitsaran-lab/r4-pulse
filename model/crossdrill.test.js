// The Cross-sell drill-down holds to its row: the tiles add up, every figure is the row's, and how sure it says it is follows how
// the gap was sized. On the real snapshot, for the three accounts the brief names and then the whole book.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const M = JSON.parse(fs.readFileSync('fixtures/margin.json', 'utf8')).data;
const load = async () => {
  const [{ buildWhitespace, LINES }, D] = await Promise.all([import('../public/components/whitespace.js'), import('../public/components/crossdrill.js')]);
  return { W: buildWhitespace(M, { exclude: [6714], top: 200 }), LINES, ...D };
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} against ${b}`);

test('the tiles add up and come from the row, for every account', async () => {
  const { W, LINES, drillData } = await load();
  for (const r of W.rows) {
    const d = drillData(r);
    near(d.room, d.notBought + d.lowFor);
    near(d.notBought, r.opp);
    near(d.buys, r.total);
    near(d.lowFor, LINES.reduce((t, x) => t + (r.cells[x.key].low ? r.cells[x.key].expected - r.cells[x.key].spend : 0), 0));
    assert.strictEqual(d.notBoughtLines, LINES.filter(x => !r.cells[x.key].have && r.cells[x.key].opp > 0).length);
    if (d.roomPct != null) near(d.roomPct, d.room / r.total);
    for (let i = 1; i < d.gaps.length; i++) assert.ok(d.gaps[i - 1].gap >= d.gaps[i].gap, 'largest gap first');
    assert.ok(!d.lines.some(l => l.key === 'storage'), 'storage left out of the chart');
    for (const g of d.gaps) assert.ok(g.cell.peerCount > 0, `${r.customer} ${g.key} says how many accounts`);
    for (const p of d.peers) assert.notStrictEqual(p.level1, r.level1, 'never compared with itself');
  }
});

test('how sure follows how it was sized', async () => {
  const { confidence, HIGH_PEERS } = await load();
  assert.strictEqual(confidence({ basisLevel: 'similar', peerCount: HIGH_PEERS }), 3);
  assert.strictEqual(confidence({ basisLevel: 'similar', peerCount: HIGH_PEERS - 1 }), 2);
  assert.strictEqual(confidence({ basisLevel: 'kind', peerCount: 40 }), 2);
  assert.strictEqual(confidence({ basisLevel: 'book', peerCount: 76 }), 1);
});

test('three named accounts: figures against the row and the method', async () => {
  const { W, drillData, gapHow } = await load();
  const of = n => drillData(W.rows.find(r => r.customer.toUpperCase().startsWith(n)));
  const chi = of('CITY OF CHICAGO'), a = W.rows.find(r => r.level1 === chi.level1);
  assert.strictEqual(chi.top.key, 'shred');
  near(chi.top.gap, a.cells.shred.opp);
  near(a.cells.shred.opp, W.rates.shred.per1000 * a.boxes / 1000);
  assert.strictEqual(chi.conf, 1);
  assert.ok(/whole book/.test(gapHow(chi.top)));
  assert.deepStrictEqual(chi.lowLines, ['Retrieval and refile']);
  near(chi.lowFor, a.cells.handling.expected - a.cells.handling.spend);
  const cps = of('CHICAGO PUBLIC SCHOOLS');
  assert.deepStrictEqual(cps.lowLines.slice().sort(), ['Delivery', 'Retrieval and refile']);
  assert.strictEqual(cps.notBoughtLines, 3);
  const icu = of('ICU MEDICAL');
  assert.strictEqual(icu.lowFor, 0);
  assert.strictEqual(icu.top.key, 'itad');
  assert.ok(icu.name.startsWith('ICU'));
});

test('the three points carry the trend, and slipping is said before any sale', async () => {
  const { W, drillData } = await load();
  const r = W.rows[0];
  const slip = drillData(r, { kind: 'slipping', move: { d: -35000, run: 75000, last3: 40000 } }).points[1];
  assert.strictEqual(slip.tone, 'r');
  assert.ok(/^Slipping/.test(slip.lead));
  assert.ok(/care/.test(slip.rest));
  assert.ok(/^Rising/.test(drillData(r, { kind: 'rising', move: { d: 10000, run: 16000, last3: 26000 } }).points[1].lead));
  assert.ok(/^Level/.test(drillData(r, { kind: 'level', move: { d: 900, run: 15000, last3: 16000 } }).points[1].lead));
  assert.ok(/history/.test(drillData(r, null).points[1].lead));
  assert.strictEqual(drillData(r).points.length, 3);
});

test("R4's own accounts and placeholders are neither sold to nor sized from", async () => {
  const { W, LINES } = await load();
  const { isInternal } = await import('../public/components/metrics.js');
  assert.ok(M.accounts.some(a => isInternal(a.customer)), 'the snapshot has some to leave out');
  assert.ok(!W.rows.some(r => isInternal(r.customer)), 'none on a row');
  for (const r of W.rows) for (const x of LINES) for (const p of r.cells[x.key].peers || []) assert.ok(!isInternal(p.customer), `${p.customer} used as a comparable`);
  for (const k of Object.values(W.rates)) for (const p of k.examples || []) assert.ok(!isInternal(p.customer));
});
