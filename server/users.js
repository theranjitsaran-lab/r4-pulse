// Who can sign in, and what each has seen. The logins in AUTH_USERS are the starting list, so the first admin can always get in; what
// an admin changes on Settings is kept in app.app_user, one row per change, the latest winning, and overrides them. With USE_FIXTURES=1
// it is a local file, data/users.json. Only bcrypt hashes are stored, and no route ever sends one back.
//   GET  /api/users                 the list (admin)
//   POST /api/users                 { name, role, password } a new user (admin)
//   POST /api/users/:name           { role?, active?, password? } (admin)
//   POST /api/users/:name/welcome   the welcome shows again at that person's next sign-in (admin)
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { query, USE_FIXTURES } = require('./db');

const DIR = path.join(__dirname, '..', 'data'), FILE = path.join(DIR, 'users.json'), STATE = path.join(DIR, 'user_state.json');
const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; } };
const write = (f, v) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };
const MIN_PASSWORD = 10, REFRESH = 60 * 1000;
const key = n => String(n || '').trim().toLowerCase();

let base = [], all = new Map(), storable = true;
function merge(rows) {
  const m = new Map();
  for (const u of base) m.set(key(u.name), { name: u.name, hash: u.hash, role: u.role, active: true, who: null, at: null });
  for (const r of rows) { const k = key(r.login), was = m.get(k) || {}; m.set(k, { name: was.name || r.login, hash: r.hash || was.hash, role: r.role || was.role || 'user', active: r.active !== false, who: r.who, at: r.at }); }
  all = m;
}
async function refresh() {
  if (USE_FIXTURES) { merge(read(FILE)); return; }
  try { merge(await query(`SELECT login, hash, role, active, who, at::text FROM app.app_user ORDER BY at`)); storable = true; }
  catch { storable = false; if (!all.size) merge([]); }   // before the setup SQL, or the database is away: the last list held, else AUTH_USERS
}
async function init(envUsers) {
  base = envUsers; merge([]); await refresh();
  const t = setInterval(() => refresh().catch(() => {}), REFRESH); if (t.unref) t.unref();
}
const find = name => all.get(key(name)) || null;
// a fingerprint of the password in the session: changing it signs that person out everywhere
const passMark = u => crypto.createHash('sha256').update(String(u.hash)).digest('base64url').slice(0, 12);
const check = (name, password) => { const u = find(name); return u && u.active && bcrypt.compareSync(String(password), u.hash) ? u : null; };

async function save(row) {
  if (USE_FIXTURES) { const rows = read(FILE); rows.push({ ...row, at: new Date().toISOString() }); write(FILE, rows); }
  else await query(`INSERT INTO app.app_user (login, hash, role, active, who) VALUES ($1, $2, $3, $4, $5)`, [row.login, row.hash, row.role, row.active, row.who]);
  await refresh();
}
const adminsLeft = except => [...all.values()].filter(u => u.active && u.role === 'admin' && key(u.name) !== key(except)).length;
const owners = () => [...all.values()].filter(u => u.active).map(u => key(u.name)).sort();
const list = () => [...all.values()].map(u => ({ name: u.name, role: u.role === 'admin' ? 'admin' : 'user', active: u.active, who: u.who, at: u.at })).sort((a, b) => a.name.localeCompare(b.name));

// what this person has seen of the welcome
async function seen(login) {
  const rows = USE_FIXTURES ? read(STATE).filter(r => key(r.login) === key(login))
    : await query(`SELECT welcome_seen_version FROM app.user_state WHERE login = $1 ORDER BY at`, [key(login)]).catch(() => []);
  const r = rows[rows.length - 1];
  return r ? Number(r.welcome_seen_version) || 0 : 0;
}
async function setSeen(login, version) {
  if (USE_FIXTURES) { const rows = read(STATE); rows.push({ login: key(login), welcome_seen_version: version, at: new Date().toISOString() }); write(STATE, rows); return; }
  await query(`INSERT INTO app.user_state (login, welcome_seen_version) VALUES ($1, $2)`, [key(login), version]);
}

const admin = (req, res, next) => req.session && req.session.user && req.session.user.role === 'admin' ? next() : res.status(403).json({ error: 'Only an admin can change users.' });
const me = req => req.session.user.name;
const unsaved = () => storable ? 'That did not save.' : 'Users cannot be saved until the setup SQL has been applied.';
const api = express.Router();
api.use(admin);
const withSeen = async () => Promise.all(list().map(async u => ({ ...u, seen: await seen(u.name).catch(() => 0) })));
api.get('/', async (req, res) => res.json({ data: { users: await withSeen(), storable, minPassword: MIN_PASSWORD } }));
api.post('/', async (req, res) => {
  const { name, role, password } = req.body || {}, login = String(name || '').trim();
  if (!/^[A-Za-z0-9._-]{2,30}$/.test(login)) return res.status(400).json({ error: 'A name is 2 to 30 letters or numbers, with no spaces.' });
  if (find(login)) return res.status(400).json({ error: 'There is already a user with that name.' });
  if (String(password || '').length < MIN_PASSWORD) return res.status(400).json({ error: `A password needs at least ${MIN_PASSWORD} characters.` });
  try { await save({ login: key(login), hash: await bcrypt.hash(String(password), 10), role: role === 'admin' ? 'admin' : 'user', active: true, who: me(req) }); res.json({ data: await withSeen() }); }
  catch (e) { res.status(500).json({ error: unsaved() }); }
});
api.post('/:name', async (req, res) => {
  const u = find(req.params.name), b = req.body || {};
  if (!u) return res.status(404).json({ error: 'No such user.' });
  const role = b.role == null ? u.role : b.role === 'admin' ? 'admin' : u.role === 'admin' ? 'user' : u.role, active = b.active == null ? u.active : !!b.active;
  if (key(u.name) === key(me(req)) && (!active || role !== 'admin')) return res.status(400).json({ error: 'You cannot remove your own admin access or switch yourself off.' });
  if (u.role === 'admin' && (role !== 'admin' || !active) && !adminsLeft(u.name)) return res.status(400).json({ error: 'There must always be one admin.' });
  if (b.password != null && String(b.password).length < MIN_PASSWORD) return res.status(400).json({ error: `A password needs at least ${MIN_PASSWORD} characters.` });
  try { await save({ login: key(u.name), hash: b.password != null ? await bcrypt.hash(String(b.password), 10) : u.hash, role, active, who: me(req) }); res.json({ data: await withSeen() }); }
  catch (e) { res.status(500).json({ error: unsaved() }); }
});
api.post('/:name/welcome', async (req, res) => {
  const u = find(req.params.name);
  if (!u) return res.status(404).json({ error: 'No such user.' });
  try { await setSeen(u.name, 0); res.json({ data: await withSeen() }); } catch (e) { res.status(500).json({ error: unsaved() }); }
});

module.exports = { init, find, check, passMark, owners, seen, setSeen, api };
