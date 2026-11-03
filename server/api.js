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
const SCREENS = ['pulse', 'activity', 'pricing', 'calls', 'margin', 'customers', 'storage', 'segments'];

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

// Every job of one account over the margin's twelve months, with the volumes behind its margin, and, for
// whoever sees costs, its share of each route day (server/routecost.js). Offline, the 50 largest accounts.
router.get('/customer/:id/jobs', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'account id must be a number' });
  try {
    const { seesCosts } = require('./settings');
    const D = await require('./screendata').data();
    let orders;
    if (USE_FIXTURES) {
      const f = path.join(__dirname, '..', 'fixtures', 'jobs.json');
      const fx = fs.existsSync(f) ? readFixture(f) : null;
      if (fx && !fx.json) fx.json = JSON.parse(fx.text);
      const a = fx && fx.json.data.accounts.find(x => x.level1 === id);
      if (!a) return res.status(404).json({ error: 'Jobs are kept offline for the 50 largest accounts only; the live app has them for every account.' });
      orders = a.orders;
    } else orders = await cached('jobs:' + id, () => queries.customerJobs(id));
    const costs = seesCosts(req), rc = D.RC || {}, acct = D.M.accounts.find(a => a.level1 === id) || { level1: id, storage_revenue: 0, service_revenue: 0, boxes: 0, bins: 0, visits: 0 };
    const services = {}; for (const r of (D.PR && D.PR.rates) || []) if (!services[r.servcode]) services[r.servcode] = String(r.service).trim();
    for (const [t, c] of [['01B', '01'], ['S5B', 'S5'], ['S5P', 'S5'], ['S5T', 'S5']]) if (services[c]) services[t] = services[c];
    res.json({ level1: id, acct, orders, services, lines: D.M.lines.filter(l => l.level1 === id),
      daily: costs && rc.daily ? rc.daily[id] || {} : null, moveDaily: costs && rc.moveDaily ? rc.moveDaily[id] || {} : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// One date's route days as they were costed, deliveries placed: for a job's map. Costs only.
router.get('/customer/:id/routeday/:date', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const { seesCosts } = require('./settings');
    if (!seesCosts(req)) return res.status(403).json({ error: 'Route days are shown with the costs.' });
    const D = await require('./screendata').data();
    const names = new Map(D.M.accounts.map(a => [a.level1, a.customer]));
    const days = ((D.RC && D.RC.dayList) || []).filter(d => d.date === req.params.date && d.stops.some(s => s.level1 === id));
    res.json({ routes: days.map(d => ({ date: d.date, route: d.route, stops: d.stops.map(({ stop, seq, level1, postcode, services, pounds, delivery }) => ({ stop, seq, level1, postcode, services, pounds, delivery: !!delivery, company: names.get(level1) || null })) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', async (req, res) => {
  const S = require('./settings');
  await S.ensure().catch(() => {});
  const Users = require('./users'), { pm, ...me } = req.session.user;
  res.json({ ...me, costs: S.seesCosts(req), owners: Users.owners(), welcome: await Users.seen(me.name).catch(() => 0) });
});
router.post('/me/welcome', async (req, res) => {
  const v = Number((req.body || {}).version);
  if (!Number.isInteger(v) || v < 0) return res.status(400).json({ error: 'a version is required' });
  try { await require('./users').setSeen(req.session.user.name, v); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: 'That did not save.' }); }
});

module.exports = router;
