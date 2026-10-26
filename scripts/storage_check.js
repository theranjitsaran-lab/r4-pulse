// What does the storage data say about the warehouse? Read-only: the session is set read-only
// before the first query. Answers the questions the Warehouse view needs settled first:
//   what home_loc is (a centre, a building, a zone, a shelf?), how boxes split by state there,
//   how much the retention counts overlap, and how boxes held have moved over 24 months.
//
//   node scripts/storage_check.js
//
// Paste the output to Claude.
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const n = v => v == null ? '—' : Math.round(Number(v)).toLocaleString('en-US');
const pad = (s, w) => String(s == null ? '' : s).slice(0, w).padEnd(w);

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  const q = async (sql) => (await c.query(sql)).rows;

  console.log('1. Statuses (all locations)');
  for (const r of await q(`SELECT status, sum(boxes)::float AS boxes, count(*)::int AS rows FROM storage_retention GROUP BY 1 ORDER BY 2 DESC NULLS LAST`))
    console.log(`   ${pad(r.status, 6)} ${n(r.boxes).padStart(12)} boxes  ${r.rows} rows`);

  console.log('\n2. home_loc values, in storage (status I): how many, and the largest 40');
  const [cnt] = await q(`SELECT count(DISTINCT home_loc)::int AS locs, count(*) FILTER (WHERE home_loc IS NULL OR home_loc = '')::int AS blank FROM storage_retention WHERE status = 'I'`);
  console.log(`   ${cnt.locs} distinct values · ${cnt.blank} rows with none`);
  for (const r of await q(`SELECT home_loc, sum(boxes)::float AS boxes, count(DISTINCT level1)::int AS accounts,
        sum(review_overdue)::float AS overdue, sum(permanent)::float AS perm, sum(legal_hold)::float AS hold, sum(over_ten_years)::float AS ten,
        min(oldest_received)::date AS oldest
      FROM storage_retention WHERE status = 'I' GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 40`))
    console.log(`   ${pad(JSON.stringify(r.home_loc), 18)} ${n(r.boxes).padStart(10)} boxes · ${String(r.accounts).padStart(4)} accts · overdue ${n(r.overdue)} · perm ${n(r.perm)} · hold ${n(r.hold)} · 10y+ ${n(r.ten)} · oldest ${r.oldest ? new Date(r.oldest).toISOString().slice(0, 10) : '—'}`);

  console.log('\n3. home_loc shape: lengths and leading characters (does it encode centre / aisle / bay?)');
  for (const r of await q(`SELECT length(home_loc) AS len, left(home_loc, 1) AS first, count(*)::int AS rows, sum(boxes)::float AS boxes,
        min(home_loc) AS example_lo, max(home_loc) AS example_hi
      FROM storage_retention WHERE status = 'I' GROUP BY 1, 2 ORDER BY 4 DESC NULLS LAST LIMIT 20`))
    console.log(`   length ${String(r.len).padStart(3)} · starts ${pad(JSON.stringify(r.first), 5)} ${n(r.boxes).padStart(10)} boxes · ${r.rows} rows · e.g. ${r.example_lo} … ${r.example_hi}`);

  console.log('\n4. Box types, in storage');
  for (const r of await q(`SELECT boxtype, sum(boxes)::float AS boxes FROM storage_retention WHERE status = 'I' GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 15`))
    console.log(`   ${pad(JSON.stringify(r.boxtype), 12)} ${n(r.boxes).padStart(12)}`);

  console.log('\n5. Overlap of the retention counts, in storage (rows are account × box type × location)');
  const [o] = await q(`SELECT sum(boxes)::float AS boxes, sum(review_overdue)::float AS overdue,
        sum(LEAST(review_overdue, legal_hold + permanent))::float AS overdue_with_hold_or_perm_same_row,
        sum(GREATEST(review_overdue - legal_hold - permanent, 0))::float AS eligible_at_least,
        sum(CASE WHEN legal_hold > 0 THEN review_overdue ELSE 0 END)::float AS overdue_in_rows_with_any_hold,
        sum(CASE WHEN review_overdue > boxes THEN 1 ELSE 0 END)::int AS rows_overdue_over_boxes,
        sum(LEAST(review_overdue, over_ten_years))::float AS overdue_and_ten_at_most
      FROM storage_retention WHERE status = 'I'`);
  for (const [k, v] of Object.entries(o)) console.log(`   ${pad(k, 36)} ${n(v).padStart(12)}`);

  console.log('\n6. storage_summary against storage_retention, in storage');
  const [s] = await q(`SELECT (SELECT sum(boxes) FROM storage_summary WHERE status = 'I')::float AS summary, (SELECT sum(boxes) FROM storage_retention WHERE status = 'I')::float AS retention`);
  console.log(`   storage_summary ${n(s.summary)} · storage_retention ${n(s.retention)}`);

  console.log('\n7. Boxes billed by month, 24 months (storage_rate_hist)');
  const m = await q(`SELECT mth, sum(boxes)::float AS boxes, count(DISTINCT level1)::int AS accounts FROM storage_rate_hist GROUP BY 1 ORDER BY 1 DESC LIMIT 24`);
  console.log('   ' + m.reverse().map(r => `${r.mth} ${n(r.boxes)} (${r.accounts})`).join('\n   '));

  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
