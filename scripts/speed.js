// How long each screen takes, as a phone would see it. Run against a running app (npm run dev):
//   node scripts/speed.js [http://localhost:3001] [name] [password]
// Two profiles: typical 4G (9 Mbps, 60 ms, 2× slower processor) and a poor connection (1.6 Mbps,
// 150 ms, 4×). Each screen is loaded cold. Target (31 October 2026): every screen drawn under 1.5 s on 4G.
'use strict';
const [, , base = 'http://localhost:3001', name = process.env.SPEED_USER || 'theran', pass = process.env.SPEED_PASS || ''] = process.argv;
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('playwright-core')); }
const SCREENS = ['pulse', 'customers', 'customer/3507', 'pricing', 'activity'];
const PROFILES = [['4G', 60, 9e6, 2], ['poor', 150, 1.6e6, 4]];

(async () => {
  if (!pass) { console.log('Pass the password: node scripts/speed.js <url> <name> <password>'); process.exit(1); }
  const fs = require('fs');
  const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;   // the cloud container's browser; on a PC, Playwright's own
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  for (const [label, latency, bps, cpu] of PROFILES) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(base + '/login'); await p.fill('input[name=name]', name); await p.fill('input[name=password]', pass);
    await Promise.all([p.waitForNavigation(), p.click('button')]);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: bps / 8, uploadThroughput: bps / 24 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const out = [];
    for (const s of SCREENS) {
      await cdp.send('Network.clearBrowserCache');
      const t = Date.now();
      await p.goto(`${base}/#${s}`); await p.reload();
      await p.waitForFunction(() => { const m = document.querySelector('#main'); return m && !m.querySelector('.loading') && m.children.length > 0; }, null, { timeout: 60000 });
      out.push(`${s} ${((Date.now() - t) / 1000).toFixed(1)}s`);
    }
    console.log(`${label.padEnd(5)} ${out.join(' · ')}`);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
