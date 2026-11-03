// node scripts/hallmark_pages.js [--out=baseline] [--pages]
// What every screen says and does, from the fixtures, with a throwaway login and a frozen clock: signs in
// as owner and admin at 390 and 1440, opens every screen, folded sections and full lists, and writes
//   .hallmark/<out>/<role>-<width>.json   each screen's visible text, links, controls and final URL
//   .hallmark/pages/<role>-<width>-<screen>.html (with --pages)   the page as drawn, its CSS inside and its
//                                         scripts out, because Hallmark's checker cannot sign in
// scripts/hallmark_compare.js compares two runs. The folder is git-ignored: it holds client figures.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const OUT = path.join(ROOT, '.hallmark', arg('out', 'baseline')), PAGES = path.join(ROOT, '.hallmark', 'pages'), SAVE = process.argv.includes('--pages');
const drill = require('../fixtures/drill.json').data.accounts.filter(a => a.level1 !== 6714).sort((a, b) => b.visits.length - a.visits.length);
const CUSTOMER = drill[0].level1;
// the six tabs, every sub-view reached from them, the customer page, Settings, How and the old routes kept for links
const SCREENS = {
  today: '#pulse', 'accounts-overview': '#customers?view=overview', 'accounts-grid': '#customers?view=grid', 'accounts-cross-sell': '#customers?view=whitespace',
  'accounts-margin': '#customers?view=margin', 'accounts-slipping': '#customers?view=slipping', 'accounts-gaps': '#customers?view=gaps', 'accounts-rounds': '#customers?view=rounds',
  'accounts-destruction': '#customers?view=destruction', 'accounts-conversations': '#customers?view=conversations', quote: '#pricing', money: '#numbers', 'money-margin': '#numbers?show=margin',
  'money-warehouse': '#numbers?tab=warehouse', operations: '#activity', opportunities: '#opportunities', customer: `#customer/${CUSTOMER}`, how: '#how', settings: '#settings', classic: '#classic',
};
const NOW = new Date('2026-11-02T18:00:00Z');

const facts = () => ({
  url: location.hash,
  text: document.body.innerText.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
  links: [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).sort(),
  controls: [...document.querySelectorAll('select, input, textarea, button')].map(e => [e.tagName.toLowerCase(), e.name || e.id || e.className || '', e.tagName === 'SELECT' ? [...e.options].map(o => o.textContent.trim()).join('|') : e.tagName === 'BUTTON' ? e.textContent.replace(/\s+/g, ' ').trim() : e.type].join(' · ')).sort(),
  errors: [],
});

async function savePage(page, file, base) {
  const css = await page.evaluate(async () => {
    const out = [];
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) out.push(await (await fetch(l.href)).text());
    return out;
  });
  // a pop-up or a column picker is shut at rest: left open, it would sit over the figures below it
  await page.evaluate(() => document.querySelectorAll('details[open]').forEach(x => { const p = [...x.children].find(c => c.tagName !== 'SUMMARY'); if (p && ['absolute', 'fixed'].includes(getComputedStyle(p).position)) x.open = false; }));
  const html = await page.evaluate(() => {
    const d = document.documentElement.cloneNode(true);
    d.querySelectorAll('script, link[rel=stylesheet], link[rel=modulepreload]').forEach(e => e.remove());
    return '<!doctype html>\n' + d.outerHTML;
  });
  // the font goes inside the page: a browser won't load one from a local file
  const style = `<style>\n${css.join('\n').replace(/url\("?\/fonts\/([^")]+)"?\)/g, (m, n) => `url("data:font/ttf;base64,${fs.readFileSync(path.join(ROOT, 'public/fonts', n)).toString('base64')}")`)}\n</style>`;
  const fixed = html.replace('</head>', style + '</head>').split(base).join('').replace(/(src|href)="\/(fonts|brand)\//g, '$1="assets/$2/');
  fs.writeFileSync(file, fixed);
}

async function run(role, width, browser, base, pass, name) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, reducedMotion: 'reduce', locale: 'en-GB', timezoneId: 'America/Chicago' });
  await ctx.clock.setFixedTime(NOW);
  const page = await ctx.newPage(), results = {};
  let errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/login');
  results.login = await page.evaluate(facts);
  if (SAVE) await savePage(page, path.join(PAGES, `${role}-${width}-login.html`), base);
  await page.fill('input[name=name]', name); await page.fill('input[name=password]', pass);
  await Promise.all([page.waitForNavigation(), page.click('button')]);
  for (const [key, hash] of Object.entries(SCREENS)) {
    errors = [];
    await page.goto('about:blank');
    await page.goto(base + '/' + hash);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => { const m = document.querySelector('#main'); return m && m.innerText.length > 40 && !m.querySelector('.sk'); }, null, { timeout: 60000 }).catch(() => errors.push('never finished loading'));
    await page.waitForTimeout(500);
    // everything a person can open, so a figure folded away is still counted
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    for (let i = 0; i < 6; i++) {
      const more = await page.$('.dt-more .linkbtn'); if (!more) break;
      await more.click(); await page.waitForTimeout(150);
    }
    // the Cross-sell drill-down, open, so the checker reads it as a person sees it
    if (key === 'accounts-cross-sell') { await page.click('#ws-t tbody tr[data-i]'); await page.waitForTimeout(1000); }
    if (key === 'accounts-grid') { await page.click('.dt-t tbody tr[data-i] button.rag'); await page.waitForSelector('.pop .md-ln', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(800); }
    if (key === 'opportunities') { await page.click('#op-t tbody tr[data-i] td:first-child small'); await page.waitForTimeout(1000); }
    await page.waitForTimeout(200);
    results[key] = await page.evaluate(facts);
    results[key].errors = errors;
    if (SAVE) await savePage(page, path.join(PAGES, `${role}-${width}-${key}.html`), base);
    console.log(`  ${role} ${width} ${key}: ${results[key].text.length} lines, ${results[key].links.length} links, ${results[key].controls.length} controls${errors.length ? ', ERRORS ' + errors.join('; ') : ''}`);
  }
  await ctx.close();
  fs.writeFileSync(path.join(OUT, `${role}-${width}.json`), JSON.stringify(results, null, 1));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (SAVE) {
    fs.mkdirSync(PAGES, { recursive: true });
    for (const d of ['fonts', 'brand']) fs.cpSync(path.join(ROOT, 'public', d), path.join(PAGES, 'assets', d), { recursive: true });
  }
  const browser = await chromium.launch();
  try {
    for (const role of ['owner', 'admin']) {
      const port = 3800 + Math.floor(Math.random() * 90), pass = crypto.randomBytes(9).toString('hex'), name = 'pages';
      const env = { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `${name}:${bcrypt.hashSync(pass, 8)}:${role}`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'), ANTHROPIC_API_KEY: '', DATABASE_URL: '' };
      const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] });
      await new Promise((ok, no) => { server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }); server.on('exit', c => no(new Error('server exited ' + c))); });
      try { for (const width of [390, 1440]) await run(role, width, browser, `http://localhost:${port}`, pass, name); } finally { server.kill(); }
    }
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exit(1); });
