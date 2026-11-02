// The one number module: each form as the screens showed it, down to the kind of minus sign.
'use strict';
const test = require('node:test');
const assert = require('node:assert');

test('money: whole dollars, short, a rate and the older negative', async () => {
  const { money } = await import('../public/components/format.js');
  assert.equal(money(606738.4), '$606,738');
  assert.equal(money(-1234.5), '−$1,235');
  assert.equal(money(0), '$0');
  assert.equal(money(607000, { short: true }), '$607K');
  assert.equal(money(-35000, { short: true }), '−$35K');
  assert.equal(money(1486210, { short: true }), '$1.5M');
  assert.equal(money(12400000, { short: true }), '$12M');
  assert.equal(money(479, { short: true }), '$479');
  assert.equal(money(12400000, { short: 'abs' }), '$12.4M');
  assert.equal(money(-35000, { short: 'abs' }), '$35K');
  assert.equal(money(-35000, { short: 'hyphen' }), '$-35K');
  assert.equal(money(0.0994, { dp: 4 }), '$0.0994');
  assert.equal(money(0.141, { dp: 3 }), '$0.141');
  assert.equal(money(4.04, { dp: 2 }), '$4.04');
  assert.equal(money(-1234.5, { hyphen: true }), '$-1,234');
  assert.equal(money(2500000, { millions: true }), '$2.5m');
});

test('pct: a share, with the sign each screen used', async () => {
  const { pct } = await import('../public/components/format.js');
  assert.equal(pct(0.12), '12%');
  assert.equal(pct(-0.12), '-12%');
  assert.equal(pct(-0.001), '0%');
  assert.equal(pct(-0.12, { abs: true }), '12%');
  assert.equal(pct(-0.12, { minus: true }), '−12%');
  assert.equal(pct(0.123, { dp: 1 }), '12.3%');
  assert.equal(pct(-3.41), '-341%');
});

test('change: no arrow under 1%, words past 300%', async () => {
  const { change } = await import('../public/components/format.js');
  assert.equal(change(0.12), '▲ 12%');
  assert.equal(change(-0.12), '▼ 12%');
  assert.equal(change(0.004), '0%');
  assert.equal(change(3), 'new');
  assert.equal(change(-1), 'stopped');
  assert.equal(change(0.004, { arrows: true }), '▲ 0%');
  assert.equal(change(4, { arrows: true }), '▲ 400%');
});

test('plain numbers: rounded, grouped as given, null-safe, in thousands', async () => {
  const { num, count, grouped, fixed, thousands } = await import('../public/components/format.js');
  assert.equal(num(1234.6), '1,235');
  assert.equal(count(null), '0');
  assert.equal(grouped(7878.965), '7,878.965');
  assert.equal(fixed(16.04, 1), '16.0');
  assert.equal(thousands(-606738), '−607');
  assert.equal(thousands(null), '0');
});
