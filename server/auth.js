// Users come from AUTH_USERS = "name:bcryptHash:role,name:bcryptHash:role".
// Roles: owner (Trisha), ops (Mike), billing (Anne), admin (Theran). Every screen is
// visible to every role for now; the role is recorded so that can change later.
'use strict';
const bcrypt = require('bcryptjs');
const session = require('express-session');

function parseUsers(raw) {
  return (raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => {
      // a bcrypt hash itself contains ':'-free segments, so split on the first and last colon
      const first = s.indexOf(':'), last = s.lastIndexOf(':');
      return { name: s.slice(0, first), hash: s.slice(first + 1, last), role: s.slice(last + 1) };
    });
}

const LOGIN_PAGE = (err) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>R4 Pulse — sign in</title>
<link rel="stylesheet" href="/tokens.css">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@400;600&family=Newsreader:opsz,wght@6..72,400&display=swap" rel="stylesheet">
<style>
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-body);font-size:var(--fs-body)}
.mast{background:var(--brand);color:#fff;padding:14px 32px;display:flex;gap:18px;align-items:baseline}
.mast b{font-size:15px;letter-spacing:.02em}.mast span{font-family:var(--f-narrow);font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
main{max-width:360px;margin:80px auto;background:var(--surface);border:1px solid var(--rule-2);border-radius:var(--r-lg);padding:28px 30px}
h1{font-family:var(--f-display);font-weight:400;font-size:28px;margin:0 0 18px;letter-spacing:var(--track-tight)}
label{display:block;font-family:var(--f-narrow);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin:12px 0 4px}
input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--rule-4);border-radius:var(--r-sm);font:inherit}
button{margin-top:18px;width:100%;padding:10px;background:var(--ink);color:#fff;border:0;border-radius:var(--r-sm);font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--bad);font-size:12px;margin-top:10px}
</style></head><body>
<div class="mast"><b>R4 Pulse</b><span>Reliable · Resourceful · Responsive · Reasonable</span></div>
<main><h1>Sign in</h1>
<form method="post" action="/login">
<label>Name</label><input name="name" autocomplete="username" autofocus>
<label>Password</label><input name="password" type="password" autocomplete="current-password">
<button>Open R4 Pulse</button>${err ? `<div class="err">${err}</div>` : ''}
</form></main></body></html>`;

function install(app) {
  const users = parseUsers(process.env.AUTH_USERS);
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');

  app.set('trust proxy', 1);
  app.use(session({
    secret: process.env.SESSION_SECRET,
    name: 'r4pulse',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000 },
  }));

  app.get('/login', (req, res) => res.type('html').send(LOGIN_PAGE(null)));
  app.post('/login', (req, res) => {
    const { name = '', password = '' } = req.body || {};
    const u = users.find(x => x.name.toLowerCase() === String(name).trim().toLowerCase());
    if (!u || !bcrypt.compareSync(String(password), u.hash)) {
      return res.status(401).type('html').send(LOGIN_PAGE('That name and password do not match.'));
    }
    req.session.user = { name: u.name, role: u.role };
    res.redirect('/');
  });
  app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

  // everything else needs a session, except the health check and the stylesheet the login page uses
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/tokens.css') return next();
    if (req.session && req.session.user) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'sign in' });
    res.redirect('/login');
  });
}

module.exports = { install, parseUsers };
