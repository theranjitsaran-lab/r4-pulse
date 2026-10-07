'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('./rates');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);

test('Ingalls: 6,886 bins, 62 visits → $9.29 a bin, $63,997 a year', () => {
  const c = R.costToServe('bin', 6886, { visits: 62, miles: 11.4 });
  near(c.total, 63997, 5, 'total');
  near(c.perUnit, 9.29, 0.01, 'per unit');
  assert.equal(c.lines.length, 3);
  assert.equal(c.visits, 62);
  // gross margin at the price actually paid
  near(3.26 * 6886 - c.total, -41549, 5, 'margin at $3.26');
});

test('Storage: 227,915 boxes → $339,138 a year, no route time', () => {
  const c = R.costToServe('storage', 227915);
  near(c.total, 339138, 5, 'total');
  assert.equal(c.lines.length, 1);
  assert.equal(c.visits, 0);
});

test('Delivery: 840 drops, visits modelled → 130 visits, $25.62 a drop', () => {
  const c = R.costToServe('movement', 840);
  assert.equal(c.visits, 130);
  near(c.perUnit, 25.62, 0.05, 'per unit');
});

test('Handling never carries travel or on-site time', () => {
  const c = R.costToServe('handling', 2400);
  assert.equal(c.visits, 0);
  assert.ok(c.lines.every(l => !/travel|on site|time on site/i.test(l[0])));
  near(c.total, 2400 * R.RATES.handling.v, 0.01, 'total');
});

test('ITAD: one collection covers thousands of units', () => {
  const c = R.costToServe('itad', 29000, { visits: 12 });
  assert.equal(c.visits, 12);
  const d = R.costToServe('itad', 29000);
  assert.equal(d.visits, Math.ceil(29000 / 4000));
});

test('Labour: driver and centre rates differ', () => {
  const a = R.costToServe('labour', 10), b = R.costToServe('labour', 10, { isCentre: true });
  near(a.total, 324.9, 0.01, 'driver');
  near(b.total, 250.5, 0.01, 'centre');
});

test('SPLIT changes route families (via distance) and not storage', () => {
  // At the average distance, travel and on-site shares sum to a whole route day whatever the
  // split — so the split only bites through the mileage scaling. That is by design.
  const was = R.SETTINGS.split;
  const bin0 = R.costToServe('bin', 6886, { visits: 62, miles: 20 }).total;
  const sto0 = R.costToServe('storage', 227915).total;
  R.SETTINGS.split = 0.55;
  const bin1 = R.costToServe('bin', 6886, { visits: 62, miles: 20 }).total;
  const sto1 = R.costToServe('storage', 227915).total;
  R.SETTINGS.split = was;
  assert.notEqual(bin0, bin1);
  assert.equal(sto0, sto1);
});

test('Every rate carries a derivation and a confidence flag', () => {
  for (const [k, r] of Object.entries(R.RATES)) {
    assert.ok(typeof r.v === 'number', `${k}.v`);
    assert.ok(['measured', 'observed', 'partial', 'estimate', 'assumed'].includes(r.c), `${k}.c`);
    assert.ok(r.d && r.d.length > 20, `${k}.d`);
  }
});

test('familyOf maps the common service names', () => {
  assert.equal(R.familyOf('Rotate 95 gallon'), 'bin');
  assert.equal(R.familyOf('RETRIEVAL/BOX'), 'handling');
  assert.equal(R.familyOf('DESTRUCTION PULL - S'), 'itad');
  assert.equal(R.familyOf('Delivery / pick-up charge'), 'movement');
  assert.equal(R.familyOf('Carton storage'), 'storage');
  assert.equal(R.familyOf('Labor (per hour)'), 'labour');
});

test('No cost number lives outside model/rates.js', () => {
  // the rates that would be tempting to hard-code elsewhere
  const needles = ['6.13', '0.124', '680', '0.34', '32.49'];
  const roots = ['server', 'public'];
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|html)$/.test(f) || /rates\.js$/.test(f)) continue;
      const src = fs.readFileSync(p, 'utf8');
      for (const n of needles) {
        // a bare literal like "6.13" used as a number, not inside a word or a date
        if (new RegExp(`[^\\w.]${n.replace('.', '\\.')}(?![\\d\\w])`).test(src)) offenders.push(`${p} has ${n}`);
      }
    }
  };
  for (const r of roots) if (fs.existsSync(path.join(__dirname, '..', r))) walk(path.join(__dirname, '..', r));
  assert.deepEqual(offenders, []);
});
