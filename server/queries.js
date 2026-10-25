// One named query per screen. Each returns the JSON that screen renders: revenue, volumes and
// rates as invoiced, never a cost. Costs are built from these volumes by model/rates.js, in the
// page, so Pricing and Margin cannot disagree and no cost number lives here.
//
// "Last twelve months" is the twelve posted months to the latest month in kpi.monthly, so the
// screens roll forward as runs post. Activity reads Veri-Shred up to the latest push.
// Every numeric column is cast in SQL: pg returns numeric as text, and custno-like text must
// never be coerced. Every ORDER BY ends on a unique key, so a refresh with unchanged data writes
// identical fixtures and a diff shows only real changes.
'use strict';
const { query } = require('./db');

// The twelve posted months to the latest one in kpi.monthly.
const BOUNDS = `b AS (SELECT (max(month) - interval '11 months')::date AS f,
                             (max(month) + interval '1 month')::date AS t,
                             max(month) AS latest FROM kpi.monthly)`;

// An account's name is its level-1 customer row. col must be table-qualified (r.level1): a bare
// level1 resolves to the customer table's own column and names every account the same.
const NAME = (col) => {
  if (!/\./.test(col)) throw new Error(`NAME(${col}): qualify the column with its table alias`);
  return `(SELECT c.name FROM customer c WHERE c.level1 = ${col} ORDER BY (c.level = 1) DESC NULLS LAST, c.level, c.custno LIMIT 1)`;
};

// Priced lines from both tables, a line present in both counted once, within the window.
const PL = `
  pl AS (
    SELECT level1, woid, woservid, servcodeid, units, totamt, wodate FROM priced_lines
    UNION ALL
    SELECT c.level1, c.woid, c.woservid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
    WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.woservid = c.woservid
                        AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)
  ),
  l AS (SELECT pl.*, pl.wodate::date AS d, s.servcode FROM pl JOIN servcode s USING (servcodeid), b
        WHERE pl.wodate >= b.f AND pl.wodate < b.t)`;

const BIN_CODES = `('B1','B2','B3','B4','B5','B6','B7','IR','IP')`;

// ── Pulse — Trisha ───────────────────────────────────────────────────────────────────────
// The 23 posted months with the Iron Mountain set, the run not yet posted, the two halves'
// customer counts, the accounts down two months running, and concentration.
async function pulse() {
  const monthly = await query(`
    SELECT month::text, storage::float, service::float, citadel::float, core::float, core_service::float,
           storage_share_pct::float, storage_growth_yoy_pct::float, core_service_growth_yoy_pct::float,
           storage_boxes::float, retention_rate::float, storage_gross_margin_pct::float, service_gross_margin_pct::float,
           revenue_per_sqft::float, utilisation_pct::float, perm_withdrawal_fees::float, route_days::float,
           stops_per_route_day::float, revenue_per_stop::float, revenue_per_route_hour::float, route_day_margin::float,
           pounds_per_route_day::float, pounds_exec_default_pct::float
    FROM kpi.monthly ORDER BY month`);
  const currentRun = await query(`
    SELECT part, storage::float, service::float, citadel::float, invoices::int,
           earliest_work_date::text, latest_work_date::text, earliest_invdate::text, latest_invdate::text
    FROM v_current_run ORDER BY part`);
  const [customers] = await query(`
    WITH ${BOUNDS}
    SELECT (SELECT count(DISTINCT level1) FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t AND storage > 0)::int AS storage_ltm,
           (SELECT count(DISTINCT level1) FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t AND service > 0)::int AS service_ltm,
           (SELECT count(DISTINCT level1) FROM kpi.customer_monthly, b WHERE month >= b.f - interval '12 months' AND month < b.f AND storage > 0)::int AS storage_prior,
           (SELECT count(DISTINCT level1) FROM kpi.customer_monthly, b WHERE month >= b.f - interval '12 months' AND month < b.f AND service > 0)::int AS service_prior,
           (SELECT f::text FROM b) AS ltm_from, (SELECT latest::text FROM b) AS ltm_to`);
  const downTwoMonths = await query(`
    WITH ${BOUNDS}
    SELECT cm.level1, ${NAME('cm.level1')} AS customer, cm.month::text, cm.storage::float, cm.service::float,
           cm.revenue::float, cm.trailing6_mean::float, cm.deviation_pct::float
    FROM kpi.customer_monthly cm, b
    WHERE cm.month = b.latest AND cm.flag_down_2m
    ORDER BY cm.revenue - cm.trailing6_mean, cm.level1 LIMIT 25`);
  const concentration = await query(`
    WITH ${BOUNDS},
    r AS (SELECT level1, sum(revenue) AS ltm FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t GROUP BY level1)
    SELECT r.level1, ${NAME('r.level1')} AS customer, r.ltm::float, (r.ltm / sum(r.ltm) OVER ())::float AS share
    FROM r WHERE r.ltm > 0 ORDER BY r.ltm DESC, r.level1 LIMIT 50`);
  // Pace: the value of work done each day, by work date, over the last three calendar months to
  // the latest priced work, Citadel apart. The page compares month-to-date with the same days of
  // the month before, like for like.
  const pace = await query(`
    WITH b AS (SELECT (date_trunc('month', m) - interval '2 months')::date AS f, (m::date + 1) AS t
               FROM (SELECT greatest((SELECT max(wodate) FROM priced_lines), (SELECT max(wodate) FROM priced_lines_current)) AS m) x),
    ${PL}
    SELECT d::text AS date, sum(totamt)::float AS value, count(*)::int AS lines
    FROM l WHERE level1 <> 6714 GROUP BY 1 ORDER BY 1`);
  return { monthly, currentRun, customers, downTwoMonths, concentration, pace };
}

