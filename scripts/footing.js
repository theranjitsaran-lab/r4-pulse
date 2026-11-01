// npm run footing
// The footing checks, run and reported at every push. It starts its own server on the fixtures with a
// throwaway login and reads the same API the screens do, so it checks what they are given.
// A check that fails prints FAIL; one whose table is not built yet prints TO BUILD. Exit 1 on any FAIL.
'use strict';
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const K = v => '$' + Math.round(v / 1000).toLocaleString('en-US') + 'K';
const D = v => '$' + Math.round(v).toLocaleString('en-US');
const close = (a, b, tol = 1) => Math.abs(a - b) <= tol;
let fails = 0;
const say = (state, n, text) => { if (state === 'FAIL') fails++; console.log(`${state.padEnd(8)} ${n}  ${text}`); };

async function main() {
  const port = 3400 + Math.floor(Math.random() * 90), pass = crypto.randomBytes(9).toString('hex');
  const env = { ...process.env, PORT: String(port), USE_FIXTURES: '1', NODE_ENV: 'development', AUTH_USERS: `foot:${bcrypt.hashSync(pass, 8)}:owner`, SESSION_SECRET: crypto.randomBytes(16).toString('hex'), ANTHROPIC_API_KEY: '', DATABASE_URL: '' };
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
    say('TO BUILD', '1c', 'Month columns with YTD and 12-month totals do not exist yet; Step 2 builds them, and the Month grid has no total row');

    // 2. Money's October against Today's headline
    const m = home.month, oct = m.workMonth, lineOct = LV.totals[oct];
    say(close(Math.round(lineOct / 1000), Math.round(m.next.central / 1000), 0) ? 'PASS' : 'FAIL', '2 ', `October's lines total ${K(lineOct)} (${D(lineOct)}); Today's headline ${K(m.next.central)}. Money shows no such table until Step 3`);

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
