// Runs sql/kpi_rebuild.sql against the live database. Nightly, after the push.
'use strict';
require('dotenv').config();
process.env.USE_FIXTURES = '0';
const fs = require('fs');
const path = require('path');
const { query } = require('./db');

// Views first, each after the views it reads. Then the kpi tables built from them.
const VIEWS = [
  'v_monthly_storage_service',
  'v_current_run',
  'v_customer_monthly',
  'v_rate_by_customer_service',
  'v_route_day',
  'v_kpi_industry',
];

(async () => {
  const sql = path.join(__dirname, '..', 'sql');
  const files = [...VIEWS.map(v => path.join(sql, 'views', `${v}.sql`)), path.join(sql, 'kpi_rebuild.sql')];
  // One multi-statement query runs as a single transaction: all of it lands or none does.
  await query(files.map(f => fs.readFileSync(f, 'utf8')).join('\n'));
  const [m] = await query('SELECT count(*)::int AS n FROM kpi.monthly');
  const [c] = await query('SELECT count(*)::int AS n FROM kpi.customer_monthly');
  console.log(`kpi schema rebuilt: ${VIEWS.length} views, kpi.monthly ${m.n} rows, kpi.customer_monthly ${c.n} rows`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
