-- The Iron Mountain KPI set (DECISIONS.md), one row per month of v_monthly_storage_service.
-- NULL means the data does not yet exist; never a placeholder:
--   retention_rate          needs the VCK box master with date-in, date-out, out-reason
--   storage/service margin  the cost model lives in model/rates.js, not in the database yet
--   revenue_per_sqft, utilisation_pct   square footage and rack capacity not supplied (Mike)
--   revenue_per_route_hour  no route hours or durations were ever captured (data rule 8)
--   route_day_margin        needs driver pay rates by person (Mike)
-- Organic growth is year on year against the same month; there are no acquisitions in the
-- data, so organic equals reported. NULL for the first twelve months. Service growth is core
-- service (Citadel held apart).
-- perm_withdrawal_fees: invoiced permanent-withdrawal codes P1, P2, P3, P5, PC by invoice month.
-- Whether these are termination fees in Iron Mountain's sense is open with Anne.
-- Operational figures are on the work month: done route-days and stops from v_route_day, and
-- destruction revenue (servtype F bins, S shredding and ITAD) from priced lines, posted and
-- current, by work-order date, Citadel held apart. pounds_exec_default_pct is the share of
-- pounds that are B3/B6 capacity defaults rather than weighs.
DROP VIEW IF EXISTS v_kpi_industry CASCADE;
CREATE VIEW v_kpi_industry AS
WITH m AS (
  SELECT * FROM v_monthly_storage_service
),
citadel AS (
  SELECT DISTINCT level1 FROM customer WHERE custno = '00870'
),
vol AS (
  SELECT to_date(mth, 'YYYY-MM') AS month, sum(boxes) AS boxes
  FROM storage_rate_hist
  GROUP BY 1
),
pw AS (
  SELECT date_trunc('month', COALESCE(i.invdate, i.billdate))::date AS month, sum(p.totamt) AS fees
  FROM priced_lines p
  JOIN servcode s USING (servcodeid)
  JOIN invoices i USING (invoice_no)
  WHERE s.servcode IN ('P1', 'P2', 'P3', 'P5', 'PC')
  GROUP BY 1
),
ops AS (
  SELECT date_trunc('month', date)::date AS month,
         count(*) FILTER (WHERE services_done > 0) AS route_days,
         sum(stops_done)          AS stops,
         sum(pounds)              AS pounds,
         sum(pounds_exec_default) AS pounds_exec_default
  FROM v_route_day
  WHERE date IS NOT NULL
  GROUP BY 1
),
destruction AS (
  SELECT date_trunc('month', l.wodate)::date AS month, sum(l.totamt) AS revenue
  FROM (SELECT level1, servcodeid, wodate, totamt, invoiced FROM priced_lines
        UNION ALL
        SELECT level1, servcodeid, wodate, totamt, invoiced FROM priced_lines_current) l
  JOIN servcode s USING (servcodeid)
  WHERE lower(l.invoiced) = 'true'
    AND s.servtype IN ('F', 'S')
    AND l.level1 NOT IN (SELECT level1 FROM citadel)
  GROUP BY 1
)
SELECT m.month, m.storage, m.service, m.citadel, m.core,
       m.service - m.citadel AS core_service,
       round(100 * m.storage / NULLIF(m.core, 0), 1) AS storage_share_pct,
       round(100 * (m.storage / NULLIF(ly.storage, 0) - 1), 1) AS storage_growth_yoy_pct,
       round(100 * ((m.service - m.citadel) / NULLIF(ly.service - ly.citadel, 0) - 1), 1) AS core_service_growth_yoy_pct,
       vol.boxes AS storage_boxes,
       NULL::numeric AS retention_rate,
       NULL::numeric AS storage_gross_margin_pct,
       NULL::numeric AS service_gross_margin_pct,
       NULL::numeric AS revenue_per_sqft,
       NULL::numeric AS utilisation_pct,
       COALESCE(pw.fees, 0) AS perm_withdrawal_fees,
       ops.route_days,
       round(ops.stops::numeric / NULLIF(ops.route_days, 0), 1) AS stops_per_route_day,
       round(destruction.revenue / NULLIF(ops.stops, 0), 2) AS revenue_per_stop,
       NULL::numeric AS revenue_per_route_hour,
       NULL::numeric AS route_day_margin,
       round(ops.pounds / NULLIF(ops.route_days, 0)) AS pounds_per_route_day,
       round(100 * ops.pounds_exec_default / NULLIF(ops.pounds, 0), 1) AS pounds_exec_default_pct
FROM m
LEFT JOIN m ly ON ly.month = m.month - interval '12 months'
LEFT JOIN vol ON vol.month = m.month
LEFT JOIN pw ON pw.month = m.month
LEFT JOIN ops ON ops.month = m.month
LEFT JOIN destruction ON destruction.month = m.month
ORDER BY m.month;
