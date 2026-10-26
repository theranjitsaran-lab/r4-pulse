// The team's word on a "what changed" line: knew · wrong · useful. Live it is app.feedback
// (sql/app_schema.sql); with USE_FIXTURES=1 a local file, data/feedback.json.
//   GET  /api/feedback            the last 30 days, for holding lines back
//   POST /api/feedback            { key, subject, verdict, brief_date?, note? } from the app, signed in
//   GET  /f/<token>               a tap in the morning email: the token is signed with SESSION_SECRET
//                                 and carries who, key, subject, verdict and the brief's date, so it
//                                 needs no sign-in and cannot be forged or edited
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');

const FILE = path.join(__dirname, '..', 'data', 'feedback.json');
const VERDICTS = ['knew', 'wrong', 'useful'];
const readFile = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } };
const writeFile = rows => { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rows, null, 1)); };

async function save(row) {
  if (USE_FIXTURES) { const rows = readFile(); rows.push({ id: rows.length + 1, ...row, at: new Date().toISOString() }); writeFile(rows); return; }
  await query(`INSERT INTO app.feedback (who, key, subject, verdict, brief_date, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.who, row.key, row.subject, row.verdict, row.brief_date || null, row.note || null]);
}
async function recent(days = 30) {
  if (USE_FIXTURES) { const from = Date.now() - days * 864e5; return readFile().filter(r => Date.parse(r.at) > from); }
  return query(`SELECT who, key, subject, verdict, brief_date::text, note, at::text FROM app.feedback WHERE at > now() - ($1 || ' days')::interval ORDER BY at DESC`, [String(days)]);
}

// signed tokens for the email taps: base64url(json).base64url(hmac)
const secret = () => process.env.SESSION_SECRET || 'local-only-secret';
const b64 = s => Buffer.from(s).toString('base64url');
function sign(payload) { const body = b64(JSON.stringify(payload)); return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url'); }
function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
const clean = (b, who) => VERDICTS.includes(b.verdict) && b.key && b.subject
  ? { who, key: String(b.key).slice(0, 40), subject: String(b.subject).slice(0, 80), verdict: b.verdict, brief_date: /^\d{4}-\d{2}-\d{2}$/.test(b.brief_date || '') ? b.brief_date : null, note: b.note ? String(b.note).slice(0, 500) : null }
  : null;

const api = express.Router();
api.get('/', async (req, res) => { try { res.json({ data: await recent() }); } catch (e) { res.status(500).json({ error: e.message }); } });
api.post('/', async (req, res) => {
  const row = clean(req.body || {}, (req.session.user && req.session.user.name) || 'unknown');
  if (!row) return res.status(400).json({ error: 'key, subject and verdict (knew, wrong or useful) are required' });
  try { await save(row); res.json({ data: row }); } catch (e) { res.status(500).json({ error: e.message }); }
});

const PAGE = msg => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>R4 Pulse</title><link rel="stylesheet" href="/tokens.css"><style>body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-sans)}main{max-width:480px;margin:15vh auto;padding:24px;background:var(--surface);border-radius:var(--r-lg)}a{color:var(--brand)}</style></head><body><main><p>${msg}</p><p><a href="/">Open R4 Pulse</a></p></main></body></html>`;
const tap = express.Router();
tap.get('/:token', async (req, res) => {
  const p = verify(req.params.token), row = p && clean(p, String(p.who || '').slice(0, 40));
  if (!row || !row.who) return res.status(400).send(PAGE('That link is not valid.'));
  try { await save(row); res.send(PAGE(row.verdict === 'useful' ? 'Thanks: noted as useful.' : row.verdict === 'knew' ? 'Thanks. Lines like that will be left out of your morning email for 30 days.' : 'Thanks. That line is marked not right and will be looked at; it is left out for 30 days.')); }
  catch (e) { res.status(500).send(PAGE('Could not save that just now.')); }
});

module.exports = { api, tap, sign, verify, recent };
