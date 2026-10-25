// Creates (or refreshes) the database login the deployed app uses, then proves what it can do.
//
//   node scripts/app_role.js
//
// Run on the PC with the admin DATABASE_URL in .env. Safe to re-run: each run sets a new password.
//
//   r4_pulse_app   reads public, kpi and model; writes app.calls_log and nothing else.
//
// The password is never printed. The app's connection string goes into .env.render (gitignored)
// as DATABASE_URL=..., for pasting into Render; delete the file once it is pasted.
// The check at the end runs every screen's query as the new login and prints ok or the error.
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const ROLE = 'r4_pulse_app';
const ENV_FILE = path.join(__dirname, '..', '.env.render');

const GRANTS = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN CREATE ROLE ${ROLE} LOGIN; END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${ROLE}', current_database());
END $$;
ALTER ROLE ${ROLE} LOGIN CONNECTION LIMIT 8;   -- a new role is already no-superuser, no-createdb, no-createrole
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA public, kpi, model, app TO ${ROLE};
GRANT SELECT ON ALL TABLES IN SCHEMA public, kpi, model TO ${ROLE};
-- tables this admin login creates later (the nightly kpi rebuild drops and recreates kpi.*)
ALTER DEFAULT PRIVILEGES IN SCHEMA public, kpi, model GRANT SELECT ON TABLES TO ${ROLE};
GRANT SELECT, INSERT ON app.calls_log TO ${ROLE};
GRANT USAGE ON SEQUENCE app.calls_log_id_seq TO ${ROLE};
`;

function connOpts(url) {
  return { connectionString: url.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } };
}

function writeEnv(key, value) {
  const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(l => l && !l.startsWith(key + '=')) : [];
  lines.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
}

(async () => {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('DATABASE_URL (the admin login) is not set in .env');

  // 1. the role, its grants and a fresh password
  const admin = new Client(connOpts(adminUrl));
  await admin.connect();
  const [{ exists }] = (await admin.query(`SELECT to_regclass('app.calls_log') IS NOT NULL AS exists`)).rows;
  if (!exists) throw new Error('app.calls_log does not exist yet: apply sql/app_schema.sql first');
  await admin.query(GRANTS);
  const password = crypto.randomBytes(24).toString('base64url');
  await admin.query(`ALTER ROLE ${ROLE} PASSWORD '${password}'`);   // base64url: no quotes to escape
  console.log(`role ${ROLE}: created or refreshed, grants applied, new password set`);

  // tables owned by another login are not covered by the default privileges above: if that login
  // recreates them (the daily push), the grant is lost until this script runs again
  const owners = (await admin.query(`
    SELECT schemaname, tableowner, count(*)::int AS n FROM pg_tables
    WHERE schemaname IN ('public', 'kpi', 'model') AND tableowner <> current_user
    GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
  const me = (await admin.query('SELECT current_user AS u')).rows[0].u;
  if (owners.length) {
    console.log(`tables owned by a login other than ${me} (grants on these can be lost if that login recreates them):`);
    for (const o of owners) console.log(`  ${o.schemaname}: ${o.n} owned by ${o.tableowner}`);
  } else console.log(`every table in public, kpi and model is owned by ${me}: default privileges cover recreated tables`);
  await admin.end();

  // 2. the app's connection string, written for Render, never printed
  const u = new URL(adminUrl);
  u.username = ROLE; u.password = password;
  writeEnv('DATABASE_URL', u.toString());
  console.log(`.env.render: DATABASE_URL for ${ROLE} written (paste into Render, then delete the file)`);

  // 3. the check: everything the app does, as the app
  process.env.DATABASE_URL = u.toString();
  process.env.USE_FIXTURES = '0';
  const queries = require('../server/queries');
  const rates = require('../model/rates');
  const { query } = require('../server/db');
  const step = async (label, fn) => {
    try { const r = await fn(); console.log(`  ok   ${label}${r ? '  ' + r : ''}`); }
    catch (e) { console.log(`  FAIL ${label}  ${e.message}`); }
  };
  console.log(`check, connected as ${ROLE}:`);
  await step('cost model (model.*)', async () => { await rates.loadFromDb(query); return `route day $${rates.RATES.routeDay.v.toFixed(2)}`; });
  for (const s of ['pulse', 'activity', 'pricing', 'calls', 'margin', 'customers']) {
    await step(`screen ${s}`, async () => { const d = await queries[s](); return `${JSON.stringify(d).length.toLocaleString('en-US')} bytes`; });
  }
  await step('customer drill (Citadel)', async () => { const d = await queries.customerDrill(6714); return `${d.orders.length} orders, ${d.visits.length} visits`; });

  const c = new Client(connOpts(u.toString()));
  await c.connect();
  await step('calls log: insert (rolled back)', async () => {
    await c.query('BEGIN');
    await c.query(`INSERT INTO app.calls_log (level1, kind, signal, verdict, who) VALUES (0, 'signal', 'role-check', 'right', 'app_role.js')`);
    await c.query('ROLLBACK');
  });
  const refused = async (label, sql) => step(`refused: ${label}`, async () => {
    try { await c.query(sql); } catch (e) { if (/permission denied|must be owner/.test(e.message)) return 'permission denied, as intended'; throw e; }
    throw new Error('this was allowed and should not be');
  });
  await refused('delete from the calls log', 'DELETE FROM app.calls_log WHERE false');
  await refused('write to kpi', 'DELETE FROM kpi.monthly WHERE false');
  await refused('create in kpi', 'CREATE TABLE kpi.role_check (x int)');
  await c.end();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
