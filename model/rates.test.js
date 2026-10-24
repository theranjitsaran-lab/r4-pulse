'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('./rates');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);

// With DATABASE_URL set, every test below runs on rates derived from model.* in the database;
// without it, on the seed in rates.js. Both must give the same figures.
if (process.env.DATABASE_URL) {
  before(async () => {
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
    await c.connect();
    try { await R.loadFromDb(async (q) => (await c.query(q)).rows); } finally { await c.end(); }
  });
}

// Ingalls, Sep 2025 – Aug 2026 from Veri-Shred: 3,540 done services on 101 customer visits.
// Completion is confirmed on only 35% of Ingalls' 10,024 booked services (54% across the book),
// so the true count sits between 3,540 and 10,024.
test('Ingalls: 3,540 bins, 101 visits → $10.32 a bin, $36,547 a year', () => {
  const c = R.costToServe('bin', 3540, { visits: 101, miles: 11.4 });
  near(c.total, 36547, 5, 'total');
  near(c.perUnit, 10.32, 0.01, 'per unit');
  assert.equal(c.lines.length, 3);
  assert.equal(c.visits, 101);
  // gross margin at the price actually paid
  near(3.26 * 3540 - c.total, -25007, 5, 'margin at $3.26');
});

test('Storage: 227,915 boxes → $271,903 a year, no route time', () => {
  const c = R.costToServe('storage', 227915);
  near(c.total, 271903, 5, 'total');
  assert.equal(c.lines.length, 1);
  assert.equal(c.visits, 0);
});

test('Delivery: 840 drops, visits modelled → 145 visits, $31.29 a drop', () => {
  const c = R.costToServe('movement', 840);
  assert.equal(c.visits, 145);
  near(c.perUnit, 31.29, 0.05, 'per unit');
});

test('Handling never carries travel or on-site time', () => {
  const c = R.costToServe('handling', 2400);
  assert.equal(c.visits, 0);
  assert.ok(c.lines.every(l => !/travel|on site|time on site/i.test(l[0])));
  near(c.total, 2400 * R.RATES.handling.v, 0.01, 'total');
});

test('Shred: weighed paper costs plant per pound and no route time', () => {
  const c = R.costToServe('shred', 10000);
  assert.equal(c.visits, 0);
  assert.equal(c.lines.length, 1);
  assert.ok(c.lines.every(l => !/travel|on site/i.test(l[0])));
  near(c.total, 10000 * R.RATES.shredPlant.v, 0.01, 'total');
  near(c.total, 2665.77, 0.01, 'total at $0.2666 a lb');
  const was = R.SETTINGS.split;
  R.SETTINGS.split = 0.55;
  near(R.costToServe('shred', 10000).total, c.total, 1e-9, 'split does not touch shred');
  R.SETTINGS.split = was;
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
    assert.ok(['measured', 'observed', 'partial', 'estimate', 'assumed', 'provisional'].includes(r.c), `${k}.c`);
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
  assert.equal(R.familyOf('CERTIFIED SHREDDING FEE PER LB'), 'shred');
  assert.equal(R.familyOf('SHREDDING WEIGHT-ZERO RATE'), 'shred');
});

test('No cost number lives outside model/rates.js', () => {
  // the rates that would be tempting to hard-code elsewhere
  // the rates that would be tempting to hard-code elsewhere, and the pre-derivation ones
  const needles = ['7.53', '0.0994', '450.62', '0.2666', '32.49', '4.31', '6.13', '0.124', '680', '0.34'];
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

test('Pool-based rates are pool ÷ volume and say so', () => {
  for (const k of ['facilities', 'handling', 'shredPlant', 'routeDay']) {
    assert.equal(R.RATES[k].c, 'provisional', `${k}.c`);
    assert.match(R.RATES[k].n, /GL annualised from 17\.1 months/);
    assert.match(R.RATES[k].d, /÷/);
  }
  near(R.RATES.routeDay.v, 450.62, 0.01, 'route day');
  near(R.RATES.handling.v, 7.5309, 0.0001, 'handling');
  near(R.RATES.shredPlant.v, 0.26658, 0.00001, 'shred plant');
  near(R.RATES.facilities.v, 0.099417, 0.000001, 'facilities');
  near(R.RATES.visitsDay.v, 3.2746, 0.0001, 'customer visits per route day');
  near(R.RATES.unitsVisit.v, 5.7986, 0.0001, 'services per visit');
  assert.match(R.RATES.routeDay.d, /\$595,725 a year ÷ 1,322 route days = \$450\.62/);
});