// ── Customers — the list and the customer page ───────────────────────────────────────────
// Storage and service by month, 24 months to the latest posted month, for the 300 largest
// accounts over the last twelve months and every account flagged down two months running.
// Months with no invoice are $0, so every series has the same 24 points.
async function customers() {
  const rows = await query(`
    WITH ${BOUNDS},
    ltm AS (SELECT level1, sum(revenue) AS ltm FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t GROUP BY level1),
    pick AS (SELECT level1 FROM (SELECT level1 FROM ltm WHERE ltm > 0 ORDER BY ltm DESC, level1 LIMIT 300) top
             UNION SELECT cm.level1 FROM kpi.customer_monthly cm, b WHERE cm.month = b.latest AND cm.flag_down_2m)
    SELECT cm.level1, cm.month::text, cm.storage::float, cm.service::float
    FROM kpi.customer_monthly cm JOIN pick USING (level1), b
    WHERE cm.month > b.latest - interval '24 months' AND cm.month <= b.latest
    ORDER BY cm.level1, cm.month`);
  const [{ latest }] = await query(`SELECT max(month)::text AS latest FROM kpi.monthly`);
  const months = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(latest + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 10));
  }
  const ids = [...new Set(rows.map(r => r.level1))];
  const names = ids.length ? await query(`
    SELECT x.level1, ${NAME('x.level1')} AS customer FROM unnest($1::int[]) AS x(level1) ORDER BY x.level1`, [ids]) : [];
  const nameOf = new Map(names.map(n => [n.level1, n.customer]));
  const byId = new Map(ids.map(id => [id, { level1: id, customer: nameOf.get(id), storage: months.map(() => 0), service: months.map(() => 0) }]));
  for (const r of rows) {
    const a = byId.get(r.level1), i = months.indexOf(r.month);
    if (i >= 0) { a.storage[i] = r.storage; a.service[i] = r.service; }
  }
  return { months, accounts: [...byId.values()] };
}

// ── Activity — Mike ──────────────────────────────────────────────────────────────────────
// Route-days for the five weeks to the latest done work and two weeks booked ahead; the orders
// behind the last three weeks and the week ahead, in route order, with the invoiced value of each
// account's work that day; weekday averages over the last twelve months.
async function activity() {
  const [anchor] = await query(`SELECT max(date)::text AS latest_done FROM v_route_day WHERE services_done > 0`);
  const routeDays = await query(`
    SELECT date::text, route, routeid, driver, services::int, services_done::int, customers::int, stops::int,
           stops_done::int, postcodes::int, postcode_list, pounds::float, pounds_exec_default::float
    FROM v_route_day
    WHERE date >= least($1::date - 34, (date_trunc('month', $1::date) - interval '1 month')::date) AND date <= $1::date + 14
    ORDER BY date, route NULLS LAST`, [anchor.latest_done]);
  const orders = await query(`
    SELECT NULLIF(date, '')::date::text AS date, NULLIF(route, '') AS route, NULLIF(driver, '') AS driver,
           CASE WHEN rorder ~ '^[0-9]+(\\.[0-9]+)?$' THEN rorder::numeric::float END AS seq,
           NULLIF(level1, '')::int AS level1, NULLIF(company, '') AS company, NULLIF(slocid, '') AS stop,
           left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode,
           NULLIF(cbtcode, '') AS bin, billable = 'true' AS done,
           CASE WHEN weight ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN weight::numeric::float END AS weight,
           isopk AS order_id
    FROM vs_service_orders
    WHERE NULLIF(date, '')::date >= $1::date - 20 AND NULLIF(date, '')::date <= $1::date + 7
    ORDER BY 1, 2, 4 NULLS LAST, 5, isopk`, [anchor.latest_done]);
  // Invoiced value by account and work date: what the day's work at each stop billed for.
  const dayValues = await query(`
    WITH b AS (SELECT $1::date - 20 AS f, $1::date + 8 AS t), ${PL.replace(/^\s*pl AS/, 'pl AS')}
    SELECT d::text AS date, level1, sum(totamt)::float AS value FROM l GROUP BY 1, 2 ORDER BY 1, 2`, [anchor.latest_done]);
  const weekdays = await query(`
    WITH ${BOUNDS}
    SELECT extract(isodow FROM date)::int AS dow, to_char(date, 'Dy') AS day, count(*)::int AS route_days,
           avg(services_done)::float AS done_per_day, avg(stops_done)::float AS stops_per_day
    FROM v_route_day, b WHERE services_done > 0 AND date >= b.f AND date < b.t
    GROUP BY 1, 2 ORDER BY 1`);
  return { latestDone: anchor.latest_done, routeDays, orders, dayValues, weekdays };
}

