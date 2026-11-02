// node scripts/hallmark_clicks.js <out.json> [source folder]
// The states the saved pages can't show: pop-outs, opened rows, one order's cost build, a quote line, a saved status.
// Runs the same clicks as admin at 1440 and 390 with a frozen clock, and writes the visible text after each, so two
// versions of the code can be compared. Also reports page errors and whether the masthead stays on screen.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..'), OUT = process.argv[2], SRC = path.resolve(process.argv[3] || ROOT);
const drill = require('../fixtures/drill.json').data.accounts.filter(a => a.level1 !== 6714).sort((a, b) => b.visits.length - a.visits.length);
const C = drill[0].level1;
// screen, then what to click: each selector's first few matches, one at a time, from a fresh page
const FLOWS = [
  ['#pulse', [['.h2-bul a', 3], ['.h2-info summary, .h2-i summary, details summary', 3], ['.h2-seg, .h2-kpis a, .h2-kpis button', 3], ['.seg button', 2], ['.h2-lines tr, .h2-line, [data-line]', 3]]],
  ['#customers?view=overview', [['.dt-caret', 3], ['.c2-li', 3], ['.h2-kpi', 3], ['.dt-span button', 2], ['td[data-k], .pop-open, [data-pop]', 3]]],
  ['#customers?view=grid', [['.dt-caret', 2], ['.dt-span button', 2]]],
  ['#customers?view=whitespace', [['.opp', 3]]],
  ['#customers?view=margin', [['.mg-row, .rm-list li, tbody tr', 3]]],
  ['#opportunities', [['.dt-caret', 3], ['.dt-type', 3]]],
  ['#pricing', [['#q-add', 1], ['.seg button', 2], ['details summary', 3]]],
  ['#numbers', [['.dt-span button', 2], ['.seg button', 3], ['details summary', 3]]],
  ['#numbers?tab=warehouse', [['.dt-caret', 2], ['.wh .rw', 2]]],
  ['#activity', [['.day button', 2], ['tbody tr', 3], ['details summary', 3]]],
  [`#customer/${C}`, [['.fam', 3], ['#cp-drill tbody tr', 3], ['.chip', 3], ['details summary', 3]]],
  ['#settings', [['details summary', 2]]],
];
const NOW = new Date('2026-11-02T18:00:00Z');
const text = () => document.body.innerText.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

(async () => {
  const port = 4100 + Math.floor(Math.random() * 90), pass = crypto.randomBytes(9).toString('hex');
  const env = { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules'), PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `clicks:${bcrypt.hashSync(pass, 8)}:admin`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'), ANTHROPIC_API_KEY: '', DATABASE_URL: '' };
  const server = spawn(process.execPath, ['server/index.js'], { cwd: SRC, env, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((ok, no) => { server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }); server.on('exit', c => no(new Error('server exited ' + c))); });
  const saved = path.join(SRC, 'data', 'opportunities.json'), before = fs.existsSync(saved) ? fs.readFileSync(saved) : null;
  const base = `http://localhost:${port}`, browser = await chromium.launch(), out = {}, errors = [];
  try {
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'America/Chicago' });
      await ctx.clock.setFixedTime(NOW);
      const page = await ctx.newPage(); let where = '';
      page.setDefaultNavigationTimeout(180000);
      page.on('pageerror', e => errors.push(`${where}: ${e.message}`));
      await page.goto(base + '/login'); await page.fill('input[name=name]', 'clicks'); await page.fill('input[name=password]', pass);
      await Promise.all([page.waitForNavigation(), page.click('button')]);
      const open = async hash => { await page.goto('about:blank'); await page.goto(base + '/' + hash); await page.waitForLoadState('networkidle'); await page.waitForFunction(() => { const m = document.querySelector('#main'); return m && m.innerText.length > 40 && !m.querySelector('.sk'); }, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(400); };
      for (const [hash, list] of FLOWS) for (const [sel, n] of list) for (let i = 0; i < n; i++) {
        where = `${width} ${hash} ${sel} ${i}`;
        await open(hash);
        const el = (await page.$$(sel))[i];
        if (!el || !(await el.isVisible().catch(() => false))) { out[where] = null; continue; }
        try { await el.click({ timeout: 3000 }); } catch (e) { out[where] = 'not clickable'; continue; }
        await page.waitForLoadState('networkidle'); await page.waitForTimeout(450);
        out[where] = await page.evaluate(text);
      }
      // save a status, and read it back
      where = `${width} save status`;
      await open('#opportunities');
      await page.click('.dt-caret'); await page.waitForTimeout(200); await page.click('.op-row .op-head'); await page.waitForTimeout(150);
      await page.selectOption('.op-status', 'contacted'); await page.waitForTimeout(500);
      out[where] = [await page.$eval('.op-msg', e => e.innerText).catch(() => 'no message')];
      await page.selectOption('.op-status', 'open'); await page.waitForTimeout(400);
      // the masthead, after a long scroll
      where = `${width} masthead`;
      await open('#opportunities');
      out[where] = [await page.evaluate(async () => { scrollTo(0, 1500); await new Promise(r => setTimeout(r, 200)); return 'on screen ' + (document.querySelector('.mast').getBoundingClientRect().bottom > 0); })];
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); if (before) fs.writeFileSync(saved, before); else fs.rmSync(saved, { force: true }); }
  fs.writeFileSync(OUT, JSON.stringify({ out, errors }, null, 1));
  const v = Object.values(out); console.log(`${v.filter(Array.isArray).length} states read, ${v.filter(x => x === null).length} selectors with nothing there, ${v.filter(x => x === 'not clickable').length} not clickable, ${errors.length} page errors`);
  for (const e of errors.slice(0, 10)) console.log('  ' + e.slice(0, 200));
  for (const k of Object.keys(out).filter(k => /save status|masthead/.test(k))) console.log(`  ${k}: ${out[k]}`);
})().catch(e => { console.error(e); process.exit(1); });
