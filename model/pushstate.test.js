'use strict';
// Pulse never reads the screens while a push is half-way (server/pushstate.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { midPush, stampOf } = require('../server/pushstate');

const whole = { a: '2026-11-13', b: '2026-11-05', d: '120', e: '2026-11-13', vs: true, inv: true, pl: true, cu: true, sc: true };
test('whole tables: not mid-push, and the stamp moves with the data only', () => {
  assert.equal(midPush(whole), null);
  assert.equal(stampOf(whole), stampOf({ ...whole, vs: true }));
  assert.notEqual(stampOf(whole), stampOf({ ...whole, a: '2026-11-14' }));
});
test('an emptied table or a missing date is a push in progress', () => {
  assert.match(midPush({ ...whole, vs: false, a: null }), /vs_service_orders/);
  assert.match(midPush({ ...whole, pl: false }), /priced_lines/);
  assert.ok(midPush({ ...whole, b: null }));
  assert.ok(midPush(null));
});
