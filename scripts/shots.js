// npm run shots [-- <label>] [-- --only=home,pricing] [-- --all]
// Every screen at 390 (Trisha's phone) and 1440 (Anne's and Mike's desk), from the fixtures, into
// docs/screens/<label>/. The label defaults to "current"; use "before-x" and "after-x" to keep a pair.
// It starts its own server on fixtures with a throwaway login, so it needs no .env and no database.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const label = args.find(a => !a.startsWith('--')) || 'current';
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const design = args.includes('--design');           // draw the ?design=1 overlay on every shot
const scheme = args.includes('--dark') ? 'dark' : 'light';   // --dark: the same shots in the dark theme

// the customer page on the account with the most route visits (Citadel apart), so orders, visits,
// bins and prices are all drawn on real figures
const drill = require('../fixtures/drill.json').data.accounts.filter(a => a.level1 !== 6714).sort((a, b) => b.visits.length - a.visits.length);
const SCREENS = [
  { name: 'home',      hash: '#pulse' },
  { name: 'home2',     hash: '#home2' },
  { name: 'customers', hash: '#customers' },
  { name: 'customer',  hash: `#customer/${drill[0].level1}` },
  { name: 'pricing',   hash: '#pricing' },
  { name: 'routes',    hash: '#activity' },
  { name: 'styleguide', page: '/styleguide.html' },
].concat(
  // every Customers list, with --all or by name (customers-margin, ...)
  [{ name: 'explainer', hash: '#customers?view=whitespace', click: 'button.opp', extra: true },
   { name: 'pop-margin', hash: '#customers', click: '.c2-x[data-x="margin"]', extra: true },
   { name: 'pop-price', hash: '#customers?view=overview&line=bin', click: '.c2-x[data-x="price"]', extra: true },
   { name: 'customers-bins', hash: '#customers?view=overview&line=bin', extra: true }],
  ['conversations', 'grid', 'whitespace', 'slipping', 'gaps', 'rounds', 'destruction', 'margin', 'all'].map(v => ({ name: 'customers-' + v, hash: '#customers?view=' + v, extra: true })),
).filter(s => only.length ? only.includes(s.name) : !s.extra || args.includes('--all'));
// --only=intro takes just the opening, mid-flight
const WIDTHS = [390, 1440];

async function main() {
  const port = 3900 + Math.floor(Math.random() * 90);
  const pass = crypto.randomBytes(9).toString('hex');
  const env = {
    ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development',
    AUTH_USERS: `shots:${bcrypt.hashSync(pass, 8)}:admin`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'),
    ANTHROPIC_API_KEY: '', DATABASE_URL: '',           // the template paragraph, never a live call
  };
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, no) => {
    server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); });
    server.on('exit', c => no(new Error('server exited ' + c)));
  });
  const base = `http://localhost:${port}`;
  const out = path.join(ROOT, 'docs', 'screens', label);
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: width < 700 ? 2 : 1, colorScheme: scheme, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'America/Chicago' });
      const page = await ctx.newPage();
      page.on('pageerror', e => console.error(`  ! ${width} ${page.url()}: ${e.message}`));
      await page.goto(base + '/login');
      if (!only.length || only.includes('login')) {   // the sign-in page, the first thing anyone sees
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: path.join(out, `login-${width}.png`) });
        console.log('  ' + path.relative(ROOT, path.join(out, `login-${width}.png`)));
      }
      await page.fill('input[name=name]', 'shots');
      await page.fill('input[name=password]', pass);
      await Promise.all([page.waitForNavigation(), page.click('button')]);
      for (const s of SCREENS) {
        const q = design ? '?design=1' : '';
        await page.goto(base + (s.page || '/') + q + (s.hash || ''));
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !document.querySelector('#main .loading'), null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(300);
        if (s.click) { await page.click(s.click); await page.waitForTimeout(400); }
        const f = path.join(out, `${s.name}-${width}${scheme === 'dark' ? '-dark' : ''}.png`);
        await page.screenshot({ path: f, fullPage: !s.click });   // a dialog: the viewport it sits in
        console.log('  ' + path.relative(ROOT, f));
        if (s.click) await page.goto('about:blank');   // a dialog stays open across a hash change
      }
      // the intro, caught mid-flight, in a context that allows motion
      if (!only.length || only.includes('intro')) {
        const mctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, deviceScaleFactor: width < 700 ? 2 : 1, storageState: await ctx.storageState() });
        const mp = await mctx.newPage();
        await mp.goto(base + '/#pulse');
        await mp.waitForTimeout(1300);
        const f = path.join(out, `intro-${width}.png`);
        await mp.screenshot({ path: f });
        console.log('  ' + path.relative(ROOT, f));
        await mctx.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
