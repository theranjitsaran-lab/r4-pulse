// The morning emails (server/brief.mjs), sent at 07:15 by R4_Morning_Brief on the R4 machine, after the
// push (06:00, 06:30) and the KPI rebuild (07:00). Reads the live database, so it runs where the push
// runs. Sends through Microsoft 365 (smtp.office365.com, port 587, STARTTLS).
//
//   node scripts/send_brief.js --dry-run [--fixtures]   writes the emails to logs/brief/*.html, sends nothing
//   node scripts/send_brief.js                          sends
//
// Needs in .env on that machine (never in the repo):
//   BRIEF_TO          trisha:trisha@…,anne:anne@…,mike:mike@…  (names as the app logins, for "knew")
//   BRIEF_FROM        the sending mailbox, e.g. pulse@r4services.com
//   BRIEF_SMTP_USER   that mailbox's login · BRIEF_SMTP_PASS  its app password
//   PULSE_URL         the live app, e.g. https://r4-pulse.onrender.com (the taps land there)
//   FEEDBACK_SECRET   the same value as on Render, so Render accepts the taps
//   ANTHROPIC_API_KEY optional: Trisha's opening written by Claude, every number checked
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry-run'), FIX = process.argv.includes('--fixtures');
if (FIX) process.env.USE_FIXTURES = '1'; else process.env.USE_FIXTURES = '0';

const people = (process.env.BRIEF_TO || (DRY ? 'trisha:trisha@example.com,anne:anne@example.com,mike:mike@example.com' : ''))
  .split(',').map(s => s.trim()).filter(Boolean).map(s => { const i = s.indexOf(':'); return { who: s.slice(0, i).toLowerCase(), to: s.slice(i + 1) }; });

(async () => {
  if (!people.length) throw new Error('BRIEF_TO is not set');
  const { sign } = require('../server/feedback');
  const { writeChecked } = require('../server/summary');
  let P, A, C, PR, CA, log = [], feedback = [];
  if (FIX) {
    const J = n => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', `${n}.json`), 'utf8')).data;
    [P, A, C, PR, CA] = ['pulse', 'activity', 'customers', 'pricing', 'calls'].map(J);
  } else {
    const q = require('../server/queries'), { query } = require('../server/db');
    [P, A, C, PR, CA] = await Promise.all([q.pulse(), q.activity(), q.customers(), q.pricing(), q.calls()]);
    log = await query(`SELECT level1, kind, signal, verdict, who, logged_at::text FROM app.calls_log WHERE logged_at > now() - interval '30 days'`).catch(() => []);
    feedback = await query(`SELECT who, key, subject, verdict, at::text FROM app.feedback WHERE at > now() - interval '30 days'`).catch(() => []);
  }
  const { buildBriefs } = await import('../server/brief.mjs');
  const today = new Date().toISOString().slice(0, 10);
  const url = (process.env.PULSE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const mails = buildBriefs({ P, A, C, PR, CA, log, feedback, today: FIX ? addDay(A.latestDone) : today, url, sign, people });

  // Trisha's opening: Claude's sentences if every number checks, else the day in a sentence
  for (const m of mails) if (m.sheet && m.sheet.length) {
    const text = await writeChecked(m.sheet, { brief: true });
    if (text) m.html = m.html.replace(/(<p[^>]*data-opening>)[\s\S]*?(<\/p>)/, (_, a, b) => a + text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]) + b);
  }

  if (DRY) {
    const dir = path.join(__dirname, '..', 'logs', 'brief');
    fs.mkdirSync(dir, { recursive: true });
    for (const m of mails) { fs.writeFileSync(path.join(dir, `${m.who}.html`), m.html); console.log(`${m.who.padEnd(7)} ${m.to}  "${m.subject}"  → logs/brief/${m.who}.html`); }
    process.exit(0);
  }
  for (const k of ['BRIEF_FROM', 'BRIEF_SMTP_USER', 'BRIEF_SMTP_PASS', 'PULSE_URL', 'FEEDBACK_SECRET']) if (!process.env[k]) throw new Error(`${k} is not set in .env`);
  const nodemailer = require('nodemailer');
  const tx = nodemailer.createTransport({ host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true, auth: { user: process.env.BRIEF_SMTP_USER, pass: process.env.BRIEF_SMTP_PASS } });
  for (const m of mails) {
    await tx.sendMail({ from: process.env.BRIEF_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html });
    console.log(`sent ${m.who} ${m.to}`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });

function addDay(d) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }
