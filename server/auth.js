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
<link rel="icon" href="/brand/r4-icon-192.png">
<link rel="stylesheet" href="/tokens.css">
<style>
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-sans);font-size:var(--fs-body)}
.mast{background:var(--logo-ground);border-bottom:var(--hair) solid var(--rule);padding:var(--sp-3) var(--sp-8);display:flex;gap:var(--sp-4);align-items:center}
.mast img{height:var(--logo-h);width:auto;display:block}
.mast span{font-size:var(--fs-label);color:var(--ink-on-logo)}
main{max-width:calc(var(--u) * 90);margin:var(--sp-12) auto;background:var(--surface);border:var(--hair) solid var(--rule-2);border-radius:var(--r-lg);padding:var(--sp-8)}
h1{font-family:var(--f-display);font-weight:400;font-synthesis:none;font-size:var(--fs-display-ph);margin:0 0 var(--sp-4);letter-spacing:var(--track-tight)}
label{display:block;font-size:var(--fs-source);font-weight:500;color:var(--ink-3);margin:var(--sp-3) 0 var(--sp-1)}
input{width:100%;box-sizing:border-box;padding:var(--sp-2) var(--sp-3);border:var(--hair) solid var(--rule-4);border-radius:var(--r-sm);font:inherit;background:var(--surface);color:var(--ink)}
button{margin-top:var(--sp-5);width:100%;padding:var(--sp-3);background:var(--brand);color:var(--hero-ink);border:0;border-radius:var(--r-sm);font:inherit;font-weight:600;cursor:pointer}
.err{color:var(--bad);font-size:var(--fs-source);margin-top:var(--sp-3)}
</style></head><body>
<div class="mast"><img src="/brand/r4-logo.png" alt="R4 Services, information management company"><span>Pulse · Reliable · Resourceful · Responsive · Reasonable</span></div>
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

  // everything else needs a session, except the health check and what the login page draws with:
  // the tokens, R4's logo and the display face
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path === '/tokens.css' || req.path.startsWith('/brand/') || req.path.startsWith('/fonts/')) return next();
    if (req.session && req.session.user) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'sign in' });
    res.redirect('/login');
  });
}

module.exports = { install, parseUsers };
