// Every tour, end to end, in a real browser at desk and phone, on fixtures: fails if a step is skipped because its target is gone, or if
// the cut-out or card lands off screen. Screenshots of each step with --shots=<folder>. Also: "Don't show again" holds after signing out
// and in a second browser; users can be added, switched off and given a new password; a non-admin cannot reach Settings or the users API.
// Uses throwaway users, and leaves the local store as it found it.
//   DATABASE_URL= node scripts/tour_check.cjs [--shots=folder]
const { spawn } = require('child_process'), path = require('path'), fs = require('fs'), ROOT = path.join(__dirname, '..');
const bcrypt = require(path.join(ROOT, 'node_modules/bcryptjs')), { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const shots = (process.argv.find(a => a.startsWith('--shots=')) || '').slice(8);
const KEEP = ['user_state.json', 'users.json'].map(f => path.join(ROOT, 'data', f)).map(f => [f, fs.existsSync(f) ? fs.readFileSync(f) : null]);
if (shots) fs.mkdirSync(shots, { recursive: true });
let bad = 0;
const fail = m => { bad++; console.log('FAIL ' + m); };
(async () => {
  for (const [f, v] of KEEP) if (v) fs.unlinkSync(f);
  const port = 3950 + Math.floor(Math.random() * 40), hash = bcrypt.hashSync('pw12345678', 8);
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `tourdesk:${hash}:admin,tourphone:${hash}:billing,tourone:${hash}:owner`, SESSION_SECRET: 'x'.repeat(32), ANTHROPIC_API_KEY: '', DATABASE_URL: '' } });
  await new Promise(ok => server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }));
  const base = `http://localhost:${port}`, browser = await chromium.launch();
  const signIn = async (who, w, h, pass = 'pw12345678') => { const ctx = await browser.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage(); p.setDefaultTimeout(45000); p.setDefaultNavigationTimeout(120000); p.errs = []; p.warns = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'warning' && m.text().startsWith('tour:')) { p.warns.push(m.text()); console.log('  ' + m.text()); } }); await p.goto(base + '/login'); await p.fill('input[name=name]', who); await p.fill('input[name=password]', pass); await Promise.all([p.waitForNavigation(), p.click('button')]); await p.evaluate(() => { try { localStorage.setItem('r4-intro-day', new Date().toISOString().slice(0, 10)); } catch (e) {} }); return p; };
  const readStep = p => p.evaluate(() => { const r = document.querySelector('#tr-rect'), t = document.querySelector('.tr-tip').getBoundingClientRect(), n = { x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') }; return { count: document.querySelector('#tr-c').textContent, title: document.querySelector('#tr-h').textContent, hash: location.hash, hole: n, tip: { l: t.left, t: t.top, r: t.right, b: t.bottom }, W: innerWidth, H: innerHeight, over: document.documentElement.scrollWidth - innerWidth }; });
  try {
    for (const [name, who, w, h, fullN] of [['desk', 'tourdesk', 1440, 900, 10], ['phone', 'tourphone', 390, 844, 9]]) {
      const p = await signIn(who, w, h);
      for (const tour of ['full', 'quote', 'account']) {
        await p.goto('about:blank'); await p.goto(base + '/?welcome=1#pulse'); await p.waitForSelector('#mast-help'); await p.waitForTimeout(2500); if (!(await p.$('.wl'))) await p.click('#mast-help'); await p.waitForSelector('.wl'); await p.waitForTimeout(500);
        if (tour === 'full') { console.log(name, 'welcome:', await p.$eval('.wl', e => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} of ${innerWidth}x${innerHeight}, focus on ${document.activeElement.className.slice(0, 20)}`; })); if (shots) await p.screenshot({ path: path.join(shots, `${name}-welcome.png`) }); }
        await p.click(`[data-tour-start=${tour}]`);
        let n = 0;
        for (;;) {
          await p.waitForFunction(() => { const u = document.querySelector('.tr-wrap'); return !u || !u.classList.contains('moving'); }); await p.waitForTimeout(900);
          if (!(await p.$('.tr-wrap'))) break;
          const s = await readStep(p); n++;
          console.log(`  ${name} ${tour} ${s.count}: ${s.title} | ${s.hash} | hole ${Math.round(s.hole.x)},${Math.round(s.hole.y)} ${Math.round(s.hole.w)}x${Math.round(s.hole.h)}`);
          if (s.tip.l < 0 || s.tip.r > s.W + 1 || s.tip.t < 0 || s.tip.b > s.H + 1) fail(`${name} ${tour} ${s.count}: card off screen ${JSON.stringify(s.tip)}`);
          if (s.hole.y + s.hole.h < 0 || s.hole.y > s.H || s.hole.h < 10) fail(`${name} ${tour} ${s.count}: cut-out off screen ${JSON.stringify(s.hole)}`);
          if (s.over > 0) fail(`${name} ${tour} ${s.count}: page scrolls sideways by ${s.over}`);
          if (shots) await p.screenshot({ path: path.join(shots, `${name}-${tour}-${String(n).padStart(2, '0')}.png`) });
          await p.keyboard.press('ArrowRight');
        }
        const want = tour === 'full' ? fullN : tour === 'quote' ? 4 : 3;
        if (n !== want) fail(`${name} ${tour}: ${n} of ${want} steps ran`);
      }
      if (p.warns.length) fail(`${name}: skipped ${p.warns.join('; ')}`);
      if (p.errs.length) fail(`${name}: ${p.errs.join('; ')}`);
      await p.click('#mast-help'); await p.waitForSelector('.wl'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      if (await p.$('.wl')) fail(`${name}: Esc did not close the welcome`);
      await p.click('#mast-help'); await p.waitForSelector('.wl'); await p.click('[data-tour-start=account]'); await p.waitForSelector('.tr-wrap:not(.moving)'); await p.waitForTimeout(600); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      if (await p.$('.tr-wrap')) fail(`${name}: Esc did not end the tour`);
      console.log(`  ${name} focus back on:`, await p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)));
      await p.context().close();
    }
    // Don't show again
    const a = await signIn('tourone', 1280, 800);
    await a.goto(base + '/?welcome=1#pulse'); await a.waitForSelector('.wl');
    await a.click('#wl-skip'); await a.waitForTimeout(300);
    await a.goto('about:blank'); await a.goto(base + '/?welcome=1#pulse'); await a.waitForSelector('.wl');
    await a.check('#wl-never'); await a.click('#wl-skip'); await a.waitForTimeout(500);
    if ((await a.evaluate(async () => (await (await fetch('/api/me')).json()).welcome)) !== 1) fail("Don't show again did not save");
    await a.evaluate(() => { const f = document.createElement('form'); f.method = 'post'; f.action = '/logout'; document.body.appendChild(f); f.submit(); }); await a.waitForURL('**/login');
    await a.fill('input[name=name]', 'tourone'); await a.fill('input[name=password]', 'pw12345678'); await Promise.all([a.waitForNavigation(), a.click('button')]);
    await a.goto('about:blank'); await a.goto(base + '/?welcome=1#pulse'); await a.waitForTimeout(2500);
    if (await a.$('.wl')) fail('the welcome came back after signing out');
    const b = await signIn('tourone', 390, 844);
    await b.goto(base + '/?welcome=1#pulse'); await b.waitForTimeout(2500);
    if (await b.$('.wl')) fail('the welcome came back in a second browser');
    await b.click('#mast-help'); await b.waitForSelector('.wl');
    console.log("Don't show again: held after sign-out and in a second browser; ? still opens it");

    // who sees what
    const code = (p, url, body) => p.evaluate(async ([u, x]) => (await fetch(u, x ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(x) } : {})).status, [url, body]);
    await a.goto('about:blank'); await a.goto(base + '/#customers?view=overview'); await a.waitForSelector('.dt-t tbody tr[data-i]'); await a.waitForTimeout(800);
    console.log('non-admin: margin pills', await a.$$eval('.dt-t button.rag', e => e.length), '| gear visible', await a.$eval('.mast-gear', e => !e.hidden && e.offsetParent !== null), '| users API', await code(a, '/api/users'), '| new user', await code(a, '/api/users', { name: 'nope', password: 'long-enough-pw', role: 'admin' }), '| settings', await code(a, '/api/settings', { key: 'mph', value: 21 }));
    if (!(await a.$$eval('.dt-t button.rag', e => e.length))) fail('a non-admin should see margins');
    if ((await code(a, '/api/users')) !== 403) fail('a non-admin reached the users API');
    if ((await code(a, '/api/settings', { key: 'mph', value: 21 })) !== 403) fail('a non-admin changed a setting');
    await a.goto(base + '/#settings'); await a.waitForTimeout(1500);
    if (await a.evaluate(() => location.hash === '#settings' && !!document.querySelector('.st'))) fail('a non-admin opened Settings');

    // users, as an admin
    const ad = await signIn('tourdesk', 1280, 900);
    await ad.goto('about:blank'); await ad.goto(base + '/#settings'); await ad.waitForSelector('.us-row');
    await ad.locator('#st-users').scrollIntoViewIfNeeded(); await ad.waitForTimeout(700); if (shots) await ad.screenshot({ path: path.join(shots, 'settings-users.png') });
    if (!(await ad.$('.us-row[data-u=tourone] [data-rewelcome]'))) fail('no way to show the welcome again');
    await ad.click('.us-row[data-u=tourone] [data-rewelcome]'); await ad.waitForTimeout(500);
    await a.goto('about:blank'); await a.goto(base + '/?welcome=1#pulse'); await a.waitForSelector('.wl', { timeout: 30000 });
    console.log('show welcome again: it came back for that person; message:', await ad.$eval('.us-msg', e => e.textContent));
    await a.click('#wl-skip');
    await ad.fill('.us-add [name=name]', 'newperson'); await ad.fill('.us-add [name=password]', 'a-new-password'); await ad.click('.us-add button'); await ad.waitForSelector('.us-row[data-u=newperson]');
    const np = await signIn('newperson', 1280, 800, 'a-new-password');
    console.log('added user signs in:', (await np.evaluate(async () => (await (await fetch('/api/me')).json()).name)), '| API shows no hash:', !JSON.stringify(await ad.evaluate(async () => (await fetch('/api/users')).json())).includes('$2'));
    await ad.locator('.us-row[data-u=newperson] [data-pass]').fill('short'); await ad.locator('.us-row[data-u=newperson] [data-set]').click(); await ad.waitForTimeout(400);
    console.log('short password:', await ad.$eval('.us-msg', e => e.textContent));
    await ad.locator('.us-row[data-u=newperson] [data-pass]').fill('another-password'); await ad.locator('.us-row[data-u=newperson] [data-set]').click(); await ad.waitForTimeout(700);
    if ((await np.evaluate(async () => (await fetch('/api/me')).status)) !== 401) fail('changing a password did not sign that person out');
    await ad.locator('.us-row[data-u=newperson] [data-active]').click(); await ad.waitForTimeout(500);
    const off = await (await browser.newContext()).newPage(); await off.goto(base + '/login'); await off.fill('input[name=name]', 'newperson'); await off.fill('input[name=password]', 'another-password'); await off.click('button'); await off.waitForTimeout(500);
    if (!/do not match/.test(await off.content())) fail('a switched-off user signed in');
    const self = await ad.evaluate(async () => (await fetch('/api/users/tourdesk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) })).status);
    if (self !== 400) fail('an admin switched themself off');
    console.log('users: add, new password signs out, switch off, and you cannot switch yourself off: done');
  } finally { await browser.close(); server.kill(); for (const [f, v] of KEEP) { if (v) fs.writeFileSync(f, v); else if (fs.existsSync(f)) fs.unlinkSync(f); } }
  console.log(bad ? `\n${bad} failed` : '\nall passed');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
