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
  // months posted since kpi.monthly was last rebuilt, straight from the invoices view
  const posted = await query(`
    SELECT month::text, storage::float, service::float, citadel::float, core::float
    FROM v_monthly_storage_service WHERE month > (SELECT max(month) FROM kpi.monthly) ORDER BY month`);
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
  // Done services each working day, fifteen months to the latest done work: the projection of
  // where the month lands, and its backtest on past months. Booked is kept to check the pace.
  const dailyDone = await query(`
    SELECT date::text, sum(services_done)::int AS done, sum(services)::int AS booked
    FROM v_route_day
    WHERE date > (SELECT max(date) FROM v_route_day WHERE services_done > 0) - interval '15 months'
      AND date <= (SELECT max(date) FROM v_route_day WHERE services_done > 0)
    GROUP BY 1 ORDER BY 1`);
  // the tie-out: straight from VCK's invoices, not kpi.monthly, so a month that moves after it was built shows
  const tieout = await query(`
    SELECT date_trunc('month', COALESCE(invdate, billdate))::date::text AS month, count(*)::int AS invoices,
           sum(ret_tot)::float AS storage, sum(ser_tot)::float AS service,
           coalesce(sum(ser_tot) FILTER (WHERE custno = '00870'), 0)::float AS citadel,
           max(COALESCE(invdate, billdate))::date::text AS latest
    FROM invoices WHERE COALESCE(invdate, billdate) >= (SELECT max(month) FROM kpi.monthly) - interval '3 months'
    GROUP BY 1 ORDER BY 1`);
  return { monthly, posted, currentRun, customers, downTwoMonths, concentration, pace, dailyDone, tieout };
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
  const byId = new Map(ids.map(id => [id, { level1: id, customer: nameOf.get(id), storage: months.map(() => 0), service: months.map(() => 0), boxes: months.map(() => 0) }]));
  for (const r of rows) {
    const a = byId.get(r.level1), i = months.indexOf(r.month);
    if (i >= 0) { a.storage[i] = r.storage; a.service[i] = r.service; }
  }
  // boxes stored each month (storage_rate_hist): net boxes in and out, month by month
  const boxes = ids.length ? await query(`
    SELECT level1, to_date(mth, 'YYYY-MM')::text AS month, sum(boxes)::float AS boxes
    FROM storage_rate_hist WHERE level1 = ANY($1::int[]) AND to_date(mth, 'YYYY-MM') > $2::date - interval '24 months' AND to_date(mth, 'YYYY-MM') <= $2::date
    GROUP BY 1, 2 ORDER BY 1, 2`, [ids, latest]) : [];
  for (const r of boxes) { const a = byId.get(r.level1), i = months.indexOf(r.month); if (a && i >= 0) a.boxes[i] = r.boxes; }
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
    WHERE date >= least($1::date - 56, (date_trunc('month', $1::date) - interval '1 month')::date) AND date <= $1::date + 14
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
  // The long way round: done services by postcode over twelve months, service address else billing.
  const postcodes = await query(`
    SELECT left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode, count(*)::int AS services,
           count(DISTINCT (date, slocid))::int AS visits, count(DISTINCT level1)::int AS customers,
           array_to_string((array_agg(DISTINCT NULLIF(company, '') ORDER BY NULLIF(company, '')))[1:2], ', ') AS names,
           bool_and(NULLIF(s_zip, '') IS NULL) AS billing_only
    FROM vs_service_orders
    WHERE billable = 'true' AND NULLIF(date, '')::date > $1::date - 365 AND NULLIF(date, '')::date <= $1::date
      AND coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) IS NOT NULL
    GROUP BY 1 ORDER BY 1`, [anchor.latest_done]);
  // Month to date by account: done services per account per day, this month and last.
  const accountDays = await query(`
    SELECT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date::text AS date, count(*)::int AS done
    FROM vs_service_orders
    WHERE billable = 'true' AND NULLIF(level1, '') IS NOT NULL
      AND NULLIF(date, '')::date >= (date_trunc('month', $1::date) - interval '1 month')::date AND NULLIF(date, '')::date <= $1::date
    GROUP BY 1, 2 ORDER BY 1, 2`, [anchor.latest_done]);
  // Which postcodes each route covered on each day, six months: could a nearby route have taken a stop?
  const routeHistory = await query(`
    SELECT date::text, route, postcode_list FROM v_route_day
    WHERE services_done > 0 AND date > $1::date - 183 AND date <= $1::date AND route IS NOT NULL
    ORDER BY 1, 2`, [anchor.latest_done]);
  return { latestDone: anchor.latest_done, routeDays, orders, dayValues, weekdays, postcodes, accountDays, routeHistory };
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
    -- eligible to shred, the same rule as components/storage.js rowStates: overdue, not on hold, not permanent
    overdue AS (SELECT level1, sum(LEAST(boxes - LEAST(boxes, hold + perm), GREATEST(0, od - hold - perm))) AS boxes
                FROM (SELECT level1, sum(boxes) AS boxes, coalesce(sum(review_overdue), 0) AS od, coalesce(sum(legal_hold), 0) AS hold, coalesce(sum(permanent), 0) AS perm
                      FROM storage_retention WHERE status = 'I'
                      GROUP BY level1, coalesce(NULLIF(home_loc, ''), '—'), coalesce(NULLIF(boxtype, ''), '—')) x
                GROUP BY level1),
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
// The first month each account bought each line of service, with what it spent in its first twelve
// months, and the account's first billed month: a line that starts after the account did is a
// cross-sell R4 has actually made.
async function crossSellHistory() {
  const firsts = await query(`
    WITH fam AS (
      SELECT p.level1, sf.family, date_trunc('month', p.wodate)::date AS m, sum(p.totamt) AS rev
      FROM priced_lines p JOIN servcode s USING (servcodeid) JOIN model.service_family sf ON sf.servcode = s.servcode
      WHERE sf.family IN ('handling', 'movement', 'bin', 'shred', 'itad') GROUP BY 1, 2, 3),
    f AS (SELECT level1, family, min(m) AS first FROM fam WHERE rev > 0 GROUP BY 1, 2),
    acct AS (SELECT level1, min(date_trunc('month', COALESCE(invdate, billdate)))::date AS first FROM invoices
             WHERE coalesce(ret_tot, 0) + coalesce(ser_tot, 0) > 0 GROUP BY 1)
    SELECT f.level1, f.family, f.first::text AS first, acct.first::text AS account_first,
           sum(fam.rev) FILTER (WHERE fam.m < f.first + interval '12 months')::float AS first_year
    FROM f JOIN fam USING (level1, family) LEFT JOIN acct USING (level1)
    GROUP BY f.level1, f.family, f.first, acct.first ORDER BY 1, 2`);
  const [{ start }] = await query(`SELECT min(wodate)::date::text AS start FROM priced_lines`);
  return { firsts, dataStart: start };
}

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
    tagged AS (SELECT l.*, CASE WHEN servcode = '01' AND units > 1 THEN '01B'
                                WHEN servcode <> 'S5' THEN servcode
                                WHEN woid IN (SELECT woid FROM truck) THEN 'S5T'
                                WHEN (level1, d) IN (SELECT level1, d FROM binday) THEN 'S5B'
                                ELSE 'S5P' END AS code
               FROM l)
    SELECT t.level1, t.code AS servcode, sf.family, CASE WHEN t.code = '01B' THEN 'box' ELSE sf.unit END AS unit, coalesce(sf.drives_cost, false) AS drives_cost,
           sum(t.units)::float AS units, sum(t.totamt)::float AS revenue, count(DISTINCT t.d)::int AS days
    FROM tagged t LEFT JOIN model.service_family sf ON sf.servcode = t.servcode
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1, 2`);
  return { accounts, lines, history: await crossSellHistory() };
}

// ── The drill below a customer: work orders and visits ───────────────────────────────────
// One account's work orders over the last six months (each with its lines) and its Veri-Shred
// visits (done orders by day and route). Live, /api/customer/:id runs this for any account; the
// snapshot keeps the 50 largest accounts in fixtures/drill.json.
async function customerDrill(level1) {
  const orders = await query(`
    WITH b AS (SELECT (max(month) - interval '5 months')::date AS f, (max(month) + interval '1 month')::date AS t FROM kpi.monthly), ${PL}
    SELECT l.woid, min(l.d)::text AS date, count(*)::int AS lines, sum(l.totamt)::float AS revenue,
           json_agg(json_build_object('code', l.servcode, 'units', l.units::float, 'revenue', l.totamt::float) ORDER BY l.totamt DESC) AS items
    FROM l WHERE l.level1 = $1 GROUP BY l.woid ORDER BY min(l.d) DESC, l.woid DESC LIMIT 200`, [level1]);
  const visits = await query(`
    WITH b AS (SELECT (max(month) - interval '5 months')::date AS f, (max(month) + interval '1 month')::date AS t FROM kpi.monthly)
    SELECT NULLIF(date, '')::date::text AS date, NULLIF(route, '') AS route, string_agg(DISTINCT NULLIF(driver, ''), ' ') AS driver,
           count(*)::int AS services, count(DISTINCT NULLIF(slocid, ''))::int AS stops,
           sum(CASE WHEN weight ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN weight::numeric ELSE 0 END)::float AS pounds,
           string_agg(DISTINCT NULLIF(cbtcode, ''), ' ') AS bins
    FROM vs_service_orders, b
    WHERE billable = 'true' AND NULLIF(level1, '')::int = $1
      AND NULLIF(date, '')::date >= b.f AND NULLIF(date, '')::date < b.t
    GROUP BY 1, 2 ORDER BY 1 DESC, 2 LIMIT 200`, [level1]);
  // (customerJobs below is the same work over the margin's twelve months, every order, tagged as the margin query tags it.)
  // The whole route on each of the account's visit days, six months (about 130 working days), stop by stop in order: who else
  // the driver served, where, and how much, so a job's share of the day can be seen on a map.
  const routes = await query(`
    WITH mine AS (
      SELECT DISTINCT NULLIF(date, '')::date AS d, NULLIF(route, '') AS route FROM vs_service_orders
      WHERE billable = 'true' AND NULLIF(level1, '')::int = $1 AND NULLIF(route, '') IS NOT NULL
      ORDER BY 1 DESC LIMIT 130)
    SELECT m.d::text AS date, m.route, NULLIF(o.slocid, '') AS stop,
           min(CASE WHEN o.rorder ~ '^[0-9]+(\\.[0-9]+)?$' THEN o.rorder::numeric END)::float AS seq,
           min(NULLIF(o.level1, '')::int) AS level1, min(NULLIF(o.company, '')) AS company,
           min(left(coalesce(NULLIF(o.s_zip, ''), NULLIF(o.zip, '')), 5)) AS postcode,
           count(*)::int AS services,
           sum(CASE WHEN o.weight ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN o.weight::numeric ELSE 0 END)::float AS pounds
    FROM mine m JOIN vs_service_orders o ON NULLIF(o.date, '')::date = m.d AND NULLIF(o.route, '') = m.route AND o.billable = 'true'
    GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2, 4 NULLS LAST, 3`, [level1]);
  return { level1, orders, visits, routes };
}

// Every route day's stops, twelve months to the latest done work, in route order: the route, the stop,
// its account and postcode, and its done services. components/routecost.js shares each day's cost
// between its stops by time, so an account's bin cost is the sum of its real days (31 October 2026).
async function routestops() {
  const [anchor] = await query(`SELECT max(date)::text AS latest_done FROM v_route_day WHERE services_done > 0`);
  return query(`
    SELECT NULLIF(date, '')::date::text AS date, NULLIF(route, '') AS route, NULLIF(slocid, '') AS stop,
           min(CASE WHEN rorder ~ '^[0-9]+(\\.[0-9]+)?$' THEN rorder::numeric END)::float AS seq,
           min(NULLIF(level1, '')::int) AS level1, min(left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5)) AS postcode,
           count(*)::int AS services,
           sum(CASE WHEN weight ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN weight::numeric ELSE 0 END)::float AS pounds
    FROM vs_service_orders
    WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL
      AND NULLIF(date, '')::date > $1::date - 365 AND NULLIF(date, '')::date <= $1::date
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 4 NULLS LAST, 3`, [anchor.latest_done]);
}

// Operations: every done stop since route days are complete (January 2025; checked 3 November 2026), with who drove it.
// The stop order is not here on purpose: rorder is one number for the whole day, and porder and sorder run no closer to a
// sensible round than a shuffle (checked 3 November 2026), so components/opsdata.js draws the shortest likely round.
async function routehistory() {
  const [anchor] = await query(`SELECT max(date)::text AS latest_done FROM v_route_day WHERE services_done > 0`);
  return query(`
    SELECT NULLIF(date, '')::date::text AS date, route, NULLIF(slocid, '') AS stop, min(NULLIF(driver, '')) AS driver,
           min(NULLIF(level1, '')::int) AS level1, min(left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5)) AS postcode, count(*)::int AS services
    FROM vs_service_orders
    WHERE billable = 'true' AND NULLIF(route, '') IS NOT NULL AND route <> '--'
      AND NULLIF(date, '')::date >= '2025-01-01' AND NULLIF(date, '')::date <= $1::date
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [anchor.latest_done]);
}

