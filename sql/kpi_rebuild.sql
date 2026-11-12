-- Rebuilds the kpi schema the screens read. Run by `npm run kpi:rebuild`, nightly after the push.
-- The runner (server/kpi_rebuild.js) creates sql/views/*.sql first, in dependency order, and
-- sends everything as one transaction: either the whole rebuild lands or none of it does.

CREATE SCHEMA IF NOT EXISTS kpi;

-- One row per month: storage, service, Citadel, core and the Iron Mountain set.
DROP TABLE IF EXISTS kpi.monthly;
CREATE TABLE kpi.monthly AS
SELECT * FROM v_kpi_industry;
ALTER TABLE kpi.monthly ADD PRIMARY KEY (month);

-- One row per customer per month against its own trailing-six mean. "One finding a week".
DROP TABLE IF EXISTS kpi.customer_monthly;
CREATE TABLE kpi.customer_monthly AS
SELECT * FROM v_customer_monthly;
ALTER TABLE kpi.customer_monthly ADD PRIMARY KEY (level1, month);
CREATE INDEX ON kpi.customer_monthly (month) WHERE flag_down_2m;

-- Pulse refills these two tables' rows itself when new data arrives (server/kpi_refresh.js, 12 November 2026),
-- so the app login may insert and delete rows in them and nothing else. Granted here because the DROP and
-- CREATE above remove any earlier grant; scripts/app_role.js grants the same.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'r4_pulse_app') THEN
    GRANT SELECT, INSERT, DELETE ON kpi.monthly, kpi.customer_monthly TO r4_pulse_app;
  END IF;
END $$;

COMMENT ON TABLE kpi.monthly IS 'Rebuilt by sql/kpi_rebuild.sql from v_kpi_industry';
COMMENT ON TABLE kpi.customer_monthly IS 'Rebuilt by sql/kpi_rebuild.sql from v_customer_monthly';
