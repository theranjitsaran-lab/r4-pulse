-- One-off setup, 1 November 2026: every table R4 Pulse writes to, and the app login's right to use
-- them. Run once on the PC with the admin login:  node scripts/apply_sql.js sql/setup_2026_11.sql
-- Safe to re-run. Render's own login (r4_pulse_app) can read and add rows but never create tables,
-- by design (scripts/app_role.js), which is why this one step is done here.
CREATE SCHEMA IF NOT EXISTS app;

-- quotes built on Pricing (server/sales.js)
CREATE TABLE IF NOT EXISTS app.quote (
  id bigserial PRIMARY KEY, who text NOT NULL, level1 integer, prospect text, postcode text,
  lines jsonb NOT NULL, note text, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS quote_at ON app.quote (at DESC);

-- an opportunity's owner and status, one row per change (server/sales.js)
CREATE TABLE IF NOT EXISTS app.opportunity (
  id bigserial PRIMARY KEY, key text NOT NULL, level1 integer NOT NULL, owner text,
  status text NOT NULL CHECK (status IN ('open', 'contacted', 'quoted', 'won', 'lost')),
  value numeric, note text, who text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS opportunity_key ON app.opportunity (key, at DESC);

-- the cost model's assumptions, one row per change, the latest winning (server/settings.js)
CREATE TABLE IF NOT EXISTS app.setting (
  id bigserial PRIMARY KEY, key text NOT NULL, value numeric NOT NULL, who text NOT NULL,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS setting_key ON app.setting (key, at DESC);

-- the P&L by month, for later (scripts/load_gl.js); stays empty until QuickBooks is used
CREATE SCHEMA IF NOT EXISTS model;
CREATE TABLE IF NOT EXISTS model.gl_month (
  month date NOT NULL, account text NOT NULL, name text NOT NULL, parent text,
  line text NOT NULL CHECK (line IN ('revenue', 'cost_to_serve', 'sales', 'management', 'overhead', 'discretionary', 'below')),
  amount numeric(14,2) NOT NULL, source text, loaded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS gl_month_month ON model.gl_month (month);

GRANT USAGE ON SCHEMA app TO r4_pulse_app;
GRANT SELECT, INSERT ON app.quote, app.opportunity, app.setting TO r4_pulse_app;
GRANT USAGE ON SEQUENCE app.quote_id_seq, app.opportunity_id_seq, app.setting_id_seq TO r4_pulse_app;
GRANT SELECT ON model.gl_month TO r4_pulse_app;