// Operations: what route work billed in twelve months by work date, and the plant pounds on S5 (data rule 6). A sub-account's
// lines (levelid) are shared across its postcodes by the services done at each; one with no done services has no postcode.
async function arearevenue() {
  const [anchor] = await query(`SELECT max(date)::text AS latest_done FROM v_route_day WHERE services_done > 0`);
  return query(`
    WITH vs AS (SELECT NULLIF(levelid, '')::int AS levelid, left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode, count(*)::float AS n
                FROM vs_service_orders
                WHERE billable = 'true' AND coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) ~ '^[0-9]{5}' AND NULLIF(levelid, '') IS NOT NULL
                  AND NULLIF(date, '')::date > $1::date - 365 AND NULLIF(date, '')::date <= $1::date GROUP BY 1, 2),
    site AS (SELECT levelid, postcode, n / sum(n) OVER (PARTITION BY levelid) AS share FROM vs)
    SELECT p.level1, site.postcode,
           sum(CASE WHEN sf.family IN ('bin', 'itad') THEN p.totamt * coalesce(site.share, 1) ELSE 0 END)::float AS revenue,
           sum(CASE WHEN s.servcode = 'S5' THEN p.units * coalesce(site.share, 1) ELSE 0 END)::float AS pounds
    FROM priced_lines p JOIN servcode s USING (servcodeid) LEFT JOIN model.service_family sf ON sf.servcode = s.servcode LEFT JOIN site ON site.levelid = p.levelid
    WHERE p.level1 <> 6714 AND p.wodate > $1::date - 365 AND p.wodate <= $1::date AND (sf.family IN ('bin', 'itad') OR s.servcode = 'S5')
    GROUP BY 1, 2 ORDER BY 1, 2`, [anchor.latest_done]);
}

