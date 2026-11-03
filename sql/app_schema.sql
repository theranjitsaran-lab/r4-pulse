-- The one thing R4 Pulse writes: what the team says about a flag and what they did about it.
-- Safe to re-run. Applied on the PC (or by the deploy), never by the app at runtime.
--   kind     'signal' (right / not right on a flag) or 'call' (called / emailed / not this week)
--   verdict  right · not_right · called · emailed · not_this_week
CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.calls_log (
  id         bigserial PRIMARY KEY,
  level1     integer NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('signal', 'call')),
  signal     text NOT NULL,
  verdict    text NOT NULL CHECK (verdict IN ('right', 'not_right', 'called', 'emailed', 'not_this_week')),
  note       text,
  who        text NOT NULL,
  logged_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calls_log_level1 ON app.calls_log (level1, logged_at DESC);

-- What the team says about a "what changed" line: knew (already knew it), wrong (not right), or
-- useful. A knew or wrong line is held back from that person for 30 days. From the app or a tap in
-- the morning email (a signed link, server/feedback.js).
--   subject  what the line is about: 'day', 'month', 'route:MARK', 'account:3507'
CREATE TABLE IF NOT EXISTS app.feedback (
  id         bigserial PRIMARY KEY,
  who        text NOT NULL,
  key        text NOT NULL,
  subject    text NOT NULL,
  verdict    text NOT NULL CHECK (verdict IN ('knew', 'wrong', 'useful')),
  brief_date date,
  note       text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_who ON app.feedback (who, at DESC);

-- A quote built on Pricing (server/sales.js): the customer or prospect, the postcode it was costed
-- in, and its lines as JSON [{ code, name, units, visits, price, cost }]. Totals are recomputed from
-- the lines when read, never stored apart from them.
CREATE TABLE IF NOT EXISTS app.quote (
  id         bigserial PRIMARY KEY,
  who        text NOT NULL,
  level1     integer,
  prospect   text,
  postcode   text,
  lines      jsonb NOT NULL,
  note       text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_at ON app.quote (at DESC);

-- An opportunity's owner and status (Customers › Opportunities, server/sales.js). The opportunity
-- itself (its dollars and reason) is worked out from the data each day; this holds only what the team
-- says about it, one row per change, the latest row being its state.
--   key     kind:level1[:code], e.g. 'cross:3507:bin', 'price:2948:B2', 'slip:12530'
--   status  open · contacted · agreed · won · lost ('quoted' is an older word for agreed, read as agreed)
--   next_step  the date of the next step, if there is one
--   value   the dollars a year when the status was set, so "won this month" is what was won then
CREATE TABLE IF NOT EXISTS app.opportunity (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL,
  level1     integer NOT NULL,
  owner      text,
  status     text NOT NULL CHECK (status IN ('open', 'contacted', 'quoted', 'won', 'lost')),
  value      numeric,
  note       text,
  who        text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_key ON app.opportunity (key, at DESC);
ALTER TABLE app.opportunity ADD COLUMN IF NOT EXISTS next_step date;
ALTER TABLE app.opportunity DROP CONSTRAINT IF EXISTS opportunity_status_check;
ALTER TABLE app.opportunity ADD CONSTRAINT opportunity_status_check CHECK (status IN ('open', 'contacted', 'quoted', 'agreed', 'won', 'lost'));

-- The cost model's assumptions, editable on Settings (server/settings.js): one row per change.
CREATE TABLE IF NOT EXISTS app.setting (
  id bigserial PRIMARY KEY, key text NOT NULL, value numeric NOT NULL, who text NOT NULL,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS setting_key ON app.setting (key, at DESC);

-- Who can sign in beyond AUTH_USERS, and what each has seen (server/users.js). One row per change, the latest winning. Hashes only.
CREATE TABLE IF NOT EXISTS app.app_user (
  id bigserial PRIMARY KEY, login text NOT NULL, hash text NOT NULL, role text NOT NULL, active boolean NOT NULL DEFAULT true, who text NOT NULL,
  at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS app_user_login ON app.app_user (login, at DESC);
CREATE TABLE IF NOT EXISTS app.user_state (
  id bigserial PRIMARY KEY, login text NOT NULL, welcome_seen_version integer NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS user_state_login ON app.user_state (login, at DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'r4_pulse_app') THEN
    GRANT SELECT, INSERT ON app.app_user, app.user_state TO r4_pulse_app;
    GRANT USAGE ON SEQUENCE app.app_user_id_seq, app.user_state_id_seq TO r4_pulse_app;
  END IF;
END $$;
