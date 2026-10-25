// Applies one SQL file to the database in .env, as one transaction.
//
//   node scripts/apply_sql.js sql/app_schema.sql
'use strict';
require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('usage: node scripts/apply_sql.js <file.sql>'); process.exit(1); }
const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
c.connect()
  .then(() => c.query(`BEGIN;\n${fs.readFileSync(file, 'utf8')}\nCOMMIT;`))
  .then(() => { console.log(`applied ${file}`); return c.end(); })
  .catch(e => { console.error(e.message); process.exit(1); });