// Box deliveries and pickups, twelve months: VCK delivery lines (service code 01) by day and account,
// with a postcode for placing them on that day's shred route (components/routecost.js). VCK holds no
// addresses (checked 1 November 2026: the only addresses in the database are Veri-Shred's stops), so:
//   1. the sub-account's own Veri-Shred postcode (levelid: the site itself), else
//   2. the account's usual Veri-Shred postcode (level1: often the head office), else
//   3. none here; a postcode typed on Settings is applied by routecost.js.
async function deliverydays() {
  return query(`
    WITH ${BOUNDS},
    pl AS (
      SELECT level1, levelid, woid, servcodeid, units, totamt, wodate FROM priced_lines
      UNION ALL
      SELECT c.level1, c.levelid, c.woid, c.servcodeid, c.units, c.totamt, c.wodate FROM priced_lines_current c
      WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)),
    l AS (SELECT pl.level1, pl.levelid, pl.woid, pl.units, pl.totamt, pl.wodate::date AS d FROM pl JOIN servcode s USING (servcodeid), b
          WHERE s.servcode = '01' AND pl.units > 0 AND pl.wodate >= b.f AND pl.wodate < b.t),
    vs AS (SELECT NULLIF(level1, '')::int AS level1, NULLIF(levelid, '')::int AS levelid, left(coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')), 5) AS postcode
           FROM vs_service_orders WHERE coalesce(NULLIF(s_zip, ''), NULLIF(zip, '')) ~ '^[0-9]{5}'),
    sub AS (SELECT DISTINCT ON (levelid) levelid, postcode FROM (SELECT levelid, postcode, count(*) AS n FROM vs WHERE levelid IS NOT NULL GROUP BY 1, 2) x ORDER BY levelid, n DESC),
    acc AS (SELECT DISTINCT ON (level1) level1, postcode FROM (SELECT level1, postcode, count(*) AS n FROM vs WHERE level1 IS NOT NULL GROUP BY 1, 2) x ORDER BY level1, n DESC)
    SELECT l.d::text AS date, l.level1, count(DISTINCT l.woid)::int AS orders, sum(CASE WHEN l.units <= 1 THEN l.units ELSE 0 END)::float AS trips, sum(l.totamt)::float AS revenue,
           coalesce(min(sub.postcode), min(acc.postcode)) AS postcode,
           CASE WHEN min(sub.postcode) IS NOT NULL THEN 'site' WHEN min(acc.postcode) IS NOT NULL THEN 'account' END AS basis
    FROM l LEFT JOIN sub ON sub.levelid = l.levelid LEFT JOIN acc ON acc.level1 = l.level1
    GROUP BY 1, 2 ORDER BY 1, 2`);
}

