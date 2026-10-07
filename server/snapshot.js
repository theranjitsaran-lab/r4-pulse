// Runs every query against the live database and writes fixtures/<name>.json.
// Run once, then design offline with USE_FIXTURES=1.
'use strict';
require('dotenv').config();
process.env.USE_FIXTURES = '0';
const fs = require('fs');
const path = require('path');
const queries = require('./queries');

(async () => {
  const dir = path.join(__dirname, '..', 'fixtures');
  fs.mkdirSync(dir, { recursive: true });
  let failed = 0;
  for (const [name, fn] of Object.entries(queries)) {
    if (name.startsWith('_')) continue;
    try {
      const data = await fn();
      fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify({ snapshotAt: new Date().toISOString(), data }, null, 1));
      console.log(`fixtures/${name}.json  ok`);
    } catch (e) {
      failed++;
      console.log(`fixtures/${name}.json  SKIPPED — ${e.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
