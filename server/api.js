// One JSON endpoint per screen. With USE_FIXTURES=1 it serves fixtures/<name>.json;
// otherwise it runs the named query through the 15-minute cache.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');

const router = express.Router();
const SCREENS = ['pulse', 'activity', 'pricing', 'calls', 'margin', 'customers'];

// The screens' JSON runs to a megabyte or more; gzipped it is a tenth of that, which is the
// difference on a phone. Compressed once per body and kept, so a cached screen costs nothing more.
const gzCache = new Map();
function sendJson(req, res, body, key) {
  res.type('json').set('Vary', 'Accept-Encoding');
  if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '') || body.length < 2048) return res.send(body);
  let hit = key && gzCache.get(key);
  if (!hit || hit.body !== body) { hit = { body, gz: zlib.gzipSync(body) }; if (key) gzCache.set(key, hit); }
  res.set('Content-Encoding', 'gzip').send(hit.gz);
}
// fixtures are read once and re-read only when the file changes (a new snapshot)
const fileCache = new Map();
function readFixture(f) {
  const m = fs.statSync(f).mtimeMs, hit = fileCache.get(f);
  if (hit && hit.m === m) return hit;
  const text = fs.readFileSync(f, 'utf8');
  const v = { m, text, json: null };
  fileCache.set(f, v);
  return v;
}

for (const name of SCREENS) {
  router.get(`/${name}`, async (req, res) => {
    try {
      if (USE_FIXTURES) {
        const f = path.join(__dirname, '..', 'fixtures', `${name}.json`);
        if (!fs.existsSync(f)) return res.status(404).json({ error: `fixtures/${name}.json not found — run npm run snapshot` });
        return sendJson(req, res, readFixture(f).text, 'fx:' + name);
      }
      const data = await cached(name, queries[name]);
      sendJson(req, res, JSON.stringify({ snapshotAt: new Date().toISOString(), data }), 'live:' + name);
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
      const fx = fs.existsSync(f) ? readFixture(f) : null;
      if (fx && !fx.json) fx.json = JSON.parse(fx.text);
      const j = fx && fx.json;
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