// The P&L by month from QuickBooks (scripts/load_gl.js → model.gl_month), summed by line of the
// EBITDA bridge, with the overhead accounts named so a misfiled line shows. Empty until loaded.
async function gl() {
  const has = await query(`SELECT to_regclass('model.gl_month') IS NOT NULL AS ok`);
  if (!has[0].ok) return { rows: [], loaded: false };
  const rows = await query(`SELECT month::text, account, min(name) AS name, line, sum(amount)::float AS amount
    FROM model.gl_month GROUP BY 1, 2, 4 ORDER BY 1, 4, 2`);
  const [l] = await query(`SELECT max(loaded_at)::text AS at, string_agg(DISTINCT source, ', ') AS source FROM model.gl_month`);
  return { rows, loaded: rows.length > 0, loadedAt: l.at, source: l.source };
}

// Snapshot: the drill for the 50 largest accounts, and a check of data rule 9 (is the units field
// on retrieval, return and destruction-pull lines a box barcode, or a count of boxes?).
// Every job of one account over the margin's twelve months, uncapped: each order with its lines, the
// lines tagged exactly as margin() tags them, so jobs add up to the lines the margin is built from.
async function customerJobs(level1) {
  return query(`
    WITH ${BOUNDS}, ${PL},
    truck AS (SELECT DISTINCT woid FROM l WHERE servcode = 'S0' AND level1 = $1),
    binday AS (SELECT DISTINCT d FROM l WHERE servcode IN ${BIN_CODES} AND level1 = $1),
    tagged AS (SELECT l.*, CASE WHEN servcode = '01' AND units > 1 THEN '01B'
                                WHEN servcode <> 'S5' THEN servcode
                                WHEN woid IN (SELECT woid FROM truck) THEN 'S5T'
                                WHEN d IN (SELECT d FROM binday) THEN 'S5B'
                                ELSE 'S5P' END AS code
               FROM l WHERE level1 = $1)
    SELECT woid, min(d)::text AS date, sum(totamt)::float AS revenue,
           json_agg(json_build_object('code', code, 'units', units::float, 'revenue', totamt::float) ORDER BY totamt DESC, code, woservid) AS items
    FROM tagged GROUP BY woid ORDER BY min(d) DESC, woid DESC`, [level1]);
}

