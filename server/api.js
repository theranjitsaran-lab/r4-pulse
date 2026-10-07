// One JSON endpoint per screen. With USE_FIXTURES=1 it serves fixtures/<name>.json;
// otherwise it runs the named query through the 15-minute cache.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');

const router = express.Router();
const SCREENS = ['pulse', 'activity', 'pricing', 'calls', 'margin'];

for (const name of SCREENS) {
  router.get(`/${name}`, async (req, res) => {
    try {
      if (USE_FIXTURES) {
        const f = path.join(__dirname, '..', 'fixtures', `${name}.json`);
        if (!fs.existsSync(f)) return res.status(404).json({ error: `fixtures/${name}.json not found — run npm run snapshot` });
        return res.type('json').send(fs.readFileSync(f, 'utf8'));
      }
      const data = await cached(name, queries[name]);
      res.json({ snapshotAt: new Date().toISOString(), data });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}

router.get('/me', (req, res) => res.json(req.session.user));

module.exports = router;
