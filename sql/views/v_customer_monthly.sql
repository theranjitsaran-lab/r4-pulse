-- Each customer's monthly revenue against its own trailing-six mean. Posted invoices, invoice
-- month, the same months as v_monthly_storage_service. Customer is level1 (one custno each).
-- A month with no invoice counts as $0 from the customer's first month onward.
-- trailing6_mean is the six months before this one, NULL until six exist.
-- deviation_pct is NULL where that mean is zero or negative.
-- flag_down_2m: below its own trailing-six mean this month and last month.
DROP VIEW IF EXISTS v_customer_monthly CASCADE;
CREATE VIEW v_customer_monthly AS
WITH months AS (
  SELECT month FROM v_monthly_storage_service
),
inv AS (
  SELECT date_trunc('month', COALESCE(invdate, billdate))::date AS month, level1,
         min(custno) AS custno, sum(ret_tot) AS storage, sum(ser_tot) AS service
  FROM invoices
  GROUP BY 1, 2
),
cust AS (
  SELECT level1, min(custno) AS custno, min(month) AS first_month
  FROM inv
  WHERE month IN (SELECT month FROM months)
  GROUP BY 1
),
names AS (
  SELECT DISTINCT ON (level1) level1, name
  FROM customer
  ORDER BY level1, level
),
r AS (
  SELECT m.month, c.level1, c.custno,
         COALESCE(i.storage, 0) AS storage,
         COALESCE(i.service, 0) AS service,
         COALESCE(i.storage, 0) + COALESCE(i.service, 0) AS revenue
  FROM months m
  JOIN cust c ON m.month >= c.first_month
  LEFT JOIN inv i ON i.month = m.month AND i.level1 = c.level1
),
t AS (
  SELECT r.*,
         avg(revenue) OVER w AS mean6,
         count(*)     OVER w AS prior
  FROM r
  WINDOW w AS (PARTITION BY level1 ORDER BY month ROWS BETWEEN 6 PRECEDING AND 1 PRECEDING)
),
d AS (
  SELECT t.*,
         CASE WHEN prior = 6 THEN round(mean6, 2) END AS trailing6_mean,
         CASE WHEN prior = 6 AND mean6 > 0 THEN round(100 * (revenue - mean6) / mean6, 1) END AS deviation_pct
  FROM t
)
SELECT d.month, d.level1, d.custno, n.name AS customer,
       d.storage, d.service, d.revenue, d.trailing6_mean, d.deviation_pct,
       COALESCE(d.deviation_pct < 0
                AND lag(d.deviation_pct) OVER (PARTITION BY d.level1 ORDER BY d.month) < 0,
                false) AS flag_down_2m
FROM d
LEFT JOIN names n USING (level1);
