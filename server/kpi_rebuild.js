// Runs sql/kpi_rebuild.sql against the live database. Nightly, after the push.
'use strict';
require('dotenv').config();
process.env.USE_FIXTURES = '0';
const fs = require('fs');
const path = require('path');
const { query } = require('./db');

(async () => {
  const file = path.join(__dirname, '..', 'sql', 'kpi_rebuild.sql');
  if (!fs.existsSync(file)) { console.log('sql/kpi_rebuild.sql does not exist yet (Prompt 3)'); process.exit(1); }
  await query(fs.readFileSync(file, 'utf8'));
  console.log('kpi schema rebuilt');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
