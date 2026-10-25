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