// Offline: the jobs of the accounts the drill keeps.
async function jobs() {
  const top = await query(`SELECT level1 FROM invoices, (SELECT (max(month) - interval '11 months')::date AS f FROM kpi.monthly) b
    WHERE COALESCE(invdate, billdate) >= b.f GROUP BY level1 ORDER BY sum(ret_tot + ser_tot) DESC, level1 LIMIT 50`);
  const accounts = [];
  for (const t of top) accounts.push({ level1: t.level1, orders: await customerJobs(t.level1) });
  return { accounts };
}

async function drill() {
  const top = await query(`
    WITH ${BOUNDS}
    SELECT level1 FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t
    GROUP BY level1 ORDER BY sum(revenue) DESC, level1 LIMIT 50`);
  const accounts = [];
  for (const t of top) accounts.push(await customerDrill(t.level1));
  const unitsCheck = await query(`
    SELECT s.servcode, count(*)::int AS lines, min(p.units)::float AS min_units, max(p.units)::float AS max_units,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY p.units)::float AS median_units,
           (count(*) FILTER (WHERE p.units = 1)::float / count(*))::float AS share_one
    FROM priced_lines p JOIN servcode s USING (servcodeid)
    WHERE s.servcode IN ('20', '30', 'S1') AND p.wodate >= now() - interval '12 months'
    GROUP BY 1 ORDER BY 1`);
  return { accounts, unitsCheck };
}