// ── Pricing — Anne ───────────────────────────────────────────────────────────────────────
// Every account's latest modal invoiced rate per service over the thirteen months to the latest
// posted month, with its volume and revenue over the last twelve; storage rate per box from the
// latest month of storage_rate_hist. List prices are not in the database.
async function pricing() {
  const rates = await query(`
    WITH ${BOUNDS}, ${PL},
    r AS (SELECT DISTINCT ON (level1, servcodeid) level1, servcodeid, servcode, servtype, service,
                 modal_rate, last_changed, month
          FROM v_rate_by_customer_service, b WHERE month >= b.latest - interval '12 months'
          ORDER BY level1, servcodeid, month DESC),
    v AS (SELECT level1, servcodeid, sum(units) AS units, sum(totamt) AS revenue, count(*) AS lines FROM l GROUP BY 1, 2)
    SELECT r.level1, ${NAME('r.level1')} AS customer, r.servcode, r.servtype, r.service, r.modal_rate::float,
           r.month::text AS rate_month, r.last_changed::text, coalesce(v.units, 0)::float AS units,
           coalesce(v.revenue, 0)::float AS revenue, coalesce(v.lines, 0)::int AS lines
    FROM r LEFT JOIN v USING (level1, servcodeid)
    ORDER BY r.servcode, r.modal_rate, r.level1`);
  const storage = await query(`
    WITH h AS (SELECT level1, to_date(mth, 'YYYY-MM') AS m, storage_billed, boxes FROM storage_rate_hist),
         latest AS (SELECT max(m) AS m FROM h)
    SELECT h.level1, ${NAME('h.level1')} AS customer, h.m::text AS month, h.boxes::int,
           h.storage_billed::float, (h.storage_billed / nullif(h.boxes, 0))::float AS rate_per_box
    FROM h JOIN latest USING (m) WHERE h.boxes > 0 ORDER BY 6, 1`);
  return { rates, storage, listPrices: null, listPricesNote: 'List prices are not in the database; the 2025 list is in docs/R4_PULSE_LOGIC_PACK.md section 5' };
}

// ── Calls — Anne and Trisha ──────────────────────────────────────────────────────────────
// One row per account that carries at least one signal. Below cost is not here: it needs the
// cost model, so the page computes it from the Margin data.
async function calls() {
  return query(`
    WITH ${BOUNDS}, ${PL},
    latest AS (SELECT cm.level1, cm.revenue, cm.trailing6_mean, cm.deviation_pct, cm.flag_down_2m
               FROM kpi.customer_monthly cm, b WHERE cm.month = b.latest),
    ltm AS (SELECT level1, sum(storage) AS storage, sum(service) AS service, sum(revenue) AS revenue
            FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t GROUP BY level1),
    destruction AS (SELECT level1, sum(totamt) AS revenue FROM l WHERE servcode IN (SELECT servcode FROM servcode WHERE servtype IN ('F','S')) GROUP BY level1),
    rc AS (SELECT level1, max(last_changed) AS last_changed, min(month) AS first_month, max(month) AS last_month,
                  count(DISTINCT servcodeid) AS codes
           FROM v_rate_by_customer_service, b WHERE month >= b.latest - interval '23 months' GROUP BY level1),
    overdue AS (SELECT level1, sum(review_overdue) AS boxes FROM storage_retention WHERE status = 'I' GROUP BY level1),
    a AS (
      SELECT ltm.level1, ltm.storage, ltm.service, ltm.revenue,
             latest.revenue AS month_revenue, latest.trailing6_mean, latest.deviation_pct,
             coalesce(latest.flag_down_2m, false) AS down_two_months,
             coalesce(latest.deviation_pct, 0) >= 20 AS up_20pct,
             (rc.codes > 0 AND (rc.last_changed IS NULL OR rc.last_changed < (SELECT latest FROM b) - interval '23 months')
               AND rc.first_month < (SELECT latest FROM b) - interval '20 months'
               AND rc.last_month >= (SELECT latest FROM b) - interval '2 months') AS not_raised_2y,
             rc.last_changed, rc.codes,
             (ltm.storage > 0 AND coalesce(destruction.revenue, 0) <= 0) AS storage_no_destruction,
             (coalesce(destruction.revenue, 0) > 0 AND ltm.storage <= 0) AS destruction_no_storage,
             coalesce(destruction.revenue, 0) AS destruction_revenue,
             coalesce(overdue.boxes, 0) AS boxes_review_overdue
      FROM ltm LEFT JOIN latest USING (level1) LEFT JOIN rc USING (level1)
      LEFT JOIN destruction USING (level1) LEFT JOIN overdue USING (level1)
      WHERE ltm.revenue > 0
    )
    SELECT a.level1, ${NAME('a.level1')} AS customer, storage::float, service::float, revenue::float,
           month_revenue::float, trailing6_mean::float, deviation_pct::float, down_two_months, up_20pct,
           coalesce(not_raised_2y, false) AS not_raised_2y, last_changed::text, codes::int,
           storage_no_destruction, destruction_no_storage, destruction_revenue::float, boxes_review_overdue::float
    FROM a
    WHERE down_two_months OR up_20pct OR coalesce(not_raised_2y, false) OR storage_no_destruction
       OR destruction_no_storage OR boxes_review_overdue > 0
    ORDER BY revenue DESC, a.level1`);
}

