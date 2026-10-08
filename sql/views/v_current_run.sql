-- The billing run not yet posted: everything in invoices_current (data rule 7).
-- part 'run'     rows with no invdate: the live run the in-month projection reads.
-- part 'pending' rows printed with an invdate but not yet in invoices; they join the posted
--                series when they post.
-- Neither part is in v_monthly_storage_service.
-- Dates are the work-order dates of the run's lines (priced_lines_current, by invoice_no),
-- since the run itself carries no invoice date.
DROP VIEW IF EXISTS v_current_run CASCADE;
CREATE VIEW v_current_run AS
WITH w AS (
  SELECT invoice_no, min(wodate)::date AS first_wo, max(wodate)::date AS last_wo
  FROM priced_lines_current
  GROUP BY 1
)
SELECT CASE WHEN c.invdate IS NULL THEN 'run' ELSE 'pending' END AS part,
       sum(c.ret_tot) AS storage,
       sum(c.ser_tot) AS service,
       COALESCE(sum(c.ser_tot) FILTER (WHERE c.custno = '00870'), 0) AS citadel,
       count(*) AS invoices,
       min(w.first_wo) AS earliest_work_date,
       max(w.last_wo) AS latest_work_date,
       min(c.invdate)::date AS earliest_invdate,
       max(c.invdate)::date AS latest_invdate
FROM invoices_current c
LEFT JOIN w USING (invoice_no)
GROUP BY 1;
