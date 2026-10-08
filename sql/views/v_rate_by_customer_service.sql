-- Modal invoiced rate per customer (level1) per service code per month, and when it last changed.
-- Posted priced_lines, invoiced lines; the month is the work-order month, the rate the work was
-- charged at. Zero-rate lines (work absorbed by a flat fee) are counted in zero_rate_lines but
-- kept out of the mode. A tie for the mode takes the lower rate.
-- last_changed is the latest month up to this one whose modal rate differs from the previous
-- month seen; NULL means unchanged since first_month.
DROP VIEW IF EXISTS v_rate_by_customer_service CASCADE;
CREATE VIEW v_rate_by_customer_service AS
WITH l AS (
  SELECT level1, servcodeid, date_trunc('month', wodate)::date AS month, rate
  FROM priced_lines
  WHERE lower(invoiced) = 'true'
),
m AS (
  SELECT level1, servcodeid, month,
         mode() WITHIN GROUP (ORDER BY rate) FILTER (WHERE rate > 0) AS modal_rate,
         count(*) FILTER (WHERE rate > 0)              AS lines,
         count(*) FILTER (WHERE rate = 0)              AS zero_rate_lines,
         count(DISTINCT rate) FILTER (WHERE rate > 0)  AS distinct_rates
  FROM l
  GROUP BY 1, 2, 3
  HAVING count(*) FILTER (WHERE rate > 0) > 0
),
c AS (
  SELECT m.*,
         lag(modal_rate) OVER (PARTITION BY level1, servcodeid ORDER BY month) AS previous_rate,
         min(month)      OVER (PARTITION BY level1, servcodeid) AS first_month
  FROM m
)
SELECT c.month, c.level1, c.servcodeid, s.servcode, s.servtype, s.description AS service,
       c.modal_rate, c.lines, c.zero_rate_lines, c.distinct_rates, c.first_month,
       max(CASE WHEN c.modal_rate <> c.previous_rate THEN c.month END)
         OVER (PARTITION BY c.level1, c.servcodeid ORDER BY c.month) AS last_changed
FROM c
LEFT JOIN servcode s USING (servcodeid);
