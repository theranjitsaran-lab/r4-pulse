// Read-only: where could each box delivery's address come from? Run on the PC or laptop that can reach
// DigitalOcean, in the repo folder:
//   node scripts/address_check.js
// It opens a read-only session (it cannot change anything), prints counts, column names and business
// account names only, and writes nothing. Paste the output back to Claude.
//
// Deliveries are VCK lines with service code 01 (priced_lines, by wodate). VCK's customer table holds no
// address, so today a delivery's postcode comes from its account's Veri-Shred stops (vs_service_orders,
// by level1). This checks whether a closer match exists (the sub-account, levelid), what other tables
// carry address-like columns, and which delivery accounts still have no postcode anywhere.
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const Q = {
  // 1. every column in the database whose name looks like an address
  columns: `
    SELECT c.table_schema, c.table_name, string_agg(c.column_name, ', ' ORDER BY c.ordinal_position) AS columns,
           max(cl.reltuples)::bigint AS rows_about
    FROM information_schema.columns c
    LEFT JOIN pg_class cl ON cl.relname = c.table_name
    LEFT JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = c.table_schema
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.column_name ~* '(zip|postal|postcode|addr|street|city|state|county|lat$|lon$|long$|dlat|dlong|loc)'
    GROUP BY 1, 2 ORDER BY 1, 2`,
  // 2. every table the push brings, with its size, to compare with VCK's and Veri-Shred's own lists
  tables: `
    SELECT n.nspname AS schema, c.relname AS table, c.reltuples::bigint AS rows_about
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY 1, 2`,
  // 3. the twelve months' delivery lines, and how many find a postcode by each route
  coverage: `
    WITH b AS (SELECT (max(month) - interval '11 months')::date AS f, (max(month) + interval '1 month')::date AS t FROM kpi.monthly),
    pl AS (
      SELECT level1, levelid, woid, servcodeid, units, totamt, wodate FROM priced_lines
      UNION ALL
      SELECT c.level1, c.levelid, c.woid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
      WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)),
    del AS (SELECT pl.level1, pl.levelid, pl.wodate::date AS d, pl.totamt, pl.units FROM pl JOIN servcode s USING (servcodeid), b
            WHERE s.servcode = '01' AND pl.wodate >= b.f AND pl.wodate < b.t),
    vs AS (SELECT NULLIF(level1, '')::int AS level1, NULLIF(levelid, '')::int AS levelid,
                  left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS pc
           FROM vs_service_orders WHERE coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) ~ '^[0-9]{5}'),
    bysub AS (SELECT DISTINCT levelid FROM vs WHERE levelid IS NOT NULL),
    byacc AS (SELECT DISTINCT level1 FROM vs WHERE level1 IS NOT NULL),
    days AS (SELECT level1, levelid, d, sum(totamt) AS amt, sum(units) AS trips FROM del GROUP BY 1, 2, 3)
    SELECT
      count(*) AS customer_days, count(DISTINCT level1) AS accounts, round(sum(amt)) AS delivery_revenue,
      count(*) FILTER (WHERE levelid IN (SELECT levelid FROM bysub)) AS days_sub_account_postcode,
      count(*) FILTER (WHERE level1 IN (SELECT level1 FROM byacc)) AS days_account_postcode,
      count(*) FILTER (WHERE levelid NOT IN (SELECT levelid FROM bysub) AND level1 NOT IN (SELECT level1 FROM byacc)) AS days_no_postcode,
      round(sum(amt) FILTER (WHERE levelid NOT IN (SELECT levelid FROM bysub) AND level1 NOT IN (SELECT level1 FROM byacc))) AS revenue_no_postcode
    FROM days`,
  // 4. the delivery accounts with no Veri-Shred postcode at all, largest first (business names only)
  missing: `
    WITH b AS (SELECT (max(month) - interval '11 months')::date AS f, (max(month) + interval '1 month')::date AS t FROM kpi.monthly),
    del AS (SELECT p.level1, p.wodate::date AS d, p.totamt FROM priced_lines p JOIN servcode s USING (servcodeid), b
            WHERE s.servcode = '01' AND p.wodate >= b.f AND p.wodate < b.t),
    byacc AS (SELECT DISTINCT NULLIF(level1, '')::int AS level1 FROM vs_service_orders WHERE coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) ~ '^[0-9]{5}')
    SELECT d.level1, (SELECT c.name FROM customer c WHERE c.level1 = d.level1 ORDER BY (c.level = 1) DESC NULLS LAST LIMIT 1) AS account,
           count(DISTINCT d.d) AS delivery_days, round(sum(d.totamt)) AS delivery_revenue
    FROM del d WHERE d.level1 NOT IN (SELECT level1 FROM byacc WHERE level1 IS NOT NULL)
    GROUP BY 1 ORDER BY 4 DESC NULLS LAST LIMIT 25`,
  // 5. does Veri-Shred book anything other than shredding? (order types and bin codes, twelve months)
  vsTypes: `
    SELECT NULLIF(type, '') AS type, NULLIF(cbtcode, '') AS bin_code, count(*) AS orders, count(*) FILTER (WHERE billable = 'true') AS done
    FROM vs_service_orders WHERE NULLIF(date, '')::date > current_date - 365
    GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30`,
  // 6. VCK's delivery codes on work orders
  delivcodes: `SELECT NULLIF(delivcode, '') AS delivcode, count(*) AS work_orders FROM work_orders GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
};

(async () => {
  if (!process.env.DATABASE_URL) { console.error('No DATABASE_URL in .env: run this where the app\'s .env is.'); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('SET default_transaction_read_only = on');   // this session can only read
  for (const [name, sql] of Object.entries(Q)) {
    console.log(`\n== ${name} ==`);
    try { const r = await c.query(sql); console.table(r.rows); }
    catch (e) { console.log(`(${name} could not run: ${e.message})`); }
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
