// The tour points at real elements. This checks each target is marked somewhere in the app's source and the config is sound; the rendered
// check is scripts/tour_check.cjs (npm run tour), which opens every step in a browser. Also who can sign in (server/users.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'data' ? [] : walk(path.join(d, e.name))) : /\.(js|html)$/.test(e.name) ? [path.join(d, e.name)] : []);

test('every tour target is marked in the app, and no tour runs long', async () => {
  const { TOURS, GUIDES, allTargets, stepsFor, TOUR_VERSION, WELCOME } = await import('../public/components/tourdata.js');
  const src = walk('public').filter(f => !/tourdata\.js$/.test(f)).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  for (const t of allTargets()) assert.ok(src.includes(`data-tour="${t}"`) || src.includes(`, '${t}')}`), `no element marked data-tour="${t}"`);   // a lit card takes its mark as an argument
  assert.ok(stepsFor('full', true).length <= 10);
  assert.ok(stepsFor('full', false).length < stepsFor('full', true).length, 'an admin gets the Settings step');
  assert.ok(!stepsFor('full', false).some(s => s.target === 'gear'), 'nobody else is pointed at Settings');
  for (const k of ['quote', 'account']) assert.ok(TOURS[k].length >= 3 && TOURS[k].length <= 5, k);
  for (const s of Object.values(TOURS).flat()) { assert.ok(s.tab.startsWith('#')); assert.ok(s.title && s.body); assert.ok(s.body.length < 220, s.title); }
  for (const [k] of GUIDES) { assert.ok(TOURS[k] && TOURS[k].length >= 3 && TOURS[k].length <= 10, k); }
  assert.ok(Number.isInteger(TOUR_VERSION));
  assert.deepStrictEqual(WELCOME.choices.map(c => c[0]), ['full', 'quote', 'account']);
  assert.ok(!/Money|Six places/.test(JSON.stringify(TOURS)), 'Money came out on 3 November 2026');
});

test('users: the starting list signs in, names are not case sensitive, nothing shows a hash', async () => {
  const bcrypt = require('bcryptjs');
  process.env.USE_FIXTURES = '1';
  const U = require('../server/users.js'), file = path.join(__dirname, '..', 'data', 'users.json'), kept = fs.existsSync(file) ? fs.readFileSync(file) : null;
  try {
    if (kept) fs.unlinkSync(file);
    await U.init([{ name: 'theran', hash: bcrypt.hashSync('a-long-password', 4), role: 'admin' }, { name: 'anne', hash: bcrypt.hashSync('another-password', 4), role: 'billing' }]);
    assert.ok(U.check('Theran', 'a-long-password'));
    assert.strictEqual(U.check('theran', 'wrong'), null);
    assert.strictEqual(U.check('nobody', 'a-long-password'), null);
    assert.deepStrictEqual(U.owners(), ['anne', 'theran']);
    assert.ok(!U.find('anne').hash.includes(U.passMark(U.find('anne'))), 'the mark in the cookie is not part of the hash');
  } finally { if (kept) fs.writeFileSync(file, kept); else if (fs.existsSync(file)) fs.unlinkSync(file); }
});
