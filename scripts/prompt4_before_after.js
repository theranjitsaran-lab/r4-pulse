// Prompt 4 check: each rate and eight accounts' gross margin, before and after the rates are
// derived from pools and database volumes.
//
//   node scripts/prompt4_before_after.js
//
// Read-only: the session is set read-only before the first query, so it cannot change anything.
// Run it where DATABASE_URL reaches the database. It does not apply sql/model_schema.sql.
//
// Before = the original cost model (commit f5702d2: route day $680, 24 lb a bin at $0.34/lb).
// After  = model/rates.js as it stands, on its seed (what sql/model_schema.sql would load).
// Both models get the same inputs, from the database, 1 September 2025 to 31 August 2026, so
// only the rates differ. Exits 2 if any account's margin changes sign.
'use strict';
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('pg');

const FROM = '2025-09-01', TO = '2026-09-01';

const ACCOUNTS = [
  { label: 'Ingalls', like: '%ingalls%' },
  { label: 'Larabida', like: '%larabida%' },
  { label: 'ICU Medical', like: '%icu medical%' },
  { label: 'City of Chicago 2FM', like: '%2fm%' },
  { label: 'UChicago Medicine', like: '%chicago medicine%' },
  { label: 'Chapman & Cutler', like: '%chapman%' },
  { label: 'Walsh', like: '%walsh%' },
  { label: 'Citadel', level1: 6714 },
];

// Which service codes drive which cost, as in model.service_family (sql/model_schema.sql).
const CODES = {
  handling:  ['20', '22', '25', '26', '29', '32', 'P1', 'R2', 'S1', '30', '31', '33', '34'],
  trips:     ['01'],
  delivery:  ['02', '03', '90'],
  itad:      ['S4', 'S6', 'SR', 'SN', 'S9'],
  shredLb:   ['S3'],
  s5:        ['S5'],
  shredBox:  ['R3', 'R4', 'R5', 'SC'],
  centreHr:  ['53', '54'],
  driverHr:  ['55', 'S0'],
};

const money = n => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const num = n => Math.round(n).toLocaleString('en-US');

function loadOldModel() {
  const src = execSync('git show f5702d2:model/rates.js', { cwd: path.join(__dirname, '..') }).toString();
  const file = path.join(os.tmpdir(), `r4-rates-f5702d2-${process.pid}.js`);
  fs.writeFileSync(file, src);
  return require(file);
}

const SQL_PL = `
  WITH pl AS (
    SELECT level1, woid, woservid, servcodeid, units, totamt, wodate FROM priced_lines
    UNION ALL
    SELECT c.level1, c.woid, c.woservid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
    WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.woservid = c.woservid
                        AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)
  )
  SELECT pl.level1, s.servcode, sum(pl.units)::float AS units, count(DISTINCT pl.wodate::date)::int AS days
  FROM pl JOIN servcode s USING (servcodeid)
  WHERE pl.wodate >= $2 AND pl.wodate < $3 AND pl.level1 = ANY($1)
  GROUP BY 1, 2`;

const SQL_VS = `
  WITH so AS (
    SELECT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date AS date, NULLIF(route, '') AS route,
           NULLIF(cbtcode, '') AS bin
    FROM vs_service_orders WHERE billable = 'true'
  )
  SELECT level1,
         count(*) FILTER (WHERE bin ~ '^B[1-6]$')::int AS bins,
         count(DISTINCT (date, route)) FILTER (WHERE bin ~ '^B[1-6]$')::int AS visits,
         mode() WITHIN GROUP (ORDER BY bin) FILTER (WHERE bin ~ '^B[1-6]$') AS main_bin
  FROM so WHERE date >= $2 AND date < $3 AND level1 = ANY($1)
  GROUP BY 1`;

