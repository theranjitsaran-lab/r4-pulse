// npm run sweep [-- --role=owner]
// The fix list's self-check: signs in as an R4 user at 390px, opens every screen and list from the
// fixtures, and searches what is actually rendered for what R4 users must not see. Exits 1 on any hit.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const role = (process.argv.find(a => a.startsWith('--role=')) || '--role=owner').slice(7);
const drill = require('../fixtures/drill.json').data.accounts.filter(a => a.level1 !== 6714).sort((a, b) => b.visits.length - a.visits.length);
const SCREENS = ['#pulse', '#customers', '#customers?view=overview', '#customers?view=conversations', '#opportunities', '#customers?view=grid', '#customers?view=whitespace', '#customers?view=margin',
  '#customers?view=slipping', '#customers?view=gaps', '#customers?view=rounds', '#customers?view=destruction', '#customers?view=overview&line=bin', `#customer/${drill[0].level1}`, '#customer/12530',
  '#pricing', '#pricing?code=B3', '#numbers', '#activity', '#numbers?tab=warehouse', '#how', '#settings', '#classic'];

// what R4 users must not see while costs are not final
const COSTS = [/\bMargin\b(?!\s+Margins arrive)/, /Renegotiate/, /\bRe-route\b/, /\bDrop\b/, /below cost/i, /Cost est\./, /cost to serve(?! not ready)/i, /to serve est\./, /of revenue kept/, /Left, provisional/, /Gross margin(?! by line of business\s+Not costed)/, /How to improve the margin/, /saves about/, /Route time est\./];
// what nobody at R4 should ever read
const TEXT = [/to confirm with Anne/, /ZCTA/, /median R3/, /centroid/i, /zcta\.json/, /npm run/, /rates\.js/, /\bnode scripts/, /load_gl/, /gl_month/, /\bClaude\b/, /kpi\.monthly/, /storage_rate_hist/, /storage_retention/, /status I\b/, /not built yet/i, /\bundefined\b/, /\bNaN\b/, /\$-/, /◇/, /est\.\./, /\best\. est\./];
const ZEROS = [/▼ ?0%/, /▲ ?0%/, /\b0 services on 0 routes/, /won this month \$0/, /(\$[\d.]+[KM]?)[–-]\1\b/, /\b0 called/];

async function main() {
  const port = 3700 + Math.floor(Math.random() * 90), pass = crypto.randomBytes(9).toString('hex');
  const env = { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `sweep:${bcrypt.hashSync(pass, 8)}:${role}`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'), ANTHROPIC_API_KEY: '', DATABASE_URL: '' };
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((ok, no) => { server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }); server.on('exit', c => no(new Error('server exited ' + c))); });
  const base = `http://localhost:${port}`, browser = await chromium.launch();
  let hits = 0;
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'America/Chicago' });
    const page = await ctx.newPage();
    page.on('pageerror', e => { hits++; console.log(`  page error: ${e.message}`); });
    await page.goto(base + '/login');
    await page.fill('input[name=name]', 'sweep'); await page.fill('input[name=password]', pass);
    await Promise.all([page.waitForNavigation(), page.click('button')]);
    await page.waitForTimeout(500);
    for (const hash of SCREENS) {
      await page.goto('about:blank');
      await page.goto(base + '/' + hash);
      await page.waitForLoadState('networkidle');
      await page.waitForFunction(() => !document.querySelector('#main .loading'), null, { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(400);
      // folded sections count: a phone user can open them
      if (hash === '#pulse') { const h = await page.evaluate(() => document.documentElement.scrollHeight); console.log(`     Home is ${h}px, ${(h / 844).toFixed(1)} phone screens`); if (h > 2 * 844) { hits++; console.log('HIT  Home is over two phone screens'); } }
      if (hash === '#pulse') { const n = await page.evaluate(() => { const e = document.querySelector('#h2-head'); return e ? Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)) : 0; }); if (n > 2) { hits++; console.log(`HIT  the headline runs to ${n} lines`); } }
      if (hash.startsWith('#pricing')) await page.click('#q-add').catch(() => {});   // a quote line, which once showed its margin
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await page.waitForTimeout(150);
      const text = await page.evaluate(() => document.body.innerText);
      const found = [...TEXT, ...ZEROS, ...(role === 'admin' ? [] : COSTS)].flatMap(re => { const m = text.match(re); return m ? [m[0]] : []; });
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      if (wide) found.push('wider than the phone');
      console.log(`${found.length ? 'HIT ' : 'ok  '} ${hash}${found.length ? '  ' + [...new Set(found)].join(' | ') : ''}`);
      hits += found.length;
    }
  } finally { await browser.close(); server.kill(); }
  console.log(hits ? `\n${hits} hits` : '\nclean');
  process.exit(hits ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