// The warehouse (Routes › Warehouse): boxes in storage by account, box type and home location, with
// their retention state (overdue for review, permanent, legal hold, over ten years); and boxes billed
// by month for 24 months. Capacity is not in the database, so nothing here is a percent full.
async function storage() {
  const rows = await query(`
    SELECT r.level1, coalesce(NULLIF(r.home_loc, ''), '—') AS loc, coalesce(NULLIF(r.boxtype, ''), '—') AS boxtype,
           sum(r.boxes)::int AS boxes, sum(r.review_overdue)::int AS overdue, sum(r.permanent)::int AS permanent,
           sum(r.legal_hold)::int AS hold, sum(r.over_ten_years)::int AS ten,
           sum(GREATEST(coalesce(r.review_overdue, 0) - coalesce(r.legal_hold, 0) - coalesce(r.permanent, 0), 0))::int AS eligible,
           min(r.oldest_received)::date::text AS oldest
    FROM storage_retention r WHERE r.status = 'I'
    GROUP BY 1, 2, 3 HAVING sum(r.boxes) > 0 ORDER BY 4 DESC`);
  const names = await query(`
    SELECT DISTINCT ON (level1) level1, name AS customer FROM customer
    WHERE level1 IN (SELECT DISTINCT level1 FROM storage_retention WHERE status = 'I')
    ORDER BY level1, level NULLS LAST, custno`);
  const months = await query(`
    SELECT to_date(mth, 'YYYY-MM')::text AS month, sum(boxes)::float AS boxes, sum(storage_billed)::float AS billed, count(DISTINCT level1)::int AS accounts
    FROM storage_rate_hist GROUP BY 1 ORDER BY 1 DESC LIMIT 24`);
  return { rows, names, months: months.reverse() };
}

// ── Segments — Home ──────────────────────────────────────────────────────────────────────
// Service by line of business and month of work, from priced lines (both tables, a line counted
// once), Citadel apart, 24 months to the latest priced work. The family is model.service_family's;
// lines with no family, or the 'none' family (surcharges, minimums, fees), are 'other'. Storage is
// not here: it bills from ret_tot by invoice month (pulse.monthly).
async function segments() {
  const rows = await query(`
    WITH b AS (SELECT (date_trunc('month', m) - interval '23 months')::date AS f, (m::date + 1) AS t
               FROM (SELECT greatest((SELECT max(wodate) FROM priced_lines), (SELECT max(wodate) FROM priced_lines_current)) AS m) x),
    ${PL}
    SELECT date_trunc('month', l.d)::date::text AS month,
           CASE WHEN sf.family IN ('bin', 'shred', 'handling', 'movement', 'itad', 'labour') THEN sf.family ELSE 'other' END AS family,
           sum(l.totamt)::float AS revenue, count(DISTINCT l.level1)::int AS accounts
    FROM l LEFT JOIN model.service_family sf ON sf.servcode = l.servcode
    WHERE l.level1 <> 6714 GROUP BY 1, 2 ORDER BY 1, 2`);
  return { rows };
}