function costs(M, isNew, a) {
  const fam = {};
  const put = (f, c) => { fam[f] = (fam[f] || 0) + c; };
  const u = (codes) => codes.reduce((t, c) => t + ((a.lines[c] || {}).units || 0), 0);
  const days = (codes) => codes.reduce((t, c) => t + ((a.lines[c] || {}).days || 0), 0);

  if (a.boxes > 0) put('storage', M.costToServe('storage', a.boxes).total);
  if (u(CODES.handling) > 0) put('handling', M.costToServe('handling', u(CODES.handling)).total);
  const trips = u(CODES.trips), dboxes = u(CODES.delivery);
  if (trips > 0 || dboxes > 0) put('movement', M.costToServe('movement', dboxes, { visits: trips || null }).total);

  const s5 = u(CODES.s5);
  if (a.bins > 0) {
    const opts = { visits: a.visits || null };
    if (isNew) Object.assign(opts, s5 > 0 ? { pounds: s5 } : { binCode: a.mainBin });
    put('bin', M.costToServe('bin', a.bins, opts).total);
  } else if (isNew && s5 > 0) {
    put('shred', M.costToServe('shred', s5).total);       // S5 on purge or truck work, no bins
  }
  if (u(CODES.itad) > 0) put('itad', M.costToServe('itad', u(CODES.itad), { visits: days(CODES.itad) || null }).total);

  const s3 = u(CODES.shredLb), sbox = u(CODES.shredBox);
  if (s3 > 0) put('shred', isNew ? M.costToServe('shred', s3).total : s3 * M.RATES.shredPlant.v);
  if (isNew && sbox > 0) put('shred', M.costToServe('shred', sbox, { unit: 'box' }).total);

  if (u(CODES.centreHr) > 0) put('labour', M.costToServe('labour', u(CODES.centreHr), { isCentre: true }).total);
  if (u(CODES.driverHr) > 0) put('labour', M.costToServe('labour', u(CODES.driverHr)).total);

  return { fam, total: Object.values(fam).reduce((t, x) => t + x, 0) };
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const OLD = loadOldModel();
  const NEW = require('../model/rates');
  const db = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query('SET default_transaction_read_only = on');
  const q = async (sql, params) => (await db.query(sql, params)).rows;

  // ── Rates ──
  console.log('\nRATES                      before        after');
  const rate = (name, a, b, d) => console.log(`  ${name.padEnd(24)} ${String(a).padStart(10)}   ${String(b).padStart(10)}`);
  rate('Route day', '$' + OLD.RATES.routeDay.v, '$' + NEW.RATES.routeDay.v.toFixed(2));
  rate('Handling, per movement', '$' + OLD.RATES.handling.v, '$' + NEW.RATES.handling.v.toFixed(2));
  rate('Shred plant, per lb', '$' + OLD.RATES.shredPlant.v, '$' + NEW.RATES.shredPlant.v.toFixed(4));
  rate('Facilities, box-month', '$' + OLD.RATES.facilities.v, '$' + NEW.RATES.facilities.v.toFixed(4));
  rate('Visits per route day', OLD.RATES.visitsDay.v, NEW.RATES.visitsDay.v.toFixed(2));
  rate('Services per visit', OLD.RATES.unitsVisit.v, NEW.RATES.unitsVisit.v.toFixed(2));
  rate('Lb per bin (no S5)', OLD.RATES.lbPerBin.v, 'by size');

  // ── Accounts ──
  const chosen = [];
  for (const acc of ACCOUNTS) {
    const cands = await q(`
      SELECT c.level1, min(c.name) AS name,
             coalesce((SELECT sum(i.ret_tot + i.ser_tot) FROM invoices i WHERE i.level1 = c.level1
                        AND COALESCE(i.invdate, i.billdate) >= $2 AND COALESCE(i.invdate, i.billdate) < $3), 0)::float AS revenue
      FROM customer c
      WHERE ${acc.level1 ? 'c.level1 = $1' : 'c.name ILIKE $1'}
      GROUP BY c.level1 ORDER BY revenue DESC LIMIT 3`, [acc.level1 || acc.like, FROM, TO]);
    if (!cands.length) { console.log(`\n  ${acc.label}: no customer matches; skipped`); continue; }
    if (cands.length > 1) console.log(`\n  ${acc.label}: took level1 ${cands[0].level1} "${cands[0].name}"; also matched ${cands.slice(1).map(c => `${c.level1} "${c.name}" ${money(c.revenue)}`).join(', ')}`);
    chosen.push(Object.assign({ label: acc.label }, cands[0]));
  }
  const ids = chosen.map(c => c.level1);

  const boxes = await q(`SELECT level1, (sum(boxes) / 12.0)::float AS boxes FROM storage_rate_hist
                         WHERE to_date(mth, 'YYYY-MM') >= $2 AND to_date(mth, 'YYYY-MM') < $3 AND level1 = ANY($1)
                         GROUP BY 1`, [ids, FROM, TO]);
  const lines = await q(SQL_PL, [ids, FROM, TO]);
  const vs = await q(SQL_VS, [ids, FROM, TO]);

  for (const a of chosen) {
    a.boxes = (boxes.find(r => r.level1 === a.level1) || {}).boxes || 0;
    const v = vs.find(r => r.level1 === a.level1) || {};
    Object.assign(a, { bins: v.bins || 0, visits: v.visits || 0, mainBin: v.main_bin || null });
    a.lines = Object.fromEntries(lines.filter(r => r.level1 === a.level1).map(r => [r.servcode, r]));
  }

  console.log('\nINPUTS (12 months)   boxes   handling   trips   bins  visits  main bin      S5 lb     S3 lb  shred boxes   ITAD units');
  const U = (a, codes) => codes.reduce((t, c) => t + ((a.lines[c] || {}).units || 0), 0);
  for (const a of chosen) {
    console.log(`  ${a.label.padEnd(18)} ${num(a.boxes).padStart(7)} ${num(U(a, CODES.handling)).padStart(10)} ${num(U(a, CODES.trips)).padStart(7)} ${num(a.bins).padStart(6)} ${num(a.visits).padStart(7)}  ${String(a.mainBin || '—').padEnd(8)} ${num(U(a, CODES.s5)).padStart(10)} ${num(U(a, CODES.shredLb)).padStart(9)} ${num(U(a, CODES.shredBox)).padStart(12)} ${num(U(a, CODES.itad)).padStart(12)}`);
  }

  console.log('\nGROSS MARGIN              revenue   cost before    cost after   margin before   margin after');
  const flips = [];
  for (const a of chosen) {
    const b = costs(OLD, false, a), n = costs(NEW, true, a);
    a.after = n;
    const mb = a.revenue - b.total, ma = a.revenue - n.total;
    if (Math.sign(Math.round(mb)) !== Math.sign(Math.round(ma))) flips.push(a.label);
    console.log(`  ${a.label.padEnd(20)} ${money(a.revenue).padStart(12)} ${money(b.total).padStart(13)} ${money(n.total).padStart(13)} ${money(mb).padStart(15)} ${money(ma).padStart(14)}${flips.includes(a.label) ? '   ← SIGN CHANGED' : ''}`);
  }

  console.log('\nCOST AFTER, BY FAMILY');
  for (const a of chosen) {
    console.log(`  ${a.label.padEnd(20)} ${Object.entries(a.after.fam).map(([f, c]) => `${f} ${money(c)}`).join(' · ')}`);
  }

  await db.end();
  if (flips.length) {
    console.log(`\nSTOP: margin changed sign for ${flips.join(', ')}. Do not apply sql/model_schema.sql; report back.`);
    process.exit(2);
  }
  console.log('\nNo margin changed sign.');
})().catch(e => { console.error(e.message); process.exit(1); });
