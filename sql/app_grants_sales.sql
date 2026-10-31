-- Grants for the sales tables (31 October 2026), for a database where r4_pulse_app already exists.
-- Same lines as scripts/app_role.js, without resetting the role's password. Safe to re-run.
GRANT SELECT, INSERT ON app.quote TO r4_pulse_app;
GRANT USAGE ON SEQUENCE app.quote_id_seq TO r4_pulse_app;
GRANT SELECT, INSERT ON app.opportunity TO r4_pulse_app;
GRANT USAGE ON SEQUENCE app.opportunity_id_seq TO r4_pulse_app;
GRANT SELECT ON model.gl_month TO r4_pulse_app;
