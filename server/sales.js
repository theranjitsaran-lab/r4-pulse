// What the sales team writes: quotes built on Pricing, and the owner and status of an opportunity.
// Live it is app.quote and app.opportunity (sql/app_schema.sql); with USE_FIXTURES=1 local files,
// data/quotes.json and data/opportunities.json.
//   GET  /api/sales/quotes                 the last 90 days of quotes
//   POST /api/sales/quotes                 { level1?, prospect?, postcode?, lines: [{ code, name, units, visits, price, cost }], note? }
//   GET  /api/sales/opportunities          every opportunity's latest state, by key
//   POST /api/sales/opportunities          { key, level1, status, owner?, value?, note? }
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');

const DIR = path.join(__dirname, '..', 'data');
const read = f => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return []; } };
const write = (f, rows) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, f), JSON.stringify(rows, null, 1)); };
const STATUSES = ['open', 'contacted', 'quoted', 'won', 'lost'];
const num = v => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

function cleanQuote(b, who) {
  const lines = (Array.isArray(b.lines) ? b.lines : []).slice(0, 30).map(l => ({
    code: String(l.code || '').slice(0, 12), name: String(l.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    units: num(l.units), visits: num(l.visits), price: num(l.price), cost: num(l.cost),
  })).filter(l => l.code && l.units > 0 && l.price != null);
  if (!lines.length) return null;
  return { who, level1: num(b.level1), prospect: b.prospect ? String(b.prospect).slice(0, 80) : null,
    postcode: /^\d{5}$/.test(b.postcode || '') ? b.postcode : null, lines, note: b.note ? String(b.note).slice(0, 500) : null };
}
function cleanOpp(b, who) {
  if (!b.key || !STATUSES.includes(b.status) || num(b.level1) == null) return null;
  return { key: String(b.key).slice(0, 60), level1: num(b.level1), status: b.status, owner: b.owner ? String(b.owner).slice(0, 40) : null,
    value: num(b.value), note: b.note ? String(b.note).slice(0, 500) : null, who };
}

async function quotes(days = 90) {
  if (USE_FIXTURES) { const from = Date.now() - days * 864e5; return read('quotes.json').filter(r => Date.parse(r.at) > from).reverse(); }
  return query(`SELECT id, who, level1, prospect, postcode, lines, note, at::text FROM app.quote WHERE at > now() - ($1 || ' days')::interval ORDER BY at DESC`, [String(days)]).catch(() => []);
}
async function saveQuote(q) {
  if (USE_FIXTURES) { const rows = read('quotes.json'); const row = { id: rows.length + 1, ...q, at: new Date().toISOString() }; rows.push(row); write('quotes.json', rows); return row; }
  const [row] = await query(`INSERT INTO app.quote (who, level1, prospect, postcode, lines, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, at::text`,
    [q.who, q.level1, q.prospect, q.postcode, JSON.stringify(q.lines), q.note]);
  return { ...q, ...row };
}
// each key's latest row, with when it was first opened and when it was won or lost
async function opportunities() {
  const rows = USE_FIXTURES ? read('opportunities.json')
    : await query(`SELECT key, level1, owner, status, value::float, note, who, at::text FROM app.opportunity ORDER BY at`).catch(() => []);   // before sql/app_schema.sql is applied: nothing said yet
  const by = {};
  for (const r of rows) by[r.key] = { ...(by[r.key] || {}), ...r, first: (by[r.key] || {}).first || r.at };
  return by;
}
async function saveOpp(o) {
  if (USE_FIXTURES) { const rows = read('opportunities.json'); const row = { ...o, at: new Date().toISOString() }; rows.push(row); write('opportunities.json', rows); return row; }
  const [row] = await query(`INSERT INTO app.opportunity (key, level1, owner, status, value, note, who) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING at::text`,
    [o.key, o.level1, o.owner, o.status, o.value, o.note, o.who]);
  return { ...o, ...row };
}

const who = req => (req.session && req.session.user && req.session.user.name) || 'unknown';
const api = express.Router();
const wrap = fn => async (req, res) => { try { res.json({ data: await fn(req) }); } catch (e) { res.status(500).json({ error: e.message }); } };
api.get('/quotes', wrap(() => quotes()));
api.post('/quotes', async (req, res) => {
  const q = cleanQuote(req.body || {}, who(req));
  if (!q) return res.status(400).json({ error: 'a quote needs at least one line with a code, units and a price' });
  try { res.json({ data: await saveQuote(q) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
api.get('/opportunities', wrap(() => opportunities()));
api.post('/opportunities', async (req, res) => {
  const o = cleanOpp(req.body || {}, who(req));
  if (!o) return res.status(400).json({ error: `key, level1 and a status (${STATUSES.join(', ')}) are required` });
  try { res.json({ data: await saveOpp(o) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = { api, quotes, opportunities, STATUSES };
