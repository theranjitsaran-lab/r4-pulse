// Measurements that settle the open cost-model and lever questions before the schema is applied.
//
//   node scripts/measure.js > measure_output.txt
//
// Read-only: the session is set read-only before the first query. Last twelve months,
// September 2025 to August 2026, unless a section says otherwise. A failed section prints its
// error and the rest still run.
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const LTM = ['2025-09-01', '2026-09-01'];
const BINS = `('B1','B2','B3','B4','B5','B6')`;

const money = n => n == null ? '—' : (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US');
const num = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');

function table(rows, cols) {
  if (!rows.length) { console.log('  (no rows)'); return; }
  const w = cols.map(([h, f]) => Math.max(h.length, ...rows.map(r => String(f(r)).length)));
  console.log('  ' + cols.map(([h], i) => h.padEnd(w[i])).join('  '));
  for (const r of rows) console.log('  ' + cols.map(([, f], i) => { const s = String(f(r)); return /^[−$\d.,%-]+$/.test(s) ? s.padStart(w[i]) : s.padEnd(w[i]); }).join('  '));
}

// Priced lines from both tables, a line present in both counted once, last twelve months.
const L = `
  pl AS (
    SELECT level1, woid, woservid, servcodeid, units, totamt, wodate FROM priced_lines
    UNION ALL
    SELECT c.level1, c.woid, c.woservid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
    WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.woservid = c.woservid
                        AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)
  ),
  l AS (SELECT pl.*, pl.wodate::date AS d, s.servcode FROM pl JOIN servcode s USING (servcodeid)
        WHERE pl.wodate >= '${LTM[0]}' AND pl.wodate < '${LTM[1]}'),
  so AS (SELECT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date AS d, NULLIF(route, '') AS route,
                NULLIF(cbtcode, '') AS bin, billable = 'true' AS done
         FROM vs_service_orders
         WHERE NULLIF(date, '')::date >= '${LTM[0]}' AND NULLIF(date, '')::date < '${LTM[1]}')`;

const sections = [];
const section = (title, fn) => sections.push([title, fn]);

section('A. SHRED TRUCK — S5 pounds on shred-truck work (to take out of the plant total)', async (q) => {
  const [r] = await q(`
    WITH ${L},
    truck_wo AS (SELECT DISTINCT woid FROM l WHERE servcode = 'S0'),
    truck_day AS (SELECT DISTINCT level1, d FROM l WHERE servcode = 'S0'),
    mobile_day AS (SELECT DISTINCT level1, d FROM so WHERE upper(route) LIKE 'MOBILE%')
    SELECT (SELECT sum(units) FROM l WHERE servcode = 'S5')::float AS s5_all,
           (SELECT count(*) FROM truck_wo)::int AS truck_work_orders,
           (SELECT sum(units) FROM l WHERE servcode = 'S0')::float AS truck_hours,
           (SELECT sum(totamt) FROM l WHERE servcode = 'S0')::float AS truck_revenue,
           (SELECT sum(units) FROM l WHERE servcode = 'S5' AND woid IN (SELECT woid FROM truck_wo))::float AS s5_same_wo,
           (SELECT sum(units) FROM l JOIN truck_day USING (level1, d) WHERE servcode = 'S5')::float AS s5_same_account_day,
           (SELECT sum(units) FROM l JOIN mobile_day USING (level1, d) WHERE servcode = 'S5')::float AS s5_mobile_route_day,
           (SELECT sum(units) FROM l WHERE servcode = 'S5' AND (level1, d) IN (SELECT level1, d FROM truck_day UNION SELECT level1, d FROM mobile_day))::float AS s5_either`);
  console.log(`  S5 pounds, all: ${num(r.s5_all)}`);
  console.log(`  Shred-truck work: ${num(r.truck_work_orders)} work orders with an S0 line, ${num(r.truck_hours)} hours, ${money(r.truck_revenue)}`);
  console.log(`  S5 pounds on the same work order as an S0 line:       ${num(r.s5_same_wo)}   ← proposed truck pounds`);
  console.log('  Upper bounds (these also catch ordinary bin pounds from the same day):');
  console.log(`  S5 pounds on the same account and day as an S0 line:  ${num(r.s5_same_account_day)}`);
  console.log(`  S5 pounds on an account-day the MOBILE route served:  ${num(r.s5_mobile_route_day)}`);
  console.log(`  S5 pounds on either kind of truck day:                ${num(r.s5_either)}`);
});

section('B. BIN COUNTS — VCK billed bin units against the Veri-Shred completion flag', async (q) => {
  const book = await q(`
    WITH ${L}
    SELECT (SELECT sum(units) FROM l WHERE servcode IN ${BINS})::float AS vck_units,
           (SELECT count(*) FROM (SELECT DISTINCT level1, d FROM l WHERE servcode IN ${BINS}) x)::int AS vck_visits,
           (SELECT count(*) FROM so WHERE bin ~ '^B[1-6]$' AND done)::int AS vs_done,
           (SELECT count(*) FROM so WHERE bin ~ '^B[1-6]$')::int AS vs_booked,
           (SELECT count(*) FROM (SELECT DISTINCT level1, d, route FROM so WHERE bin ~ '^B[1-6]$' AND done) x)::int AS vs_visits_done,
           (SELECT count(*) FROM (SELECT DISTINCT level1, d, route FROM so WHERE bin ~ '^B[1-6]$') x)::int AS vs_visits_booked,
           (SELECT count(*) FROM (SELECT DISTINCT level1, d FROM so WHERE bin ~ '^B[1-6]$' AND d < current_date) x)::int AS vs_account_days_past`);
  const b = book[0];
  console.log('  Book, bin services B1–B6:');
  console.log(`    VCK billed units ${num(b.vck_units)} on ${num(b.vck_visits)} account-days billed`);
  console.log(`    Veri-Shred done ${num(b.vs_done)} on ${num(b.vs_visits_done)} customer visits · booked ${num(b.vs_booked)} on ${num(b.vs_visits_booked)}`);
  const acc = await q(`
    WITH ${L},
    v AS (SELECT level1, sum(units)::float AS vck_units, count(DISTINCT d)::int AS vck_days FROM l WHERE servcode IN ${BINS} GROUP BY 1),
    s AS (SELECT level1, count(*) FILTER (WHERE done)::int AS vs_done, count(*)::int AS vs_booked,
                 count(DISTINCT (d, route)) FILTER (WHERE done)::int AS vs_visits FROM so WHERE bin ~ '^B[1-6]$' GROUP BY 1),
    n AS (SELECT level1, (array_agg(name ORDER BY level NULLS LAST, custno))[1] AS name FROM customer GROUP BY 1)
    SELECT coalesce(v.level1, s.level1) AS level1, n.name, v.vck_units, v.vck_days, s.vs_done, s.vs_booked, s.vs_visits
    FROM v FULL JOIN s USING (level1) LEFT JOIN n ON n.level1 = coalesce(v.level1, s.level1)
    ORDER BY greatest(coalesce(v.vck_units, 0), coalesce(s.vs_booked, 0)) DESC LIMIT 20`);
  console.log('\n  20 largest bin accounts:');
  table(acc, [['level1', r => r.level1], ['customer', r => (r.name || '').slice(0, 34)], ['VCK billed', r => num(r.vck_units)], ['VCK days', r => num(r.vck_days)],
    ['VS done', r => num(r.vs_done)], ['VS booked', r => num(r.vs_booked)], ['VS visits done', r => num(r.vs_visits)]]);
  const [f] = await q(`
    WITH ${L}
    SELECT count(DISTINCT level1) FILTER (WHERE servcode IN ('IR','B7'))::int AS flat_accounts,
           count(DISTINCT level1) FILTER (WHERE servcode IN ${BINS})::int AS per_bin_accounts,
           count(DISTINCT level1) FILTER (WHERE servcode = 'S3')::int AS by_weight_accounts
    FROM l`);
  console.log(`\n  Accounts billed per bin ${num(f.per_bin_accounts)} · flat monthly fee (IR/B7) ${num(f.flat_accounts)} · by weight (S3) ${num(f.by_weight_accounts)}`);
});

section('C. THE DECLINE — the four accounts behind most of it, month by month', async (q) => {
  const ids = [4274, 3507, 13871, 8153];
  const m = await q(`
    SELECT level1, to_char(month, 'Mon YY') AS m, month, storage::float, service::float
    FROM kpi.customer_monthly WHERE level1 = ANY($1) ORDER BY level1, month`, [ids]);
  const names = await q(`SELECT level1, (array_agg(name ORDER BY level NULLS LAST, custno))[1] AS name FROM customer WHERE level1 = ANY($1) GROUP BY 1`, [ids]);
  for (const id of ids) {
    const nm = (names.find(x => x.level1 === id) || {}).name;
    const rows = m.filter(x => x.level1 === id);
    console.log(`\n  ${id} ${nm || ''}`);
    console.log('    storage: ' + rows.map(x => `${x.m} ${num(x.storage / 1000)}k`).join(' · '));
    console.log('    service: ' + rows.map(x => `${x.m} ${num(x.service / 1000)}k`).join(' · '));
  }
  const codes = await q(`
    WITH pl AS (SELECT level1, servcodeid, totamt, wodate FROM priced_lines WHERE level1 = ANY($1))
    SELECT pl.level1, s.servcode, min(s.description) AS service,
           sum(totamt) FILTER (WHERE wodate >= '2025-01-01' AND wodate < '2025-07-01')::float / 6 AS h1_2025,
           sum(totamt) FILTER (WHERE wodate >= '2026-03-01' AND wodate < '2026-09-01')::float / 6 AS recent
    FROM pl JOIN servcode s USING (servcodeid) GROUP BY 1, 2
    HAVING abs(coalesce(sum(totamt) FILTER (WHERE wodate >= '2025-01-01' AND wodate < '2025-07-01'), 0) / 6
             - coalesce(sum(totamt) FILTER (WHERE wodate >= '2026-03-01' AND wodate < '2026-09-01'), 0) / 6) > 500
    ORDER BY 1, (coalesce(sum(totamt) FILTER (WHERE wodate >= '2026-03-01' AND wodate < '2026-09-01'), 0)
               - coalesce(sum(totamt) FILTER (WHERE wodate >= '2025-01-01' AND wodate < '2025-07-01'), 0))`, [ids]);
  console.log('\n  Service codes that moved by more than $500 a month (work-order month, priced lines):');
  table(codes, [['level1', r => r.level1], ['code', r => r.servcode], ['service', r => (r.service || '').slice(0, 34)],
    ['Jan–Jun 25 /mo', r => money(r.h1_2025 || 0)], ['Mar–Aug 26 /mo', r => money(r.recent || 0)]]);
});

section('D. RETENTION — storage_retention by status', async (q) => {
  const r = await q(`SELECT status, count(*)::int AS rows, sum(boxes)::float AS boxes, sum(review_overdue)::float AS overdue,
                            sum(permanent)::float AS permanent, sum(legal_hold)::float AS hold, sum(over_ten_years)::float AS ten
                     FROM storage_retention GROUP BY 1 ORDER BY boxes DESC NULLS LAST`);
  table(r, [['status', x => x.status || '(blank)'], ['rows', x => num(x.rows)], ['boxes', x => num(x.boxes)], ['review overdue', x => num(x.overdue)],
    ['permanent', x => num(x.permanent)], ['legal hold', x => num(x.hold)], ['over 10 yrs', x => num(x.ten)]]);
  const s = await q(`SELECT status, sum(boxes)::float AS boxes FROM storage_summary GROUP BY 1 ORDER BY 2 DESC NULLS LAST`);
  console.log('  storage_summary by status: ' + s.map(x => `${x.status || '(blank)'} ${num(x.boxes)}`).join(' · '));
});

section('E. PLACEMENTS — what the active flag means', async (q) => {
  const r = await q(`
    WITH ever AS (SELECT DISTINCT iplpk FROM vs_service_orders WHERE billable = 'true'),
         ltm AS (SELECT DISTINCT iplpk FROM vs_service_orders WHERE billable = 'true'
                 AND NULLIF(date, '')::date >= '${LTM[0]}' AND NULLIF(date, '')::date < '${LTM[1]}'),
         booked AS (SELECT DISTINCT iplpk FROM vs_service_orders
                    WHERE NULLIF(date, '')::date >= '${LTM[0]}' AND NULLIF(date, '')::date < '${LTM[1]}')
    SELECT coalesce(p.lplactive, '(blank)') AS active, coalesce(p.lplunconf, '(blank)') AS unconfirmed,
           left(coalesce(p.tplcreate, ''), 4) AS created, count(*)::int AS placements,
           count(*) FILTER (WHERE p.iplpk IN (SELECT iplpk FROM ltm))::int AS done_ltm,
           count(*) FILTER (WHERE p.iplpk IN (SELECT iplpk FROM booked))::int AS booked_ltm,
           count(*) FILTER (WHERE p.iplpk IN (SELECT iplpk FROM ever))::int AS done_ever
    FROM vs_placement p GROUP BY 1, 2, 3 ORDER BY 3, 1, 2`);
  table(r, [['active', x => x.active], ['unconfirmed', x => x.unconfirmed], ['created', x => x.created || '—'], ['placements', x => num(x.placements)],
    ['done last 12 mo', x => num(x.done_ltm)], ['booked last 12 mo', x => num(x.booked_ltm)], ['done ever', x => num(x.done_ever)]]);
});

section('F. NAMES — which customer row names an account', async (q) => {
  const r = await q(`SELECT level1, level, custno, name FROM customer WHERE level1 IN (6382, 2972, 5687, 9703, 8153) ORDER BY level1, level NULLS LAST, custno LIMIT 40`);
  table(r, [['level1', x => x.level1], ['level', x => x.level == null ? '—' : x.level], ['custno', x => x.custno || '—'], ['name', x => (x.name || '').slice(0, 44)]]);
});

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const db = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: process.env.PGSSL === '0' ? false : { rejectUnauthorized: false } });
  await db.connect();
  await db.query('SET default_transaction_read_only = on');
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  console.log(`R4 Pulse measurements · read-only · run ${new Date().toISOString().slice(0, 16)}`);
  for (const [title, fn] of sections) {
    console.log(`\n${title}`);
    try { await fn(q); } catch (e) { console.log(`  FAILED: ${e.message}`); }
  }
  await db.end();
})().catch(e => { console.error(e.message); process.exit(1); });
