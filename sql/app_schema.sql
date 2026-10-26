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
