// One JSON endpoint per screen. With USE_FIXTURES=1 it serves fixtures/<name>.json;
// otherwise it runs the named query through the 15-minute cache.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');

const router = express.Router();
const SCREENS = ['pulse', 'activity', 'pricing', 'calls', 'margin', 'customers'];

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

// The drill below one customer: live for any account; from fixtures/drill.json for the 50 largest.
router.get('/customer/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'account id must be a number' });
  try {
    if (USE_FIXTURES) {
      const f = path.join(__dirname, '..', 'fixtures', 'drill.json');
      const j = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
      const a = j && j.data.accounts.find(x => x.level1 === id);
      if (!a) return res.status(404).json({ error: 'Work orders and visits are kept offline for the 50 largest accounts only; the live app has them for every account.' });
      return res.json({ snapshotAt: j.snapshotAt, data: a });
    }
    const data = await cached('customer:' + id, () => queries.customerDrill(id));
    res.json({ snapshotAt: new Date().toISOString(), data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', (req, res) => res.json(req.session.user));

module.exports = router;
