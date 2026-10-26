// How fresh is the database? The latest date in each source table and how many rows arrived in the
// last seven days. Read-only: the session is set read-only before the first query.
//
//   node scripts/freshness.js
//
// Paste the output to Claude. A table whose latest date stopped weeks ago means its part of the
// daily push has stalled.
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const CHECKS = [
  ['invoices (posted)', `SELECT max(COALESCE(invdate, billdate))::date AS latest,
     count(*) FILTER (WHERE COALESCE(invdate, billdate) > now() - interval '7 days')::int AS last7 FROM invoices`],
  ['invoices_current (run, latest work)', `SELECT max(p.wodate)::date AS latest, count(DISTINCT c.invoice_no)::int AS last7 FROM invoices_current c LEFT JOIN priced_lines_current p USING (invoice_no)`],
  ['priced_lines (work date)', `SELECT max(wodate)::date AS latest, count(*) FILTER (WHERE wodate > now() - interval '7 days')::int AS last7 FROM priced_lines`],
  ['priced_lines_current (work date)', `SELECT max(wodate)::date AS latest, count(*) FILTER (WHERE wodate > now() - interval '7 days')::int AS last7 FROM priced_lines_current`],
  ['vs_service_orders (any)', `SELECT max(NULLIF(date, '')::date) AS latest, count(*) FILTER (WHERE NULLIF(date, '')::date > now() - interval '7 days')::int AS last7 FROM vs_service_orders`],
  ['vs_service_orders (done)', `SELECT max(NULLIF(date, '')::date) AS latest, count(*) FILTER (WHERE NULLIF(date, '')::date > now() - interval '7 days')::int AS last7 FROM vs_service_orders WHERE billable = 'true'`],
  ['vs_service_orders (done, up to today)', `SELECT max(NULLIF(date, '')::date) AS latest, 0 AS last7 FROM vs_service_orders WHERE billable = 'true' AND NULLIF(date, '')::date <= current_date`],
  ['storage_rate_hist (month)', `SELECT max(to_date(mth, 'YYYY-MM')) AS latest, 0 AS last7 FROM storage_rate_hist`],
  ['kpi.monthly (rebuilt)', `SELECT max(month) AS latest, 0 AS last7 FROM kpi.monthly`],
];

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const [{ today }] = (await c.query('SELECT current_date::text AS today')).rows;
  console.log(`Database date: ${today}\n`);
  for (const [label, sql] of CHECKS) {
    try {
      const [r] = (await c.query(sql)).rows;
      const latest = r.latest ? new Date(r.latest).toISOString().slice(0, 10) : '—';
      const age = r.latest ? Math.round((Date.parse(today) - new Date(r.latest)) / 864e5) : null;
      const tail = label.startsWith('invoices_current') ? `${r.last7} invoices in the run` : `${r.last7} rows in the last 7 days`;
      console.log(`${label.padEnd(40)} latest ${latest}${age != null ? `  (${age} days ${age < 0 ? 'ahead: booked' : 'ago'})` : ''}  ·  ${tail}`);
    } catch (e) { console.log(`${label.padEnd(40)} ERROR ${e.message}`); }
  }
  // the push itself: when were the source tables last written, if the server tracks it
  try {
    const rows = (await c.query(`SELECT relname, last_autoanalyze::date::text AS analysed, n_tup_ins::bigint AS inserted
      FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname IN ('invoices', 'invoices_current', 'priced_lines', 'priced_lines_current', 'vs_service_orders', 'storage_rate_hist') ORDER BY relname`)).rows;
    console.log('\nTable statistics (last analysed, rows inserted since the stats reset):');
    for (const r of rows) console.log(`  ${r.relname.padEnd(24)} analysed ${r.analysed || '—'}  ·  ${Number(r.inserted).toLocaleString('en-US')} inserted`);
  } catch (e) { console.log(`\nTable statistics unavailable: ${e.message}`); }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
