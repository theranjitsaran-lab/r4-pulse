// One figure, one source: anything shown on two screens must be the same number. Each test here names
// a contradiction found walking the live app (fix list, November 2026).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const J = n => require(`../fixtures/${n}.json`).data;
const R = require('../model/rates');
const D = () => ({ P: J('pulse'), A: J('activity'), C: J('customers'), M: J('margin'), PR: J('pricing'), CA: J('calls'), S: J('storage'), SG: J('segments'), LW: J('linework'), R, Z: require('../public/data/zcta.json') });

test('#20 shredding: Opportunities, Warehouse and Home count the same boxes for an account', async () => {
  const { opportunities } = await import('../public/components/opps.js');
  const { destructionView } = await import('../public/components/home2data.js');
  const d = D(), home = destructionView(d, 400), opp = opportunities(d, {}).rows.filter(r => r.kind === 'overdue');
  const byId = new Map(home.rows.map(r => [r.level1, r]));
  assert.ok(opp.length > 10);
  for (const o of opp) { const h = byId.get(o.level1); assert.ok(h, `${o.name} only on Opportunities`); assert.ok(Math.abs(o.value - h.fee) < 0.5, `${o.name}: ${o.value} against ${h.fee}`); }
});

test('#3 a move always says it is the total, and the service part is named as such', async () => {
  const { moveReason } = await import('../public/components/series.js');
  const t = moveReason({ d: -35000, dService: -33000, dStorage: -2000 }, v => '$' + Math.round(v / 1000) + 'K');
  assert.match(t, /down \$35K a month in total/);
  assert.match(t, /service down \$33K/);
});

test('#28 Anne\'s figure is the one her sentence quotes, a year', async () => {
  const { anneList } = await import('../public/components/lists.js');
  const d = D(), { calls } = anneList({ ...d, log: [], feedback: [], changes: { items: [] }, n: 10 });
  for (const c of calls) assert.equal(c.stake, c.sigs[0].stake, c.name);
});

test('#6 cross-sell in the briefing is a monthly figure, never a year', async () => {
  const { homeView } = await import('../public/components/home2data.js');
  const p = homeView(D()).points.find(x => x.key === 'cross');
  assert.doesNotMatch(p.say, /a year/);
  assert.match(p.say, /a month/);
});

test('#31 Numbers and Home read one gap', async () => {
  const { homeView, monthView } = await import('../public/components/home2data.js');
  const d = D();
  assert.equal(monthView(d).gap, homeView(d).month.gap);
});

test('#4 normal: one figure for a day, one for a route, each named', async () => {
  const { normalForDay, routeNorms, LABELS } = await import('../public/components/metrics.js');
  const { daySentence } = await import('../public/components/changes.js');
  const d = D(), date = d.A.latestDone, n = normalForDay(d.P, d.A, date);
  assert.ok(n > 0);
  assert.equal(daySentence(d.P, d.A, date).median, n);
  assert.match(daySentence(d.P, d.A, date).text, /normal for a /);
  assert.match(LABELS.normalRoute, /normal for this route/);
  const norms = routeNorms(d.A, date), r = d.A.routeDays.find(x => x.date === date && x.services_done > 0 && norms[x.route]);
  assert.ok(norms[r.route].done > 0);
});

test('#35 Mike is shown the next working day with work on it', async () => {
  const { bookedNext } = await import('../public/components/lists.js');
  const A = { latestDone: '2026-10-30', routeDays: [
    { date: '2026-10-31', route: '--', services: 3, customers: 1 },
    { date: '2026-11-02', route: 'MARK', services: 113, customers: 9 }] };
  const n = bookedNext(A);
  assert.equal(n.date, '2026-11-02');
  assert.equal(n.services, 113);
});

test('#37 a postcode\'s visits are the twelve-month count on every screen', async () => {
  const { densityView } = await import('../public/components/home2data.js');
  const d = D(), v = densityView(d), book = new Map(d.A.postcodes.map(p => [p.postcode, p.visits]));
  for (const r of v.save) assert.equal(r.visits, book.get(r.postcode), r.postcode);
});

test('#10 the stamp turns amber when the feed is held back a working day, and not over a weekend', async () => {
  const { freshStamp } = await import('../public/components/metrics.js');
  assert.equal(freshStamp({ done_work: '2026-10-30' }, '2026-11-01').late, false, 'Sunday: Friday is the last working day');
  assert.equal(freshStamp({ done_work: '2026-10-30' }, '2026-11-02').late, false, 'Monday: Friday is the last working day');
  const held = freshStamp({ done_work: '2026-10-30' }, '2026-11-03');
  assert.equal(held.late, true, 'Tuesday: Monday is missing');
  assert.match(held.text, /Veri-Shred/);
});

test('#19 a briefing point has to be worth about $25K a year', async () => {
  const { pointsView, monthView, customerView, crossSellView, densityView } = await import('../public/components/home2data.js');
  const d = D(), dens = densityView(d), args = { month: monthView(d), cust: customerView(d), cross: crossSellView(d), lines: null };
  assert.ok(pointsView(d, { ...args, dens: { ...dens, save: [{ ...dens.save[0], saving: 4000 }] } }).every(p => p.key !== 'location'));
  assert.ok(pointsView(d, { ...args, dens: { ...dens, save: [{ ...dens.save[0], saving: 30000 }] } }).some(p => p.key === 'location'));
});