// ── Lines by account — Home's lines of business and their pop-outs ──────────────────────────────
// Priced lines by month, account and service code, Citadel apart, fifteen months to the latest priced
// work; the finished work orders of recent months, which VCK has not priced yet, with their units; and
// each account and code's most recent price and largest line, across all of its history.
// components/linework.js prices those. Family as in segments: no family, or 'none', is 'other'.
async function linework() {
  const FAM = `CASE WHEN sf.family IN ('bin', 'shred', 'handling', 'movement', 'itad', 'labour') THEN sf.family ELSE 'other' END`;
  const priced = await query(`
    WITH b AS (SELECT (date_trunc('month', m) - interval '17 months')::date AS f, (m::date + 1) AS t
               FROM (SELECT greatest((SELECT max(wodate) FROM priced_lines), (SELECT max(wodate) FROM priced_lines_current)) AS m) x),
    ${PL}
    SELECT date_trunc('month', l.d)::date::text AS month, l.level1, l.servcode, ${FAM} AS family,
           sum(l.totamt)::float AS revenue, sum(l.units)::float AS units, count(*)::int AS lines
    FROM l LEFT JOIN model.service_family sf ON sf.servcode = l.servcode
    WHERE l.level1 <> 6714 GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`);
  const orders = await query(`
    SELECT (left(w.duedate, 7) || '-01') AS month, w.level1, s.servcode, s.description, ${FAM} AS family,
           count(*)::int AS orders, coalesce(sum(u.units), 0)::float AS units
    FROM work_orders w JOIN servcode s USING (servcodeid)
    LEFT JOIN work_order_units u USING (woservid, woid)
    LEFT JOIN model.service_family sf ON sf.servcode = s.servcode
    WHERE w.level1 <> 6714 AND w.serv_fin IS NOT NULL AND w.duedate >= to_char(current_date - interval '3 months', 'YYYY-MM')
    GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 3`);
  const lastPrice = await query(`
    SELECT DISTINCT ON (p.level1, s.servcode) p.level1, s.servcode, (p.totamt / p.units)::float AS rate, p.wodate::date::text AS date,
           max(p.units) OVER (PARTITION BY p.level1, s.servcode)::float AS max_units
    FROM priced_lines p JOIN servcode s USING (servcodeid)
    WHERE p.level1 <> 6714 AND p.units > 0
    ORDER BY p.level1, s.servcode, p.wodate DESC, p.woservid DESC`);
  return { priced, orders, lastPrice };
}

