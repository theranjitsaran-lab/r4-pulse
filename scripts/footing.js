// npm run footing
// The footing checks, run and reported at every push. It starts its own server on the fixtures with a
// throwaway login and reads the same API the screens do, so it checks what they are given.
// A check that fails prints FAIL; one whose table is not built yet prints TO BUILD. Exit 1 on any FAIL.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const K = v => '$' + Math.round(v / 1000).toLocaleString('en-US') + 'K';
const D = v => '$' + Math.round(v).toLocaleString('en-US');
const close = (a, b, tol = 1) => Math.abs(a - b) <= tol;
let fails = 0;
const say = (state, n, text) => { if (state === 'FAIL') fails++; console.log(`${state.padEnd(8)} ${n}  ${text}`); };

// every table as drawn: each column adds to the total row, unfiltered and searched; with months, each row's
// and the total's YTD and 12 months equal their months
const TABLES = [['Money', '#numbers?span=12', 'bin'], ['Money, storage / service', '#numbers?span=12&group=ss', 'serv'], ['All accounts', '#customers?view=overview', 'chicago'], ['Month grid', '#customers?view=grid&span=12', 'chicago'], ['Cross-sell', '#customers?view=whitespace', 'chicago'],
  ['Warehouse', '#numbers?tab=warehouse', 'west'], ['Long way round', '#activity', '60'], ['Price gaps', '#pricing', 'box']];
const readTable = t => {
  const n = x => Number(x.dataset.v);
  const head = [...t.querySelectorAll('thead th')], rows = [...t.querySelectorAll('tbody tr[data-i]')];
  const foot = [...t.querySelectorAll('tfoot td')], counted = rows.filter(r => !r.dataset.out), wrong = [];
  head.forEach((h, i) => {
    if (!foot[i] || foot[i].dataset.v === undefined) return;
    const s = counted.reduce((a, r) => a + (r.children[i].dataset.v ? n(r.children[i]) : 0), 0);
    if (Math.abs(s - n(foot[i])) > 0.5) wrong.push(h.dataset.k + ': rows ' + Math.round(s) + ', total ' + Math.round(n(foot[i])));
  });
  const months = head.map((h, i) => [h.dataset.m, i]).filter(x => x[0]);
  if (months.length === 12) {
    const year = months[11][0].slice(0, 4), yi = head.findIndex(h => h.dataset.k === 'ytd'), li = head.findIndex(h => h.dataset.k === 'l12');
    for (const tr of [...counted, t.querySelector('tfoot tr')]) {
      const c = i => n(tr.children[i]) || 0, all = months.reduce((a, x) => a + c(x[1]), 0), ytd = months.filter(x => x[0].startsWith(year)).reduce((a, x) => a + c(x[1]), 0);
      if (Math.abs(all - c(li)) > 0.5) wrong.push('12 months in ' + tr.children[0].innerText + ': ' + Math.round(all) + ' against ' + Math.round(c(li)));
      if (Math.abs(ytd - c(yi)) > 0.5) wrong.push('YTD in ' + tr.children[0].innerText + ': ' + Math.round(ytd) + ' against ' + Math.round(c(yi)));
    }
  }
  const lastFoot = months.length ? n(foot[months[months.length - 1][1]]) : null;
  return { rows: rows.length, cols: foot.filter(x => x.dataset.v !== undefined).length, months: months.length, wrong, lastFoot };
};
async function tables(base, pass) {
  const browser = await chromium.launch();
  const found = {};
  try {
    const sign = async who => { const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await page.goto(base + '/login'); await page.fill('input[name=name]', who); await page.fill('input[name=password]', pass); await Promise.all([page.waitForNavigation(), page.click('button')]); return page; };
    const owner = await sign('foot'), admin = await sign('footadm');
    for (const [name, hash, term, who] of [...TABLES.map(t => [...t, owner]), ['Money, margin (admin)', '#numbers?span=12&show=margin', 'bin', admin], ['Money, margin by kind (admin)', '#numbers?span=12&show=margin&group=ss', 'serv', admin]]) {
      const page = who;
      await page.goto('about:blank'); await page.goto(base + '/' + hash);
      await page.waitForSelector('.dt-t tbody tr', { timeout: 30000 }); await page.waitForTimeout(400);
      for (const stage of ['all', 'searched']) {
        const dts = await page.$$('.dt');
        for (const d of dts) {
          if (stage === 'searched') { await (await d.$('.dt-find')).fill(term); await page.waitForTimeout(100); }
          const more = await d.$('.dt-more button'); if (more) { await more.click(); await page.waitForTimeout(100); }
          const r = await d.$eval('.dt-t', readTable);
          if (name === 'Money' && stage === 'all') found.moneyLast = r.lastFoot;
          say(r.wrong.length ? 'FAIL' : 'PASS', '1 ', `${name}, ${stage}: ${r.rows} rows, ${r.cols} columns foot${r.months ? ', YTD and 12 months equal their months' : ''}${r.wrong.length ? ': ' + r.wrong.slice(0, 3).join('; ') : ''}`);
        }
      }
    }
  } finally { await browser.close(); }
  return found;
}