test('#25 a session is a signed cookie: it survives a restart, and a forged one is refused', async () => {
  process.env.SESSION_SECRET = 'test-secret'; process.env.AUTH_USERS = `a:${require('bcryptjs').hashSync('p', 4)}:owner`;
  const express = require('express'), auth = require('../server/auth');
  const start = () => new Promise(ok => { const app = express(); app.use(express.urlencoded({ extended: false })); auth.install(app); app.get('/who', (q, r) => r.json(q.session.user)); const s = app.listen(0, () => ok(s)); });
  const s1 = await start(), url = s => `http://localhost:${s.address().port}`;
  const login = await fetch(url(s1) + '/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=a&password=p' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  s1.close();
  const s2 = await start();   // a restart: nothing kept on the server
  assert.equal((await (await fetch(url(s2) + '/who', { headers: { cookie } })).json()).role, 'owner');
  const forged = await fetch(url(s2) + '/who', { redirect: 'manual', headers: { cookie: cookie.slice(0, -3) + 'abc' } });
  assert.equal(forged.status, 302);
  s2.close();
});

test('tie-out: holds when the invoices add up to the figure, and says so when they have moved', async () => {
  const { tieOut } = await import('../public/components/metrics.js');
  const row = { month: '2026-10-01', invoices: 3967, storage: 387101.22, service: 275471.45, citadel: 24351.77 };
  const moved = tieOut({ monthly: [{ month: '2026-10-01', core: 632377.01 }], tieout: [row] });
  assert.equal(moved.ok, false);
  assert.ok(Math.abs(moved.moved - 5843.89) < 0.01);
  assert.equal(tieOut({ monthly: [{ month: '2026-10-01', core: 638220.9 }], tieout: [row] }).ok, true);
  assert.equal(tieOut({ monthly: [{ month: '2026-10-01', core: 1 }], tieout: [] }), null);
});

test('an account\'s invoices add up to the month shown for it', () => {
  const { rows } = J('invoices'), C = J('customers');
  let checked = 0;
  for (const r of rows) {
    const a = C.accounts.find(x => x.level1 === r.level1), i = C.months.indexOf(r.month);
    if (!a || i < 0) continue;
    const shown = a.storage[i] + a.service[i];
    assert.ok(Math.abs(r.total - shown) < 1, `${a.customer} ${r.month}: invoices ${r.total}, shown ${shown}`);
    checked++;
  }
  assert.ok(checked > 10, `only ${checked} checked`);
});

test('the row total is the headline for the month picked, and the picker opens on the latest closed month', async () => {
  const { lineView, closedMonth } = await import('../public/components/linework.js');
  const { monthView } = await import('../public/components/home2data.js');
  const d = D(), L = lineView(d);
  for (const m of L.pick) {
    const sum = L.rows.reduce((t, r) => t + r.by[m].v, 0);
    assert.ok(Math.abs(sum - L.totals[m]) < 0.5, m);
  }
  const open = closedMonth(L), mv = monthView(d);
  assert.ok(!L.meta[open].partial, 'never opens on a month in progress');
  if (open === mv.workMonth) assert.ok(Math.abs(L.totals[open] - mv.next.central) < 1, `${L.totals[open]} against ${mv.next.central}`);
  assert.equal(closedMonth({ pick: ['2026-09-01', '2026-10-01', '2026-11-01'], latest: '2026-11-01', meta: { '2026-09-01': {}, '2026-10-01': {}, '2026-11-01': { partial: true } } }), '2026-10-01');
});

test('three things to act on: what changed first, each with its owner and where it opens', async () => {
  const { topActions } = await import('../public/components/metrics.js');
  const a = topActions({ lines: [{ owner: 'mike', text: 'x', key: 'route', subject: 'route:MARK' }], calls: [{ level1: 8153, name: 'City of Chicago', ev: 'down $35K a month in total (service down $33K) over the last three months, against its own run' }, { level1: 1, name: 'A', ev: 'y' }, { level1: 2, name: 'B', ev: 'z' }] });
  assert.equal(a.length, 3);
  assert.equal(a[0].href, '#activity');
  assert.equal(a[1].text, 'City of Chicago: down $35K a month in total');
  assert.equal(a[1].href, '#customer/8153');
});

test('#22 each account once: the total counts its largest, one-offs apart, and is believable', async () => {
  const { opportunities, byAccount } = await import('../public/components/opps.js');
  const d = D(), { rows } = opportunities(d, {}), G = byAccount(rows);
  const ids = G.rows.map(a => a.level1);
  assert.equal(new Set(ids).size, ids.length, 'no account twice');
  assert.equal(G.rows.reduce((t, a) => t + a.items.length, 0), rows.length, 'nothing lost');
  const summed = rows.filter(r => !r.once).reduce((t, r) => t + r.value, 0);
  assert.ok(G.largest < summed, 'less than adding every row');
  assert.ok(G.largest < 0.3 * d.P.monthly.slice(-12).reduce((t, m) => t + m.core, 0), 'under 30% of a year of core');
  for (let i = 1; i < G.rows.length; i++) assert.ok(G.rows[i - 1].rank >= G.rows[i].rank, 'largest first');
});

test('#29 ITAD keeps its capitals; a huge multiple reads as new; #30 a one-off says how it ranks', async () => {
  const { opportunities } = await import('../public/components/opps.js');
  const { changeWord } = await import('../public/components/metrics.js');
  const { rows } = opportunities(D(), {});
  assert.ok(!rows.some(r => /\bitad\b/.test(r.reason + r.opener)));
  assert.ok(rows.filter(r => r.kind === 'overdue').every(r => /Ranked at 25%/.test(r.reason)));
  assert.equal(changeWord(90), 'new');
  assert.equal(changeWord(0.5, 200), 'new');
  assert.equal(changeWord(1.93), '▲ 193%');
  assert.equal(changeWord(-0.16), '▼ 16%');
  assert.equal(changeWord(0), '0%');
});

test('one table: filters and search narrow the rows, the total follows them, and the state survives the link', async () => {
  const { filterRows, sortRows, sumOf, toCsv, readState, stateQuery } = await import('../public/components/datatable.js');
  const rows = [{ n: 'Alpha', v: 10, big: false }, { n: 'Beta', v: 30, big: true }, { n: 'Gamma', v: 20, big: true }, { n: 'Delta, Inc', v: null, big: false }];
  const o = { search: r => r.n, filters: [{ k: 'b', test: (r, v) => r.big === (v === 'y') }] };
  const col = { k: 'v', l: 'Value', get: r => r.v };
  const big = filterRows(rows, o, { q: '', f: { b: 'y' } });
  assert.equal(big.length, 2);
  assert.equal(sumOf(big, col), 50, 'the total is the filtered rows, not all of them');
  assert.equal(filterRows(rows, o, { q: 'alp', f: {} }).length, 1);
  assert.deepEqual(sortRows(rows, col, -1).map(r => r.n), ['Beta', 'Gamma', 'Alpha', 'Delta, Inc'], 'empty values last');
  const csv = toCsv(rows, [{ l: 'Name', get: r => r.n }, col]);
  assert.match(csv, /"Delta, Inc",/, 'a comma is quoted');
  assert.equal(csv.split('\r\n').length, 5);
  const st = { q: 'alp', f: { b: 'y' }, sort: 'v', dir: 1, cols: ['v'] };
  const back = readState(Object.fromEntries(new URLSearchParams(stateQuery(st))), o);
  assert.deepEqual(back, st, 'the link carries it all');
  // two tables on one page keep to their own part of the link, and the rest of it stands
  const { withState } = await import('../public/components/datatable.js');
  const one = withState('#activity?tab=warehouse&n_q=old', { q: 'new', f: {}, sort: null, dir: -1, cols: null }, 'e_');
  assert.equal(one, '#activity?tab=warehouse&n_q=old&e_q=new');
  assert.equal(withState(one, { q: '', f: {}, sort: null, dir: -1, cols: null }, 'e_'), '#activity?tab=warehouse&n_q=old');
  assert.equal(withState('#customers?view=overview&f_line=bin', { q: '', f: {}, sort: null, dir: -1, cols: null }), '#customers?view=overview', 'a removed filter leaves the link');
});

test('#38 not billed: internal out, dormant apart by invoices rather than by name', async () => {
  const { splitNotBilled } = await import('../public/components/storage.js');
  const { isInternal } = await import('../public/components/metrics.js');
  const rows = [{ level1: 1, customer: 'West Suburban Hospital', gap: 100 }, { level1: 2, customer: 'R4 Services, Inc.', gap: 50 }, { level1: 3, customer: 'Bear Stearns', gap: 30 }, { level1: 0, customer: 'Account 0', gap: 20 }];
  const S = splitNotBilled(rows, new Map([[1, 39000], [3, 0]]), isInternal);
  assert.deepEqual(S.active.map(r => r.level1), [1]);
  assert.deepEqual(S.dormant.map(r => r.customer), ['Bear Stearns']);
  assert.deepEqual([S.activeBoxes, S.dormantBoxes, S.internalBoxes], [100, 30, 70]);
});

test('rule 3: a small base or a line that swings by nature reads in dollars', async () => {
  const { isLumpy } = await import('../public/components/metrics.js');
  assert.ok(isLumpy('itad', 500000));
  assert.ok(isLumpy('labour', 9000));
  assert.ok(!isLumpy('bin', 90000));
});

test('#36 internal and placeholder accounts are not customers', async () => {
  const { isInternal } = await import('../public/components/metrics.js');
  for (const n of ['R4 Services INC', 'R4 Services LLC', 'Single Invoice Customer', 'Account 0']) assert.ok(isInternal(n), n);
  for (const n of ['City of Chicago', 'R5 Holdings', 'Chapman & Cutler']) assert.ok(!isInternal(n), n);
});
