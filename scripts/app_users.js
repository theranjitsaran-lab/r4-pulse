// Makes the four logins for the deployed app: one each for Trisha, Mike, Anne and Theran.
//
//   node scripts/app_users.js
//
// Writes AUTH_USERS (names, bcrypt hashes and roles) into .env.render for pasting into Render, and
// the plain passwords into render_logins.txt to hand to each person. Both files are gitignored;
// delete them once the logins are handed out. Nothing is printed. Re-running issues new passwords.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const USERS = [
  { name: 'trisha', role: 'owner' },
  { name: 'mike', role: 'ops' },
  { name: 'anne', role: 'billing' },
  { name: 'theran', role: 'admin' },
];
const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.render');
const LOGINS = path.join(ROOT, 'render_logins.txt');

// four groups of four letters and digits, easy to read aloud: no 0/o, 1/l/i
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const word = () => Array.from(crypto.randomBytes(4), b => ALPHA[b % ALPHA.length]).join('');
const password = () => [word(), word(), word(), word()].join('-');

const issued = USERS.map(u => ({ ...u, password: password() }));
const authUsers = issued.map(u => `${u.name}:${bcrypt.hashSync(u.password, 10)}:${u.role}`).join(',');

const lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter(l => l && !l.startsWith('AUTH_USERS=')) : [];
lines.push(`AUTH_USERS=${authUsers}`);
fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
fs.writeFileSync(LOGINS, issued.map(u => `${u.name.padEnd(8)} ${u.password}`).join('\n') + '\n', { mode: 0o600 });
console.log(`.env.render: AUTH_USERS written for ${issued.map(u => u.name).join(', ')}`);
console.log('render_logins.txt: the passwords to hand out (delete it afterwards)');
