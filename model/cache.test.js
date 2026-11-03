// Nobody waits for a refresh (server/db.js): an old value is served while a new one is read, and new data replaces old all at once.
const test = require('node:test');
const assert = require('node:assert');
process.env.USE_FIXTURES = '1';
const { cached, replaceCache } = require('../server/db.js');
const tick = () => new Promise(ok => setTimeout(ok, 5));

test('a value past its time is served at once, and refreshed behind it', async t => {
  let reads = 0, now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const read = async () => ++reads;
  assert.strictEqual(await cached('a', read), 1);
  assert.strictEqual(await cached('a', read), 1);
  now += 13 * 60 * 60 * 1000;
  assert.strictEqual(await cached('a', read), 1, 'the old value, not a wait');
  await tick();
  assert.strictEqual(await cached('a', read), 2, 'then the new one');
});

test('a failed refresh keeps the old value', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', () => {});
  await cached('b', async () => 'old');
  now += 13 * 60 * 60 * 1000;
  assert.strictEqual(await cached('b', async () => { throw new Error('database away'); }), 'old');
  await tick();
  assert.strictEqual(await cached('b', async () => 'unused until it is past its time again'), 'old');
});

test('screens asking together cause one read', async () => {
  let reads = 0;
  const read = async () => { reads++; await tick(); return 'v'; };
  await Promise.all([cached('c', read), cached('c', read), cached('c', read)]);
  assert.strictEqual(reads, 1);
});

test('new data replaces old only when all of it is in; a query that fails keeps its old value', async t => {
  t.mock.method(console, 'warn', () => {});
  await cached('d', async () => 'old d');
  await cached('e', async () => 'old e');
  let seenMidway;
  await replaceCache([
    ['d', async () => { seenMidway = await cached('d', async () => 'unused'); return 'new d'; }],
    ['e', async () => { throw new Error('database away'); }],
  ]);
  assert.strictEqual(seenMidway, 'old d');
  assert.strictEqual(await cached('d', async () => 'unused'), 'new d');
  assert.strictEqual(await cached('e', async () => 'unused'), 'old e');
});
