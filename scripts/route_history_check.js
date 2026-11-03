// How far back route days, stop order, drivers and postcodes really go, month by month. Read-only; run on the PC:
//   node scripts/route_history_check.js
require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  const { rows } = await c.query(`
    SELECT to_char(NULLIF(date, '')::date, 'YYYY-MM') AS month,
           count(DISTINCT (date, route))::int AS route_days,
           count(*)::int AS services,
           count(DISTINCT NULLIF(route, ''))::int AS routes,
           count(DISTINCT NULLIF(driver, ''))::int AS drivers,
           round(100.0 * count(NULLIF(driver, '')) / count(*))::int AS driver_pct,
           round(100.0 * count(*) FILTER (WHERE rorder ~ '^[0-9]+(\\.[0-9]+)?$') / count(*))::int AS order_pct,
           round(100.0 * count(*) FILTER (WHERE coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) IS NOT NULL) / count(*))::int AS postcode_pct
    FROM vs_service_orders
    WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL AND route <> '--'
    GROUP BY 1 ORDER BY 1`);
  console.table(rows);
  // rorder is one number for a whole route day (checked 3 November 2026), so is sorder or porder the order the stops were driven in?
  const order = await c.query(`
    WITH d AS (SELECT date, route, slocid, min(rorder) AS r, min(sorder) AS s, min(porder) AS p FROM vs_service_orders
               WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL AND route <> '--' AND NULLIF(date, '')::date > current_date - 400 GROUP BY 1, 2, 3)
    SELECT count(*)::int AS stops, count(NULLIF(r, ''))::int AS rorder_filled, count(NULLIF(s, ''))::int AS sorder_filled, count(NULLIF(p, ''))::int AS porder_filled,
           round(avg(nr), 2)::float AS rorder_values_a_day, round(avg(ns), 2)::float AS sorder_values_a_day, round(avg(np), 2)::float AS porder_values_a_day, round(avg(n), 2)::float AS stops_a_day
    FROM d JOIN (SELECT date, route, count(*) AS n, count(DISTINCT r) AS nr, count(DISTINCT s) AS ns, count(DISTINCT p) AS np FROM d GROUP BY 1, 2) x USING (date, route)`);
  console.table(order.rows);
  console.table((await c.query(`SELECT date, route, slocid, rorder, sorder, porder, left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode FROM vs_service_orders
    WHERE billable = 'true' AND route = 'MARK' AND NULLIF(date, '')::date = (SELECT max(NULLIF(date, '')::date) FROM vs_service_orders WHERE billable = 'true' AND route = 'MARK') ORDER BY isopk LIMIT 20`)).rows);
  await c.end();
})().catch(e => { console.error(e.code || e.message); process.exit(1); });
