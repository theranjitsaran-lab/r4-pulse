// The cost model's assumptions, editable on the Settings screen (#settings): speed between stops,
// minutes a stop and a service, the travel share where there are no route days, and how box
// deliveries are treated. Live it is app.setting (sql/setup_2026_11.sql), one row per change, the
// latest winning; with USE_FIXTURES=1 a local file, data/settings.json. Each change is applied to
// model/rates.js SETTINGS at once, so the route costs, every screen and Ask move together.
//   GET  /api/settings          the values, their defaults, bounds and notes, who changed what, and two
//                               reference figures at the current values
//   POST /api/settings          { key, value } (admin users only)
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');
const R = require('../model/rates');

const FILE = path.join(__dirname, '..', 'data', 'settings.json');
const DEFAULTS = { ...R.SETTINGS };
let ready = false, saveable = true;

async function rows() {
  if (USE_FIXTURES) { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
  try { return await query(`SELECT key, value::float, who, at::text FROM app.setting ORDER BY at`); }
  catch { saveable = false; return []; }   // before the setup SQL: the defaults, nothing saved yet
}
// the latest value of each key into SETTINGS; returns the history, newest first
async function load() {
  const rs = await rows();
  const latest = {};
  for (const r of rs) if (r.key in DEFAULTS) latest[r.key] = r;
  for (const k of Object.keys(DEFAULTS)) R.SETTINGS[k] = latest[k] ? Number(latest[k].value) : DEFAULTS[k];
  ready = true;
  return { latest, history: rs.slice().reverse().slice(0, 30) };
}
const ensure = () => ready ? Promise.resolve() : load();

function clean(b) {
  const key = String(b.key || ''), B = R.SETTING_BOUNDS[key], v = Number(b.value);
  if (!B || !Number.isFinite(v)) return null;
  if (key === 'deliveryMatch') return { key, value: v ? 1 : 0 };
  return { key, value: Math.min(B[1], Math.max(B[0], v)) };
}
async function save(row) {
  if (USE_FIXTURES) {
    let rs = []; try { rs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
    rs.push({ ...row, at: new Date().toISOString() });
    fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rs, null, 1));
    return;
  }
  await query(`INSERT INTO app.setting (key, value, who) VALUES ($1, $2, $3)`, [row.key, row.value, row.who]);
}

const api = express.Router();
api.get('/', async (req, res) => {
  try {
    const { latest, history } = await load();
    const { data } = require('./screendata');
    const D = await data();
    const rc = D.RC || { accounts: {} };
    const ing = rc.accounts[12530];
    const book = Object.values(rc.accounts).reduce((t, a) => ({ cost: t.cost + a.cost, services: t.services + a.services }), { cost: 0, services: 0 });
    res.json({ data: {
      values: { ...R.SETTINGS }, defaults: DEFAULTS, bounds: R.SETTING_BOUNDS, notes: R.TIME_NOTES, latest, history,
      canEdit: !!(req.session.user && req.session.user.role === 'admin'), saveable,
      reference: {
        routeDay: R.RATES.routeDay.v, days: rc.days, from: rc.from, to: rc.to, avgRoundHours: rc.avgRoundHours,
        ingalls: ing ? { perService: ing.cost / ing.services, days: ing.days } : null,
        book: book.services ? { perService: book.cost / book.services, services: book.services } : null,
        deliveries: rc.deliveries || null,
      },
      rates: Object.entries(R.RATES).map(([k, r]) => ({ key: k, value: r.v, unit: r.u, flag: r.c || null, derivation: r.d || null })),
    } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
api.post('/', async (req, res) => {
  if (!(req.session.user && req.session.user.role === 'admin')) return res.status(403).json({ error: 'Only an admin can change the assumptions.' });
  const row = clean(req.body || {});
  if (!row) return res.status(400).json({ error: 'a known key and a number are required' });
  try {
    await save({ ...row, who: req.session.user.name });
    await load();
    res.json({ data: { ...R.SETTINGS } });
  } catch (e) { res.status(500).json({ error: saveable ? e.message : 'Changes cannot be saved until the setup SQL has been applied on the PC.' }); }
});

module.exports = { api, load, ensure };
