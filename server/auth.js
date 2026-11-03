// The starting users come from AUTH_USERS = "name:bcryptHash:role,name:bcryptHash:role"; an admin adds and changes them on Settings
// (server/users.js). Every signed-in user sees every screen but Settings, which is for admins.
'use strict';
const crypto = require('crypto');
const Users = require('./users');

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
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Sign in to R4 Pulse, R4 Services' management view.">
<title>R4 Pulse — sign in</title>
<link rel="icon" href="/brand/r4-icon-192.png">
<link rel="stylesheet" href="/tokens.css">
<style>
html,body{overflow-x:clip}
:focus-visible{outline:var(--hair-2) solid var(--brand);outline-offset:var(--hair-2)}
button:active{opacity:.7}
button:disabled,input:disabled{cursor:not-allowed}
body{margin:0;background:var(--ground);color:var(--ink);font-family:var(--f-sans);font-size:var(--fs-body)}
.mast{background:var(--logo-ground);border-bottom:var(--hair) solid var(--rule);padding:var(--sp-3) var(--sp-8);display:flex;gap:var(--sp-4);align-items:center}
.mast img{height:var(--logo-h);width:auto;display:block}
.mast span{font-size:var(--fs-label);color:var(--ink-on-logo)}
main{max-width:calc(var(--u) * 90);margin:var(--sp-12) auto;background:var(--surface);border:var(--hair) solid var(--rule-2);border-radius:var(--r-lg);padding:var(--sp-8)}
h1{font-family:var(--f-display);font-weight:400;font-synthesis:none;font-size:var(--fs-display-ph);margin:0 0 var(--sp-4);letter-spacing:var(--track-tight)}
label{display:block;font-size:var(--fs-source);font-weight:500;color:var(--ink-3);margin:var(--sp-3) 0 var(--sp-1)}
input{width:100%;box-sizing:border-box;padding:var(--sp-2) var(--sp-3);border:var(--hair) solid var(--field-edge);border-radius:var(--r-sm);font:inherit;background:var(--surface);color:var(--ink)}
button{margin-top:var(--sp-5);width:100%;padding:var(--sp-3);background:var(--hero-bg-2);color:var(--hero-ink);border:0;border-radius:var(--r-sm);font:inherit;font-weight:600;cursor:pointer}
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
  Users.init(parseUsers(process.env.AUTH_USERS)).catch(e => console.warn('users:', e.message));
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set');

  app.set('trust proxy', 1);
  // The session is a signed cookie, not memory on the server, so a restart, a deploy or a sleeping preview
  // does not sign anyone out. Twelve hours, renewed as it is used.
  const COOKIE = 'r4pulse', LIFE = 12 * 60 * 60 * 1000, RENEW = 60 * 60 * 1000;
  const mac = body => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url');
  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: LIFE, path: '/' };
  const issue = (res, user) => { const body = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + LIFE })).toString('base64url'); res.cookie(COOKIE, body + '.' + mac(body), cookieOpts); };
  const read = req => {
    const m = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    if (!m) return null;
    const [body, sig] = m.slice(COOKIE.length + 1).split('.');
    if (!body || !sig) return null;
    const want = Buffer.from(mac(body)), got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    try {
      const u = JSON.parse(Buffer.from(body, 'base64url').toString()), now = Users.find(u.name);
      // switched off, or the password has changed, ends the session; access is read fresh, so a change takes effect at once
      return u.exp > Date.now() && now && now.active && u.pm === Users.passMark(now) ? { ...u, role: now.role } : null;
    } catch { return null; }
  };
  app.use((req, res, next) => {
    const u = read(req);
    req.session = { user: u ? { name: u.name, role: u.role, pm: u.pm } : null, destroy: cb => { res.clearCookie(COOKIE, { path: '/' }); cb(); } };
    if (u && u.exp - Date.now() < LIFE - RENEW) issue(res, req.session.user);
    next();
  });

  app.get('/login', (req, res) => res.type('html').send(LOGIN_PAGE(null)));
  app.post('/login', (req, res) => {
    const { name = '', password = '' } = req.body || {};
    const u = Users.check(name, password);
    if (!u) {
      return res.status(401).type('html').send(LOGIN_PAGE('That name and password do not match.'));
    }
    issue(res, { name: u.name, role: u.role, pm: Users.passMark(u) });
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
