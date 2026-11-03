// Opportunities as a worked list (components/opps.js): the totals hold, each account counts once, what the team sends is on the list,
// a move the data no longer supports stays visible but adds to nothing, and a status shows at the move furthest along.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const J = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data;
const D = { C: J('customers'), PR: J('pricing'), CA: J('calls'), M: J('margin') };
const load = () => import('../public/components/opps.js');
const near = (a, b, t = 0.01) => assert.ok(Math.abs(a - b) < t, `${a} against ${b}`);
const said = (key, level1, o = {}) => ({ [key]: { key, level1, status: 'open', owner: null, value: 1000, note: 'A note.', who: 'anne', at: '2026-11-03T12:00:00Z', next_step: null, ...o } });

test('the pipeline counts each account once and adds to the totals', async () => {
  const { opportunities, byAccount, pipeline } = await load();
  const G = byAccount(opportunities(D, {}).rows), P = pipeline(G);
  assert.strictEqual(P.reduce((t, s) => t + s.n, 0), G.accounts);
  near(P.reduce((t, s) => t + s.value, 0), G.largest);
  near(P.reduce((t, s) => t + s.once, 0), G.once);
  assert.strictEqual(P[0].n, G.accounts, 'nothing said yet, so everything is open');
});

test('every move carries how sure it is, on the one scale', async () => {
  const { opportunities } = await load();
  const { gapConfidence } = await import('../public/components/whitespace.js');
  for (const r of opportunities(D, {}).rows) {
    assert.ok([1, 2, 3].includes(r.conf), r.key);
    if (r.kind !== 'cross') assert.strictEqual(r.conf, 3, r.key);
    else assert.ok(r.conf < 3, r.key);
  }
  assert.strictEqual(gapConfidence({ basisLevel: 'similar', peerCount: 8 }), 2);
  assert.strictEqual(gapConfidence({ basisLevel: 'kind', peerCount: 8 }), 2);
  assert.strictEqual(gapConfidence({ basisLevel: 'similar', peerCount: 7 }), 1);
  assert.strictEqual(gapConfidence({ basisLevel: 'book', peerCount: 76 }), 1);
});

test('what someone sends from another screen is on the list', async () => {
  const { opportunities, applyStatuses } = await load();
  const base = opportunities(D, {}).rows, id = D.M.accounts.find(a => /CHICAGO/.test(a.customer)).level1;
  const r = applyStatuses(base, said(`route:${id}:60563`, id), D.M).find(x => x.key === `route:${id}:60563`);
  assert.ok(r, 'a far area from Operations');
  assert.strictEqual(r.kind, 'route');
  assert.ok(!r.stale);
  const city = D.M.accounts.find(a => a.customer.toUpperCase().startsWith('CITY OF CHICAGO')).level1;
  const low = applyStatuses(base, said(`cross:${city}:handling`, city), D.M).find(x => x.key === `cross:${city}:handling`);
  assert.ok(low && !low.stale, 'a line bought but low for its size');
  assert.ok(low.reason.includes('retrieval'));
});

test('a move the data no longer supports stays, says so and adds to nothing', async () => {
  const { opportunities, applyStatuses, byAccount, accountState } = await load();
  const base = opportunities(D, {}).rows, before = byAccount(base);
  const rich = before.rows[0], key = `slip:${rich.level1}:gone`;
  const after = byAccount(applyStatuses(base, said(key, rich.level1, { value: 99e6, owner: 'anne' }), D.M));
  const a = after.rows.find(x => x.level1 === rich.level1), m = a.items.find(x => x.key === key);
  assert.ok(m.stale); assert.ok(/No longer sized/.test(m.reason));
  near(after.largest, before.largest); near(after.once, before.once);
  assert.notStrictEqual(accountState(a).best.key, key);
});

test('an account stands at its move furthest along, its dollars stay at its best', async () => {
  const { opportunities, applyStatuses, byAccount, accountState } = await load();
  const base = opportunities(D, {}).rows, G = byAccount(base), a = G.rows.find(x => x.items.filter(r => !r.once).length > 1);
  const yearly = a.items.filter(r => !r.once).sort((x, y) => y.value - x.value), small = yearly[yearly.length - 1], big = yearly[0];
  const one = byAccount(applyStatuses(base, said(small.key, a.level1, { status: 'contacted', owner: 'mike', next_step: '2026-11-20' }), D.M)).rows.find(x => x.level1 === a.level1);
  const t = accountState(one);
  assert.strictEqual(t.status, 'contacted'); assert.strictEqual(t.owner, 'mike'); assert.strictEqual(t.next, '2026-11-20');
  assert.strictEqual(t.lead.key, small.key); assert.strictEqual(t.best.key, big.key); near(t.year, big.value);
  const won = byAccount(applyStatuses(base, { ...said(big.key, a.level1, { status: 'won' }) }, D.M)).rows.find(x => x.level1 === a.level1);
  assert.strictEqual(accountState(won).status, 'open', 'a smaller move is still to do');
  const closed = Object.assign({}, ...a.items.map(r => said(r.key, a.level1, { status: r === big ? 'won' : 'lost' })));
  assert.strictEqual(accountState(byAccount(applyStatuses(base, closed, D.M)).rows.find(x => x.level1 === a.level1)).status, 'won');
});

test('the kinds add up, and the points read from the list', async () => {
  const { opportunities, byAccount, kindMix, oppsPoints, inKind } = await load();
  const G = byAccount(opportunities(D, {}).rows), K = kindMix(G);
  near(K.filter(x => !x.once).reduce((t, x) => t + x.value, 0), G.largest);
  near(K.find(x => x.once).value, G.once);
  for (const x of K) assert.strictEqual(G.rows.filter(a => inKind(a, x.kind)).length, x.n, x.kind);
  const pts = oppsPoints(G, v => '$' + Math.round(v));
  assert.strictEqual(pts.length, 3);
  assert.strictEqual(pts[0].tone, 'r');
  assert.ok(/Nobody owns/.test(pts[0].lead));
});
