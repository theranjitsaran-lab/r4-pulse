// Refills the two summary tables the screens read (kpi.monthly, kpi.customer_monthly) from their views,
// whenever new data arrives (server/index.js, watch). Rows only: the views themselves are created by
// `npm run kpi:rebuild` with the admin login, which is needed again only when sql/views/*.sql changes.
// The app login may insert and delete rows in these two tables and nothing else (sql/kpi_rebuild.sql,
// scripts/app_role.js). Decided 12 November 2026 (Theran): the R4 machine's rebuild task was never installed.
'use strict';
const { connect } = require('./db');

const LOCK = 4041207;   // any constant: one refresh at a time across instances (a Render deploy overlaps old and new)
const TABLES = [['kpi.monthly', 'v_kpi_industry'], ['kpi.customer_monthly', 'v_customer_monthly']];

// DELETE, not TRUNCATE: a screen reading meanwhile sees the old rows until the commit and never waits.
// One transaction: all of it lands or none of it does, and a failure keeps the old rows.
async function refreshKpi({ connectFn = connect, log = console } = {}) {
  const t = Date.now();
  const c = await connectFn();
  try {
    await c.query('BEGIN');
    const { rows: [{ ok }] } = await c.query('SELECT pg_try_advisory_xact_lock($1) AS ok', [LOCK]);
    if (!ok) { await c.query('ROLLBACK'); log.log('kpi refresh: another instance is refreshing, skipped'); return { skipped: true }; }
    const counts = {};
    for (const [table, view] of TABLES) {
      await c.query(`DELETE FROM ${table}`);
      const r = await c.query(`INSERT INTO ${table} SELECT * FROM ${view}`);
      counts[table] = r.rowCount;
    }
    await c.query('COMMIT');
    log.log(`kpi refreshed: monthly ${counts['kpi.monthly']} rows, customer_monthly ${counts['kpi.customer_monthly']} rows in ${((Date.now() - t) / 1000).toFixed(1)}s`);
    return { counts };
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* the connection is gone; the transaction went with it */ }
    log.warn(`kpi refresh failed, the old rows stay: ${e.message}`);
    return { error: e.message };
  } finally {
    c.release();
  }
}

module.exports = { refreshKpi, TABLES, LOCK };