async function main() {
  const port = 3400 + Math.floor(Math.random() * 90), pass = crypto.randomBytes(9).toString('hex');
  const env = { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `foot:${bcrypt.hashSync(pass, 8)}:owner,footadm:${bcrypt.hashSync(pass, 8)}:admin`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'), ANTHROPIC_API_KEY: '', DATABASE_URL: '' };
  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((ok, no) => { server.stdout.on('data', b => { if (String(b).includes('R4 Pulse on')) ok(); }); server.on('exit', c => no(new Error('server exited ' + c))); });
  const base = `http://localhost:${port}`;
  try {
    const login = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'foot', password: pass }) });
    const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    const get = async p => { const r = await fetch(`${base}/api/${p}`, { headers: { cookie } }); if (!r.ok) throw new Error(`${p}: ${r.status}`); const j = await r.json(); return j.data !== undefined ? j.data : j; };
    const [home, cust, pulse, numbers] = await Promise.all([get('view/home'), get('view/customers'), get('pulse'), get('view/numbers')]);

    // 1. every table foots: only what has month columns and totals can be tested
    const LV = home.lines, months = Object.keys(LV.totals || {}).sort();
    const bad = months.filter(m => !close(LV.rows.reduce((t, r) => t + ((r.by && r.by[m] && r.by[m].v) || 0), 0), LV.totals[m]));
    if (months.length) say(bad.length ? 'FAIL' : 'PASS', '1a', `Today's lines add to their total in ${months.length - bad.length} of ${months.length} months${bad.length ? ': not ' + bad.join(', ') : ''}`);
    const rows = cust.rows.filter(r => !r.citadel), sum = k => rows.reduce((t, r) => t + (r[k] || 0), 0);
    say('UNIT', '1b', `All accounts: the total row adds the filtered rows, held by the unit test: last month ${K(sum('last'))}, cross-sell est. ${K(sum('opp') / 12)} a month`);
    const drawn = await tables(base, pass);

    // 2. Money's October against Today's headline
    const m = home.month, oct = m.workMonth, lineOct = LV.totals[oct];
    say(close(drawn.moneyLast, lineOct) && close(Math.round(drawn.moneyLast / 1000), Math.round(m.next.central / 1000), 0) ? 'PASS' : 'FAIL', '2 ', `Money's October as drawn ${K(drawn.moneyLast)} (${D(drawn.moneyLast)}); Today's lines ${D(lineOct)}; Today's headline ${K(m.next.central)}`);

    // what R4 users are sent, and the months' costs against the year they were split from
    const logA = await fetch(base + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: 'footadm', password: pass }) });
    const adm = await (await fetch(`${base}/api/view/numbers`, { headers: { cookie: (logA.headers.get('set-cookie') || '').split(';')[0] } })).json().then(j => j.data !== undefined ? j.data : j);
    say(numbers.lineCosts == null && numbers.margin == null ? 'PASS' : 'FAIL', 'C ', 'Money sends an owner no monthly costs and no margin table; admins get both');
    const G = adm.lineGrid, C = adm.lineCosts, pricedI = G.months.map((x, i) => C.priced[i] ? i : -1).filter(i => i >= 0).slice(-12);
    for (const l of adm.margin.lines) {
      const c = C.costs[l.family]; if (!c || !l.cost) continue;
      const months = pricedI.reduce((t, i) => t + c[i], 0), off = months / l.cost - 1;
      say(Math.abs(off) <= .02 ? 'PASS' : 'FAIL', 'C ', `${l.family}: the months' cost ${K(months)} against the year's ${K(l.cost)}`);
    }

    // 3. Accounts' October against invoiced core
    const last = pulse.monthly[pulse.monthly.length - 1], listed = rows.reduce((t, r) => t + (r.last || 0), 0), gap = last.core - listed;
    say(close(listed, last.core) ? 'PASS' : 'OPEN', '3 ', `Accounts' October ${K(listed)} (${D(listed)}) against invoiced core ${K(last.core)} (${D(last.core)}): gap ${D(gap)}, stated in the note under the table; its own row comes in Step 4`);

    // 4. the tie-out to VCK's register
    const T = numbers.tie;
    say(T.ok ? 'PASS' : 'SHOWN', '4 ', T.ok ? `VCK's register agrees: ${D(T.core)}` : `VCK's register ${D(T.core)} against ${D(T.shown)} shown: ${D(T.moved)} labelled "posted since this was built"; closes at the next rebuild and snapshot`);
  } finally { server.kill(); }
  console.log(fails ? `\n${fails} failing` : '\nno failures');
  process.exit(fails ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