// ── Every account by month billed, and by line ──────────────────────────────────────────────
// The whole book, so the Accounts table adds to invoiced core. kpi.customer_monthly less Citadel is
// kpi.monthly's core to the cent. Its lines are the priced lines of the invoices in each month.
async function accountmonths() {
  const rows = await query(`
    WITH ${BOUNDS}
    SELECT cm.level1, cm.month::text, cm.storage::float, cm.service::float FROM kpi.customer_monthly cm, b
    WHERE cm.month > b.latest - interval '13 months' AND cm.month <= b.latest ORDER BY cm.level1, cm.month`);
  const [{ latest }] = await query(`SELECT max(month)::text AS latest FROM kpi.monthly`);
  const months = [];
  for (let i = 12; i >= 0; i--) { const d = new Date(latest + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); months.push(d.toISOString().slice(0, 10)); }
  const ids = [...new Set(rows.map(r => r.level1))];
  const names = await query(`SELECT x.level1, ${NAME('x.level1')} AS customer FROM unnest($1::int[]) AS x(level1)`, [ids]);
  const nameOf = new Map(names.map(n => [n.level1, n.customer]));
  const by = new Map(ids.map(id => [id, { level1: id, customer: nameOf.get(id) || `Account ${id}`, storage: months.map(() => 0), service: months.map(() => 0) }]));
  for (const r of rows) { const a = by.get(r.level1), i = months.indexOf(r.month); if (i >= 0) { a.storage[i] = r.storage; a.service[i] = r.service; } }
  return { months, accounts: [...by.values()] };
}
async function accountlines() {
  const FAM = `CASE WHEN sf.family IN ('bin', 'shred', 'handling', 'movement', 'itad', 'labour') THEN sf.family ELSE 'other' END`;
  const rows = await query(`
    WITH ${BOUNDS}
    SELECT p.level1, date_trunc('month', COALESCE(i.invdate, i.billdate))::date::text AS month, ${FAM} AS family, sum(p.totamt)::float AS revenue
    FROM priced_lines p JOIN invoices i USING (invoice_no) JOIN servcode s USING (servcodeid)
    LEFT JOIN model.service_family sf ON sf.servcode = s.servcode, b
    WHERE i.level1 <> 6714 AND COALESCE(i.invdate, i.billdate) > b.latest - interval '13 months' AND COALESCE(i.invdate, i.billdate) < b.t
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`);
  return { rows };
}

// ── One account's invoices in a month ──────────────────────────────────────────────────────────
// By invoice date, posted invoices; what was on each from its priced lines, by service. Storage has no
// priced lines: it is the invoice's ret_tot.
async function customerInvoices(level1, month) {
  const inv = await query(`
    SELECT invoice_no, COALESCE(invdate, billdate)::date::text AS date, ret_tot::float AS storage, ser_tot::float AS service, (ret_tot + ser_tot)::float AS total
    FROM invoices WHERE level1 = $1 AND COALESCE(invdate, billdate) >= $2::date AND COALESCE(invdate, billdate) < ($2::date + interval '1 month')
    ORDER BY (ret_tot + ser_tot) DESC, invoice_no`, [level1, month]);
  const lines = await query(`
    SELECT p.invoice_no, s.servcode, s.description AS service, sum(p.units)::float AS units, sum(p.totamt)::float AS amount
    FROM priced_lines p JOIN servcode s USING (servcodeid)
    WHERE p.invoice_no = ANY($1::text[]) AND p.totamt <> 0 GROUP BY 1, 2, 3 ORDER BY 1, 5 DESC`, [inv.map(i => i.invoice_no)]);
  const by = new Map();
  for (const l of lines) (by.get(l.invoice_no) || by.set(l.invoice_no, []).get(l.invoice_no)).push(l);
  return { level1, month, total: inv.reduce((t, i) => t + i.total, 0), invoices: inv.map(i => ({ ...i, lines: by.get(i.invoice_no) || [] })) };
}

// the largest accounts' last three posted months, for offline work and the tests
async function invoices() {
  const top = await query(`
    WITH ${BOUNDS}
    SELECT level1 FROM kpi.customer_monthly, b WHERE month >= b.f AND month < b.t
    GROUP BY level1 ORDER BY sum(revenue) DESC, level1 LIMIT 12`);
  const [{ latest }] = await query(`SELECT max(month)::text AS latest FROM kpi.monthly`);
  const months = [0, 1, 2].map(n => new Date(Date.UTC(+latest.slice(0, 4), +latest.slice(5, 7) - 1 - n, 1)).toISOString().slice(0, 10));
  const rows = [];
  for (const t of top) for (const m of months) rows.push(await customerInvoices(t.level1, m));
  return { rows };
}

module.exports = { routehistory, arearevenue, invoices, customerInvoices, pulse, activity, pricing, calls, margin, customers, drill, customerDrill, customerJobs, jobs, storage, segments, linework, routestops, deliverydays, gl, accountmonths, accountlines };