// ── Margin — the drill-down behind Pulse and Pricing ─────────────────────────────────────
// Per account, the last twelve months: revenue as invoiced, mean boxes, and every priced line's
// units by service code with its family from model.service_family. S5 pounds come split as S5T
// (on a shred-truck work order: shredded on site), S5B (on an account-day with bin work: the bin
// plant line) and S5P (purges and drop-offs). Bin services, customer visits and the main bin size
// come from Veri-Shred done orders. The page costs each account with model/rates.js.
async function margin() {
  const accounts = await query(`
    WITH ${BOUNDS},
    inv AS (SELECT level1, sum(ret_tot) AS storage, sum(ser_tot) AS service FROM invoices, b
            WHERE COALESCE(invdate, billdate) >= b.f AND COALESCE(invdate, billdate) < b.t GROUP BY level1),
    box AS (SELECT level1, sum(boxes) / 12.0 AS boxes FROM storage_rate_hist, b
            WHERE to_date(mth, 'YYYY-MM') >= b.f AND to_date(mth, 'YYYY-MM') < b.t GROUP BY level1),
    so AS (SELECT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date AS d, NULLIF(route, '') AS route,
                  NULLIF(cbtcode, '') AS bin
           FROM vs_service_orders, b
           WHERE billable = 'true' AND NULLIF(date, '')::date >= b.f AND NULLIF(date, '')::date < b.t),
    vs AS (SELECT level1, count(*) AS bins, count(DISTINCT (d, route)) AS visits, mode() WITHIN GROUP (ORDER BY bin) AS main_bin
           FROM so WHERE bin ~ '^B[1-6]$' GROUP BY level1)
    SELECT coalesce(inv.level1, box.level1, vs.level1) AS level1, ${NAME('coalesce(inv.level1, box.level1, vs.level1)')} AS customer,
           coalesce(inv.storage, 0)::float AS storage_revenue, coalesce(inv.service, 0)::float AS service_revenue,
           coalesce(box.boxes, 0)::float AS boxes, coalesce(vs.bins, 0)::int AS bins, coalesce(vs.visits, 0)::int AS visits, vs.main_bin
    FROM inv FULL JOIN box USING (level1) FULL JOIN vs USING (level1)
    ORDER BY 1`);
  const lines = await query(`
    WITH ${BOUNDS}, ${PL},
    truck AS (SELECT DISTINCT woid FROM l WHERE servcode = 'S0'),
    binday AS (SELECT DISTINCT level1, d FROM l WHERE servcode IN ${BIN_CODES}),
    tagged AS (SELECT l.*, CASE WHEN servcode <> 'S5' THEN servcode
                                WHEN woid IN (SELECT woid FROM truck) THEN 'S5T'
                                WHEN (level1, d) IN (SELECT level1, d FROM binday) THEN 'S5B'
                                ELSE 'S5P' END AS code
               FROM l)
    SELECT t.level1, t.code AS servcode, sf.family, sf.unit, coalesce(sf.drives_cost, false) AS drives_cost,
           sum(t.units)::float AS units, sum(t.totamt)::float AS revenue, count(DISTINCT t.d)::int AS days
    FROM tagged t LEFT JOIN model.service_family sf ON sf.servcode = t.servcode
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 2`);
  return { accounts, lines };
}

module.exports = { pulse, activity, pricing, calls, margin, customers };
