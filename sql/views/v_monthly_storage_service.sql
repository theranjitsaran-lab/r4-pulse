-- Storage, service, Citadel and core by invoice month. Posted invoices only.
-- Month is COALESCE(invdate, billdate) (data rule 1). Storage is ret_tot, service is ser_tot;
-- service is all service, Citadel included. Citadel is ser_tot for custno '00870' and can be
-- negative (November 2025 credit run): carried as it is, never clipped.
-- Months before the first billing run are fragments (36 invoices dated October 2024, billed
-- 1 November) and are left out. Up to 36 months; 23 exist on 8 October 2026.
-- The live run in invoices_current is not here: see v_current_run (data rule 7).
DROP VIEW IF EXISTS v_monthly_storage_service CASCADE;
CREATE VIEW v_monthly_storage_service AS
WITH m AS (
  SELECT date_trunc('month', COALESCE(invdate, billdate))::date AS month,
         sum(ret_tot) AS storage,
         sum(ser_tot) AS service,
         COALESCE(sum(ser_tot) FILTER (WHERE custno = '00870'), 0) AS citadel
  FROM invoices
  GROUP BY 1
)
SELECT month, storage, service, citadel, storage + service - citadel AS core
FROM m
WHERE month >= (SELECT date_trunc('month', min(billdate))::date FROM invoices)
  AND month >  (SELECT max(month) FROM m) - interval '36 months'
ORDER BY month;
