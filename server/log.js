// The calls log: the team's verdicts on flags and what they did about them. In the live app it is
// app.calls_log (sql/app_schema.sql); with USE_FIXTURES=1 it is a local file, data/calls_log.json,
// so the screens can be tried offline. GET /api/log?level1=…  ·  POST /api/log
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');

const FILE = path.join(__dirname, '..', 'data', 'calls_log.json');
const KINDS = ['signal', 'call'];
const VERDICTS = ['right', 'not_right', 'called', 'emailed', 'not_this_week'];

const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
function writeFile(rows) { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rows, null, 1)); }

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const level1 = req.query.level1 ? Number(req.query.level1) : null;
    if (USE_FIXTURES) {
      const rows = readFile().filter(r => level1 == null || r.level1 === level1);
      return res.json({ data: rows.slice(-200).reverse() });
    }
    const rows = await query(`SELECT id, level1, kind, signal, verdict, note, who, logged_at::text
      FROM app.calls_log WHERE ($1::int IS NULL OR level1 = $1) ORDER BY logged_at DESC, id DESC LIMIT 200`, [level1]);
    res.json({ data: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const level1 = Number(b.level1), note = b.note ? String(b.note).slice(0, 500) : null;
  if (!Number.isInteger(level1) || !KINDS.includes(b.kind) || !VERDICTS.includes(b.verdict) || !b.signal) {
    return res.status(400).json({ error: 'level1, kind, signal and verdict are required' });
  }
  const who = (req.session.user && req.session.user.name) || 'unknown';
  const row = { level1, kind: b.kind, signal: String(b.signal).slice(0, 80), verdict: b.verdict, note, who, logged_at: new Date().toISOString() };
  try {
    if (USE_FIXTURES) { const rows = readFile(); rows.push({ id: rows.length + 1, ...row }); writeFile(rows); return res.json({ data: row }); }
    const [saved] = await query(`INSERT INTO app.calls_log (level1, kind, signal, verdict, note, who)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, logged_at::text`, [row.level1, row.kind, row.signal, row.verdict, row.note, row.who]);
    res.json({ data: { ...row, ...saved } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
