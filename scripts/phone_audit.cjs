// The phone audit: every view and pop-out at three phone sizes, in a real browser on fixtures. Screenshots into docs/design/phone-audit/,
// and what it measures into docs/design/phone-audit/measures.json. Read-only: changes nothing in the app. Needs playwright (--no-save).
//   DATABASE_URL= node scripts/phone_audit.cjs [--only=390]
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), ROOT = path.join(__dirname, '..');
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs')), { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const OUT = path.join(ROOT, 'docs/design/phone-audit'), TAG = (process.argv.find(a => a.startsWith('--tag=')) || '').slice(6);
fs.mkdirSync(OUT, { recursive: true });
const SIZES = [[390, 844, 'iphone'], [375, 667, 'small'], [430, 932, 'large']];
const wait = ms => new Promise(r => setTimeout(r, ms));
const VIEWS = [
  ['today', '#pulse', '#h2-bul li'],
  ['accounts', '#customers?view=overview', '.dt-t tbody tr[data-i]'],
  ['month-grid', '#customers?view=grid', '.dt-t tbody tr[data-i]'],
  ['cross-sell', '#customers?view=whitespace', '#ws-t tbody tr[data-i]'],
  ['customer', '#customer/8153', '[data-margin-tile]'],
  ['quote', '#pricing', '#pq-what'],
  ['operations', '#activity', '#rt-map svg'],
  ['operations-day', '#activity?p=day', '#rt-map svg'],
  ['warehouse', '#numbers?tab=warehouse', '#wh-grid svg'],
  ['opportunities', '#opportunities', '#op-t tbody tr[data-i]'],
  ['settings', '#settings', '#main h1'],
  ['how', '#how', '#main h1'],
  // what opens from them
  ['line-of-business', '#customers?view=overview', '.lob-row', async p => { await p.click('.lob-row'); }, '.pop:not([hidden]) .ask-panel'],
  ['margin-drawer', '#customers?view=grid', '.dt-t tbody tr[data-i] button.rag', async p => { await p.click('.dt-t tbody tr[data-i] button.rag'); await p.waitForSelector('.pop .md-ln'); }, '.pop:not([hidden]) .ask-panel'],
  ['cross-sell-drill', '#customers?view=whitespace', '#ws-t tbody tr[data-i]', async p => { await p.locator('#ws-t tbody tr[data-i] td:first-child').first().click({ position: { x: 4, y: 4 } }); await p.waitForSelector('.cd'); }, null],
  ['opportunity-open', '#opportunities', '#op-t tbody tr[data-i]', async p => { await p.locator('#op-t tbody tr[data-i] td:first-child').first().click({ position: { x: 4, y: 4 } }); await p.waitForSelector('.op-dd'); }, null],
  ['costly-drawer', '#activity?lens=cost', '#op-side [data-area]', async p => { await p.click('#op-side [data-area]'); await p.waitForSelector('.pop .ops-opts'); }, '.pop:not([hidden]) .ask-panel'],
  ['ask', '#pulse', '#mast-ask', async p => { await p.click('#mast-ask'); await wait(400); }, '.ask:not(.pop):not([hidden]) .ask-panel'],
];
const measure = (panelSel) => {
  const seen = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity !== 0; };
  const nameOf = el => { const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''; return el.tagName.toLowerCase() + (c ? '.' + c : el.id ? '#' + el.id : ''); };
  const scope = panelSel ? document.querySelector(panelSel) : document.body;
  const out = { w: innerWidth, h: innerHeight, over: document.documentElement.scrollWidth - innerWidth, pageH: document.documentElement.scrollHeight, screens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1) };
  // text anyone reads
  const small = new Map(), body = new Map(); let words = 0;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent.trim(); if (!t || !n.parentElement || !seen(n.parentElement)) continue;
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(n.parentElement.tagName)) continue;
    const size = parseFloat(getComputedStyle(n.parentElement).fontSize), k = nameOf(n.parentElement); words += t.split(/\s+/).length;
    if (size < 13) { const x = small.get(k) || { size, n: 0, eg: t.slice(0, 40) }; x.n++; small.set(k, x); }
    if (size < 16 && t.split(/\s+/).length >= 8) { const x = body.get(k) || { size, n: 0, eg: t.slice(0, 40) }; x.n++; body.set(k, x); }
  }
  out.words = words;
  out.small = [...small].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);
  out.bodySmall = [...body].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);
  // anything past the right edge that is not in something meant to scroll: overflow clip hides it from scrollWidth
  const scrolls = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const past = [...scope.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('svg') && !scrolls(e); });
  out.past = past.length; out.pastEg = past.slice(0, 4).map(nameOf);
  // tap targets
  const targets = [...scope.querySelectorAll('a[href], button, select, input:not([type=hidden]), summary, [role=button], tr[tabindex]')].filter(seen);
  const under = new Map(), rects = targets.map(el => ({ el, r: el.getBoundingClientRect() }));
  const hitH = (el, r) => { const a = getComputedStyle(el, '::after'); return a.content && a.content !== 'none' && a.position === 'absolute' ? Math.max(r.height, parseFloat(a.height) || 0) : r.height; }, hitW = (el, r) => { const a = getComputedStyle(el, '::after'); return a.content && a.content !== 'none' && a.position === 'absolute' ? Math.max(r.width, parseFloat(a.width) || 0) : r.width; };
  for (const { el, r } of rects) if (hitW(el, r) < 44 || hitH(el, r) < 43.5) { const k = nameOf(el), x = under.get(k) || { n: 0, w: Math.round(r.width), h: Math.round(r.height) }; x.n++; under.set(k, x); }
  out.targets = targets.length;
  out.under44 = [...under].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);
  let close = 0; const lim = rects.slice(0, 250), Y = scrollY;
  for (let i = 0; i < lim.length; i++) for (let j = i + 1; j < lim.length; j++) {
    const a = lim[i].r, b = lim[j].r; if (lim[i].el.contains(lim[j].el) || lim[j].el.contains(lim[i].el)) continue;
    const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right)), dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom));
    if (dx < 8 && dy < 8) close++;
  }
  void Y; out.closePairs = close;
  // tiles
  const tiles = [...scope.querySelectorAll('.kt, .h2-kpi')].filter(seen);
  out.tiles = tiles.slice(0, 8).map(t => { const b = t.querySelector('b'), l = t.querySelector('.kl, span'); return { size: b ? parseFloat(getComputedStyle(b).fontSize) : null, top: Math.round(t.getBoundingClientRect().top + scrollY), label: l ? l.scrollWidth > l.clientWidth + 1 : false, wide: Math.round(t.getBoundingClientRect().width) }; });
  const firstRow = out.tiles.length ? out.tiles.filter(t => t.top === out.tiles[0].top).length : 0;
  out.tilesPerRow = firstRow;
  const last = tiles[Math.min(3, tiles.length - 1)], nav = document.querySelector('#nav'), navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
  out.answerBottom = last ? Math.round(last.getBoundingClientRect().bottom + scrollY) : null;
  out.firstScreen = last ? out.answerBottom <= navTop : null;
  // tables
  out.tables = [...scope.querySelectorAll('.dt-scroll')].filter(seen).map(s => { const t = s.querySelector('table'), first = t && t.querySelector('tbody td:first-child'); return { box: s.clientWidth, table: t ? t.scrollWidth : 0, rows: t ? t.querySelectorAll('tbody tr').length : 0, cols: t && t.rows[0] ? t.rows[0].cells.length : 0, pinned: first ? getComputedStyle(first).position === 'sticky' : false, rowH: first ? Math.round(first.getBoundingClientRect().height) : 0, font: first ? parseFloat(getComputedStyle(first).fontSize) : 0 }; });
  // margins and spacing
  const cards = [...document.querySelectorAll('#main .h2-card, #main .card')].filter(seen);
  out.marginL = cards.length ? Math.round(Math.min(...cards.map(c => c.getBoundingClientRect().left))) : null;
  out.marginR = cards.length ? Math.round(innerWidth - Math.max(...cards.map(c => c.getBoundingClientRect().right))) : null;
  const gaps = []; for (let i = 1; i < cards.length; i++) { const g = cards[i].getBoundingClientRect().top - cards[i - 1].getBoundingClientRect().bottom; if (g >= 0 && g < 60) gaps.push(Math.round(g)); }
  out.minGap = gaps.length ? Math.min(...gaps) : null;
  // charts: labels that collide, and whether they want a hover
  out.charts = [...scope.querySelectorAll('svg')].filter(seen).filter(s => s.getBoundingClientRect().width > 120 && s.querySelectorAll('text').length > 1).map(s => { const tx = [...s.querySelectorAll('text')].filter(seen).map(t => t.getBoundingClientRect()); let hit = 0; for (let i = 0; i < tx.length; i++) for (let j = i + 1; j < tx.length; j++) if (tx[i].left < tx[j].right && tx[j].left < tx[i].right && tx[i].top < tx[j].bottom && tx[j].top < tx[i].bottom) hit++; const r = s.getBoundingClientRect(); return { cls: String(s.getAttribute('class') || '').split(' ')[0], w: Math.round(r.width), h: Math.round(r.height), labels: tx.length, collide: hit, label: tx.length ? +parseFloat(getComputedStyle(s.querySelector('text')).fontSize).toFixed(1) : null }; }).filter(c => !/h2-map|rt-map|hm-map/.test(c.cls));
  // maps
  out.maps = [...document.querySelectorAll('svg.h2-map, svg.hm-map, svg.rt-map')].filter(seen).map(s => { const r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), pctOfWidth: Math.round(r.height / innerWidth * 100) }; });
  // the panel
  if (panelSel && scope) {
    const r = scope.getBoundingClientRect(), x = scope.querySelector('.ask-x'), f = scope.querySelector('footer, .pop-f'), b = scope.querySelector('.pop-b, .ask-log');
    out.panel = { w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom), close: x ? [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)] : null, footTop: f ? Math.round(f.getBoundingClientRect().top) : null, footH: f ? Math.round(f.getBoundingClientRect().height) : null, bodyH: b ? Math.round(b.getBoundingClientRect().height) : null, navOver: nav ? (() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight - 10); return !!(e && nav.contains(e)); })() : false, insetBottom: getComputedStyle(f || scope).paddingBottom };
  }
  // bars
  if (nav) { const links = [...nav.querySelectorAll('a')].filter(seen); out.nav = { tabs: links.length, h: Math.round(nav.getBoundingClientRect().height), tabW: links.map(a => Math.round(a.getBoundingClientRect().width)), label: links.map(a => parseFloat(getComputedStyle(a).fontSize)), truncated: links.filter(a => a.scrollWidth > a.clientWidth + 1).map(a => a.innerText.trim()), iconH: links[0] && links[0].querySelector('svg') ? Math.round(links[0].querySelector('svg').getBoundingClientRect().height) : null, navOverflow: nav.scrollWidth - nav.clientWidth }; }
  const mast = document.querySelector('.mast'); if (mast) out.mastH = Math.round(mast.getBoundingClientRect().height);
  return out;
};
(async () => {
  const port = 4100 + Math.floor(Math.random() * 90), hash = bcrypt.hashSync('pw12345678', 8);
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `theran:${hash}:admin`, SESSION_SECRET: 'x'.repeat(32), ANTHROPIC_API_KEY: '', DATABASE_URL: '' } });
  await new Promise(ok => server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }));
  const base = `http://localhost:${port}`, browser = await chromium.launch(), all = {};
  try {
    for (const [w, h, name] of SIZES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage(); page.setDefaultTimeout(45000); page.setDefaultNavigationTimeout(120000);
      const errs = []; page.on('pageerror', e => errs.push(e.message));
      await page.goto(base + '/login'); await page.fill('input[name=name]', 'theran'); await page.fill('input[name=password]', 'pw12345678'); await Promise.all([page.waitForNavigation(), page.click('button')]);
      await page.evaluate(() => { try { const d = new Date().toISOString().slice(0, 10); localStorage.setItem('r4-intro-day', d); for (const k of ['r4-home-played', 'r4-accounts-played', 'r4-ops-played', 'r4-opps-played', 'r4-warehouse-played']) sessionStorage.setItem(k, '1'); } catch (e) {} });
      all[name] = {};
      for (const [key, hash2, sel, act, panel] of VIEWS) {
        try {
          await page.goto('about:blank'); await page.goto(base + '/' + hash2); await page.waitForSelector(sel, { state: 'attached' }); await wait(1300);
          if (act) for (const b of await page.$$('.ph-fold:not(.open) > .ph-show')) { if (await b.evaluate((e, q) => !!e.parentElement.querySelector(q), sel)) await b.click(); }
          if (act) { await act(page); await wait(900); }
          all[name][key] = await page.evaluate(measure, panel || null);
          const file = path.join(OUT, `${TAG ? TAG + '-' : ''}${key}-${w}.png`);
          if (panel) await page.screenshot({ path: file });
          else { for (let y = 0, H = await page.evaluate(() => document.documentElement.scrollHeight); y < H; y += 500) { await page.evaluate(v => scrollTo(0, v), y); await wait(120); } await page.evaluate(() => scrollTo(0, 0)); await page.addStyleTag({ content: '.mast{position:static!important} @media(max-width:700px){#nav{position:absolute!important;top:0;bottom:auto!important;display:none!important}}' }); await page.screenshot({ path: file, fullPage: true }); }
        } catch (e) { all[name][key] = { error: e.message.slice(0, 160) }; }
        console.log(`${name} ${key}: ${all[name][key].error || `${all[name][key].screens} screens, over ${all[name][key].over}, past edge ${all[name][key].past} ${(all[name][key].pastEg || []).join(' ')}, ${all[name][key].under44.reduce((t, x) => t + x.n, 0)} small targets`}`);
      }
      all[name].errors = errs;
      await ctx.close();
    }
  } finally { await browser.close(); server.kill(); }
  fs.writeFileSync(path.join(OUT, `${TAG ? TAG + '-' : ''}measures.json`), JSON.stringify(all, null, 1));
  // nothing scrolls sideways or runs past the edge, at any size
  const sideways = Object.entries(all).flatMap(([n, vs]) => Object.entries(vs).filter(([, x]) => x && (x.over > 0 || x.past > 0)).map(([v]) => `${n} ${v}`));
  if (sideways.length) { console.log('FAIL past the edge: ' + sideways.join(', ')); process.exitCode = 1; }
})().catch(e => { console.error(e); process.exit(1); });
