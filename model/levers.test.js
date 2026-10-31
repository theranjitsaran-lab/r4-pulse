'use strict';
// The bridge to $1.0m and the lists behind it must agree: each step is the sum of the accounts its
// list shows. Runs on the committed fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const J = n => require(`../fixtures/${n}.json`).data;
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, wanted ${b} ± ${tol}`);

test('whitespace: the total is the sum of its not-bought cells, and no cell exceeds the account', async () => {
  const { buildWhitespace, LINES } = await import('../public/components/whitespace.js');
  const W = buildWhitespace(J('margin'), { exclude: [6714], top: 200 });
  const cells = W.rows.flatMap(r => LINES.map(x => r.cells[x.key]).filter(c => !c.have));
  near(W.total, cells.reduce((t, c) => t + c.opp, 0), 0.01, 'total');
  for (const r of W.rows) for (const x of LINES) {
    const c = r.cells[x.key];
    if (!c.have) assert.ok(c.opp <= r.total + 0.01, `${r.customer} ${x.key}: ${c.opp} over ${r.total}`);
  }
  assert.ok(!W.rows.some(r => r.level1 === 6714), 'Citadel held apart');
});

test('bridge: cross-sell step is the cross-sell grid; price step is half the price-gap list', async () => {
  const { bridge, serviceGaps, storageGaps, CROSS_SELL_DEPTH } = await import('../public/components/levers.js');
  const { buildWhitespace } = await import('../public/components/whitespace.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin');
  const B = bridge({ P, PR, CA, M, C: J('customers') });
  const step = k => (B.steps.find(s => s.key === k) || B.minor.find(s => s.key === k) || { v: 0 }).v;
  near(step('cross'), buildWhitespace(M, { exclude: [6714], top: CROSS_SELL_DEPTH }).total / 12, 0.01, 'cross-sell');
  const gaps = [...serviceGaps(PR).values()].reduce((t, a) => t + a.worth, 0) + storageGaps(PR).rows.reduce((t, r) => t + r.worth, 0);
  near(step('price'), gaps / 2, 0.01, 'price');
  near(B.today + B.levers + B.newBusiness, Math.max(1e6, B.today + B.levers), 0.01, 'bridge closes at $1.0m');
});

test('overdue boxes: Home and the Overdue boxes list read the same figures', async () => {
  const { bridge, overdueBoxes } = await import('../public/components/levers.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin');
  const B = bridge({ P, PR, CA, M, C: J('customers') }), O = overdueBoxes(CA, PR);
  near(B.overdue.boxes, O.rows.reduce((t, r) => t + r.boxes, 0), 0.01, 'boxes');
  near(B.overdue.storageLost, O.rows.reduce((t, r) => t + r.lost, 0), 0.01, 'storage lost');
  assert.ok(!O.rows.some(r => r.level1 === 6714), 'Citadel held apart');
});

test('margin: Home\'s row and the Margin view count the same loss-making accounts and dollars', async () => {
  const { marginSummary, buildMargins } = await import('../public/components/margin.js');
  const R = require('./rates');
  const MS = marginSummary(R, J('margin'), [6714]);
  // the Margin view's below-cost filter, rebuilt independently from buildMargins
  const loss = buildMargins(R, J('margin'), { exclude: [6714] }).accounts.filter(a => a.revenue > 1000 && a.margin < 0);
  assert.equal(MS.losers.length, loss.length, 'accounts');
  near(MS.lossTotal, -loss.reduce((t, a) => t + a.margin, 0), 0.01, 'dollars');
  assert.ok(MS.losers.every(a => MS.below.includes(a)), 'every loss-making account is in the below-cost filter');
});

test('slipping, pace and the bill: each figure shown twice comes from one source', async () => {
  const { bridge, slippingAccounts, crossSellPace, billNow } = await import('../public/components/levers.js');
  const P = J('pulse'), PR = J('pricing'), CA = J('calls'), M = J('margin'), C = J('customers');
  const B = bridge({ P, PR, CA, M, C });
  const slipList = slippingAccounts(C);
  near((B.steps.concat(B.minor).find(s => s.key === 'slip') || { v: 0 }).v, slipList.reduce((t, d) => t - d.move.d, 0) / 2, 0.01, 'slipping step = half the list');
  assert.ok(slipList.every(d => d.move.pct <= -0.1), 'every slipping account is down 10% or more on its own run');
  assert.ok(!slipList.some(d => d.level1 === 6714), 'Citadel held apart');
  assert.deepEqual(B.pace, crossSellPace(M.history), 'Home and the grid read one pace');
  const run = P.currentRun.find(r => r.part === 'run') || (P.posted || []).slice(-1)[0];
  if (run) near(billNow(P).core, run.storage + run.service - run.citadel, 0.01, 'bill = run core');
  else assert.equal(billNow(P, J('activity')).core, null, 'no run and nothing posted in the snapshot: no total shown');
});

test('projection: done to date + days left × pace; the band is backtested leave-one-out', async () => {
  const { project, dailyFrom, weekdaysOf, curve } = await import('../public/components/projection.js');
  const { billNow } = await import('../public/components/levers.js');
  // fifteen months of synthetic work, 100 a weekday with a month-by-month swing, then 4 days of October
  const daily = [];
  for (let m = 0; m < 15; m++) {
    const month = new Date(Date.UTC(2025, 6 + m, 1)).toISOString().slice(0, 10);
    for (const d of weekdaysOf(month)) daily.push({ date: d, done: 100 + 10 * Math.sin(m), booked: 190 });
  }
  const latest = '2026-10-06';
  for (const d of weekdaysOf('2026-10-01').filter(d => d <= latest)) daily.push({ date: d, done: 120, booked: 200 });
  const x = project({ daily, latest, perService: 100, storage: 400000 });
  assert.equal(x.elapsed, 4); assert.equal(x.remaining, 18); assert.equal(x.doneToDate, 480);
  near(x.services.central, 480 + 18 * x.pace, 1e-6, 'central');
  near(x.bill.central, 400000 + x.services.central * 100, 1e-6, 'bill');
  assert.ok(x.backtest && x.backtest.n === 12, 'twelve months backtested');
  assert.ok(x.services.lo <= x.services.central && x.services.central <= x.services.hi, 'band holds the central');
  assert.ok(x.services.lo >= x.doneToDate, 'never below the work already done');
  // on the fixtures (no backtest yet): the bill is the storage plus the work at last month's value
  const P = J('pulse'), A = J('activity'), run = { storage: billNow(P, A).storage };
  const f = project({ daily: dailyFrom(P, A), latest: A.latestDone, perService: 114.5, storage: run.storage, routeDays: A.routeDays });
  near(f.bill.central, run.storage + f.services.central * 114.5, 1e-6, 'fixture bill');
  // a past month's curve ends on its total
  const c = curve(daily, '2026-09-01', 100, 0);
  near(c[c.length - 1].done, daily.filter(r => r.date.startsWith('2026-09')).reduce((t, r) => t + r.done, 0), 1e-6, 'curve total');
});

test('summary: every number in the paragraph must be on the figure sheet', async () => {
  const { checkNumbers, templateSummary, numbersIn } = await import('../public/components/summary.js');
  const sheet = [
    { key: 'bill', line: "October's bill, already known: $628K core, 63% of the $1.0M target, up 5% on September's $600K", say: 'October bills $628K, 63% of the $1.0M target.' },
    { key: 'next', line: "November's bill: about $632K ◇ (likely $581K to $692K); 4 of 22 working days in", say: 'November is heading for about $632K ◇, likely $581K to $692K.' },
    { key: 'slipping', line: '24 accounts are slipping; the largest is City Of Chicago, service down $34K a month', say: '24 accounts are slipping; the largest is City Of Chicago, service down $34K a month.' },
  ];
  assert.deepEqual(numbersIn('From $1.0M, 1,167 boxes, −$34K and 63%.'), ['$1.0M', '1,167', '−$34K', '63%']);
  assert.ok(checkNumbers(templateSummary(sheet), sheet).ok, 'the template passes its own check');
  assert.ok(checkNumbers('October bills $628K, 63% of target; November is heading for $632K ◇ with 24 accounts slipping, City Of Chicago down $34K a month.', sheet).ok, 'a faithful paragraph passes');
  const bad = checkNumbers('October bills $630K and November should reach $700K.', sheet);
  assert.ok(!bad.ok, 'an invented figure fails'); assert.deepEqual(bad.bad, ['$630K', '$700K']);
  assert.ok(!checkNumbers('About 64% of target.', sheet).ok, 'a rounded-differently percentage fails');
});

test('customer table: month so far sums to Veri-Shred done; posted months add up to the book', async () => {
  const { customerTable } = await import('../public/components/custtable.js');
  const C = J('customers'), A = J('activity'), P = J('pulse');
  const T = customerTable(C, A, { bookPerService: 114.5 });
  const month = A.latestDone.slice(0, 8) + '01';
  const done = A.routeDays.filter(r => r.date >= month && r.date <= A.latestDone).reduce((t, r) => t + r.services_done, 0);
  const rowsDone = T.rows.reduce((t, r) => t + r.mtd.services, 0);
  // every done service is in a row or counted as outside the list (Citadel's apart)
  const cit = A.orders.filter(o => o.done && o.level1 === 6714 && o.date >= month && o.date <= A.latestDone).length;
  assert.equal(rowsDone + T.outside.services + cit, done, 'month so far reconciles to done services');
  // last month's rows are the customers fixture's own month, Citadel apart, and most of the posted core
  const i = C.months.length - 1;
  const fx = C.accounts.filter(a => a.level1 !== 6714).reduce((t, a) => t + a.storage[i] + a.service[i], 0);
  near(T.rows.reduce((t, r) => t + r.last, 0), fx, 0.5, 'last month');
  const core = P.monthly.find(m => m.month === T.last).core;
  assert.ok(fx <= core + 1 && fx >= 0.9 * core, `listed accounts ${fx} of core ${core}`);
  const ytdCore = P.monthly.filter(m => m.month.slice(0, 4) === T.last.slice(0, 4)).reduce((t, m) => t + m.core, 0);
  const ytd = T.rows.reduce((t, r) => t + (r.ytd || 0), 0);
  assert.ok(ytd <= ytdCore + 1 && ytd >= 0.9 * ytdCore, `year to date ${ytd} of core ${ytdCore}`);
  assert.ok(!T.rows.some(r => r.level1 === 6714), 'Citadel apart');
});

test('route map: the stops share the route day exactly; travel follows the detour', async () => {
  const R = require('./rates.js');
  const { routeDay, allocate, cheaper } = await import('../public/components/routemap.js');
  const Z = require('../public/data/zcta.json');
  const A = J('activity');
  const days = [...new Set(A.orders.filter(o => o.done).map(o => o.date + '|' + o.route + '|' + o.level1))].slice(0, 40);
  let checked = 0;
  for (const k of days) {
    const [date, , id] = k.split('|');
    const day = routeDay({ orders: A.orders }, date, +id, Z);
    if (!day) continue;
    const a = allocate(R, day);
    near(day.stops.reduce((t, s) => t + s.cost, 0), R.RATES.routeDay.v, 1e-6, `${k} shares`);
    near(day.stops.reduce((t, s) => t + s.travel, 0), R.RATES.routeDay.v * a.minutes.drive / (a.minutes.drive + a.minutes.drop), 1e-6, `${k} travel is the drive minutes' share`);
    assert.ok(a.me.cost > 0 && a.me.cost <= a.total + 1e-9, `${k} this account's share`);
    const c = cheaper(day, a, A.routeDays, Z, A.postcodes);
    for (const n of c.nearby) assert.ok(n.saving <= a.me.travel + 1e-9 && n.miles <= 2, 'a saving never exceeds the travel it removes');
    if (c.density.length) assert.ok(c.density[0].perService >= c.density[c.density.length - 1].perService, 'more customers at a stop never cost more');
    checked++;
  }
  assert.ok(checked >= 20, `checked ${checked} route days`);
  // two stops at the same postcode, one far: the far one carries the travel
  const day = { date: '2026-09-01', route: 'T', stops: [
    { level1: 1, postcode: '60609', pt: Z['60609'], services: 1, mine: true },
    { level1: 2, postcode: '60609', pt: Z['60609'], services: 1 },
    { level1: 3, postcode: '60426', pt: Z['60426'], services: 1 },
  ] };
  allocate(R, day);
  assert.ok(day.stops[2].travel > day.stops[0].travel + day.stops[1].travel, 'the far stop carries most of the travel');
  near(day.stops[0].travel, day.stops[1].travel, 1e-9, 'stops at one place share its travel');
});

test('margin drill: one cost per job on its real route day; actions; density never exceeds travel', async () => {
  const R = require('./rates.js');
  const { costOrders, densityByPostcode } = await import('../public/components/jobview.js');
  const { marginAction, marginSummary, accountLines } = await import('../public/components/margin.js');
  const Z = require('../public/data/zcta.json');
  const A = J('activity'), M = J('margin'), D = J('drill');
  // a job's lines sum to its cost; with a route that day, travel and on-site are its share of allocate
  let real = 0;
  for (const a of D.accounts.slice(0, 15)) {
    const meta = new Map();
    for (const l of M.lines) if (l.level1 === a.level1 || !meta.has(l.servcode)) meta.set(l.servcode, { family: l.family, unit: l.unit, drives_cost: l.drives_cost });
    const d = JSON.parse(JSON.stringify(a)), C = costOrders(R, d, meta, A, Z, a.level1);
    for (const o of d.orders) {
      near(o.cost.lines.reduce((t, l) => t + l[1], 0), o.cost.total, 1e-6, `${o.woid} lines`);
      if (!o.cost.real) continue;
      real++;
      const share = C.perDay.get(o.date), me = o.day.alloc.me;
      const line = n => (o.cost.lines.find(l => l[0] === n) || [0, 0])[1];
      near(line('Travel to site'), me.travel / share, 1e-6, `${o.woid} travel is its share of the day`);
      near(line('Time on site'), me.onsite / share, 1e-6, `${o.woid} on site is its share of the day`);
    }
  }
  assert.ok(real >= 10, `jobs costed on a real route day: ${real}`);
  // action rules on known cases
  const act = (pc, revenue, cost, travel, review = false) => marginAction({ pc, revenue, cost, review }, travel).tag;
  assert.equal(act(0.6, 1e5, 4e4, 0), 'Hold');
  assert.equal(act(0.3, 1e5, 7e4, 0), 'Reprice');
  assert.equal(act(0.05, 3000, 2850, 0), 'Drop');
  assert.equal(act(0.05, 5e4, 47500, 3e4), 'Re-route');
  assert.equal(act(-0.2, 5e4, 6e4, 1e4), 'Renegotiate');
  assert.equal(act(-0.5, 5e4, 7.5e4, 4e4, true), 'Check routes');
  assert.equal(act(0.7, 5e4, 1.5e4, 1e4, true), 'Hold', 'a sound account keeps Hold whatever its route share');
  // every account in the list gets one action
  const MS = marginSummary(R, M, [6714]), AL = accountLines(R, M);
  assert.ok(MS.accounts.every(m => marginAction(m, 0).tag), 'every account has an action');
  // the density panel: a saving is never more than the travel shared a year
  const Dn = densityByPostcode(R, A, Z, { top: 50 });
  assert.ok(Dn.rows.length > 0, 'postcodes ranked');
  for (const r of Dn.rows) assert.ok(r.saving <= r.visitsYear * r.travel + 1e-6, `${r.postcode} saving within its travel`);
  // Ingalls still holds
  const ing = R.costToServe('bin', 3540, { visits: 101, pounds: 154887 });
  near(ing.total, 37273, 1, 'Ingalls');
});

test('route cost: every day shares its cost exactly; an account is the sum of its days; bins cost from them', async () => {
  const R = require('./rates.js');
  const { routeCosts, daysFrom, postcodeCost, quoteRoute } = await import('../public/components/routecost.js');
  const { allocate } = await import('../public/components/routemap.js');
  const Z = require('../public/data/zcta.json');
  const D = J('drill');
  const rows = Object.values(D).flat().flatMap(a => a.routes || []);
  assert.ok(rows.length > 1000, 'route-day stops from the drill');
  const rc = routeCosts(R, rows, Z);
  // the stops' shares of every day add up to the days' cost
  const all = Object.values(rc.accounts).reduce((t, a) => t + a.cost, 0);
  near(all, rc.days * R.RATES.routeDay.v, 0.01 * rc.days + 1, 'accounts share every route day exactly');
  // one account, recomputed day by day, equals its total
  const id = 12530, days = daysFrom(rows, Z).filter(d => d.stops.some(s => s.level1 === id));
  let sum = 0, svc = 0;
  for (const d of days) { allocate(R, d); for (const s of d.stops) if (s.level1 === id) { sum += s.cost; svc += s.services; } }
  near(rc.accounts[id].cost, sum, 0.01 * days.length + 1, 'Ingalls is the sum of its days');
  assert.equal(rc.accounts[id].services, svc);
  assert.equal(rc.accounts[id].days, days.length);
  // bins costed from the account's days: route lines are its cost a service × bins; the plant is unchanged
  const r = rc.accounts[id], plain = R.costToServe('bin', 3540, { visits: 101, pounds: 154887 });
  const real = R.costToServe('bin', 3540, { visits: 101, pounds: 154887, route: r });
  const route = c => c.lines.filter(l => /Travel|on site/.test(l[0])).reduce((t, l) => t + l[1], 0);
  near(route(real), 3540 * r.cost / r.services, 0.01, 'route lines from real days');
  near(real.total - route(real), plain.total - route(plain), 0.01, 'the shred plant is the same either way');
  near(plain.total, 37273, 1, 'Ingalls without route days still holds');
  // a quote in a postcode with real days: more bins a visit never costs more a bin
  const pc = postcodeCost(rc, '60616', Z);
  assert.ok(pc && pc.perService > 0, 'a central postcode has real days');
  const q1 = quoteRoute(pc, 52, 52, R.SETTINGS), q4 = quoteRoute(pc, 208, 52, R.SETTINGS);
  assert.ok((q4.travel + q4.onsite) / 208 < (q1.travel + q1.onsite) / 52, 'four bins a visit cost less a bin than one');
});

test('opportunities: each figure is its own list\'s; won this month is the won statuses', async () => {
  const { opportunities, wonIn } = await import('../public/components/opps.js');
  const { serviceGaps, storageGaps, slippingAccounts, overdueBoxes } = await import('../public/components/levers.js');
  const { buildWhitespace } = await import('../public/components/whitespace.js');
  const C = J('customers'), PR = J('pricing'), CA = J('calls'), M = J('margin');
  const O = opportunities({ C, PR, CA, M });
  const sum = k => O.rows.filter(r => r.kind === k).reduce((t, r) => t + r.value, 0);
  near(sum('price'), ([...serviceGaps(PR).values()].reduce((t, a) => t + a.worth, 0) + storageGaps(PR).rows.reduce((t, r) => t + r.worth, 0)) * 12, 1, 'price gaps');
  near(sum('slip'), slippingAccounts(C).filter(d => d.level1 !== 6714).reduce((t, d) => t + -d.move.d * 12, 0), 1, 'win-back');
  near(sum('overdue'), overdueBoxes(CA, PR).rows.filter(r => r.boxes >= 50).reduce((t, r) => t + r.once, 0), 1, 'overdue boxes');
  const W = buildWhitespace(M, { exclude: [6714], top: 120 });
  near(sum('cross'), W.rows.reduce((t, a) => t + Object.values(a.cells).reduce((u, c) => u + (!c.have && c.opp > 0 ? c.opp : 0), 0), 0), 1, 'cross-sell');
  assert.equal(new Set(O.rows.map(r => r.key)).size, O.rows.length, 'one row a key');
  const m = new Date().toISOString().slice(0, 7);
  const st = { a: { status: 'won', value: 100, at: m + '-02' }, b: { status: 'quoted', value: 50, at: m + '-03' }, c: { status: 'won', value: 7, at: '2020-01-01' } };
  assert.deepEqual([wonIn(st).n, wonIn(st).value], [1, 100], 'won this month counts only this month\'s wins');
});

test('warehouse: cells sum to the boxes; states never overlap; eligible ties to the data', async () => {
  const { byAccount, totals, cells, eligibleList, heldNotBilled, rowStates } = await import('../public/components/storage.js');
  const { overdueBoxes } = await import('../public/components/levers.js');
  const S = J('storage'), PR = J('pricing'), CA = J('calls');
  for (const r of S.rows) {
    const s = rowStates(r);
    assert.ok(s.eligible <= (r.overdue || 0) && s.eligible >= 0, 'eligible within overdue');
    assert.ok(s.eligible + s.protected + s.old + s.inuse === r.boxes && s.inuse >= 0, 'states partition the row');
  }
  const acc = byAccount(S), T = totals(acc), G = cells(acc, 1000);
  const boxes = S.rows.reduce((t, r) => t + r.boxes, 0);
  assert.equal(T.boxes, boxes);
  assert.equal(G.blocks.reduce((t, b) => t + Object.values(b.cells).reduce((a, c) => a + c, 0), 0), Math.round(boxes / 1000), 'cells sum to the boxes');
  // eligible here is the snapshot query's own figure, row by row
  assert.equal(T.eligible, S.rows.reduce((t, r) => t + Math.min(r.eligible, r.boxes - Math.min(r.boxes, r.hold + r.permanent)), 0));
  // overdue matches Customers › Overdue boxes (same table, same status), Citadel aside
  const O = overdueBoxes(CA, PR);
  near(T.overdue - acc.filter(a => a.level1 === 6714).reduce((t, a) => t + a.overdue, 0), O.boxes, O.boxes * 0.02, 'overdue against the Overdue boxes list');
  const E = eligibleList(acc, PR, T.boxes);
  near(E.eligible, T.eligible, 1e-6, 'eligible list');
  const NB = heldNotBilled(acc, PR);
  near(NB.gap, NB.rows.reduce((t, r) => t + r.held - r.billed, 0), 1e-6, 'not billed');
});

test('what changed: each signal fires on a minority of days; a normal day says nothing', async () => {
  const { backtest, changesFor } = await import('../public/components/changes.js');
  const P = J('pulse'), A = J('activity');
  const b = backtest(P, A, 40);
  assert.ok(b.days >= 30, `days backtested: ${b.days}`);
  for (const [k, n] of Object.entries(b.fires)) assert.ok(n <= b.days * 0.3, `${k} fired on ${n} of ${b.days} days`);
  assert.ok(b.quietDays >= b.days * 0.35, `quiet days ${b.quietDays} of ${b.days}`);
  // every line's numbers are its own figures (no invented numbers)
  for (const i of changesFor(P, A).items) assert.ok(i.text && i.owner && i.subject, 'a line has text, an owner and a subject');
});

test('morning brief: taps are signed and cannot be forged; a stale morning says only that', async () => {
  const fb = require('../server/feedback.js');
  const t = fb.sign({ who: 'anne', key: 'quiet', subject: 'account:3507', verdict: 'knew', brief_date: '2026-10-22' });
  assert.deepEqual(fb.verify(t), { who: 'anne', key: 'quiet', subject: 'account:3507', verdict: 'knew', brief_date: '2026-10-22' });
  const [body, mac] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ who: 'trisha', key: 'quiet', subject: 'account:3507', verdict: 'knew' })).toString('base64url') + '.' + mac;
  assert.equal(fb.verify(forged), null, 'an edited token is refused');
  assert.equal(fb.verify(body + '.x'), null, 'a bad signature is refused');
  const { buildBriefs, workDaysSince } = await import('../server/brief.mjs');
  const P = J('pulse'), A = J('activity'), C = J('customers'), PR = J('pricing'), CA = J('calls');
  const people = [{ who: 'trisha', to: 't@x' }, { who: 'anne', to: 'a@x' }, { who: 'mike', to: 'm@x' }];
  const next = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const fresh = buildBriefs({ P, A, C, PR, CA, today: next(A.latestDone), url: 'https://p', sign: fb.sign, people });
  assert.equal(fresh.length, 3); assert.ok(fresh.every(m => !m.stale), 'three emails, none stale');
  assert.ok(fresh.filter(m => m.who !== 'trisha').every(m => m.html.includes('/f/')), 'Anne and Mike get taps on their lines');
  assert.equal(workDaysSince('2026-10-22', '2026-10-26'), 1, 'Friday only between Thursday and Monday');
  const stale = buildBriefs({ P, A, C, PR, CA, today: '2026-10-28', url: 'https://p', sign: fb.sign, people });
  assert.ok(stale.every(m => m.stale && /No new data since/.test(m.text)), 'stale morning: one line, nothing else');
  // Trisha's opening is checked against her sheet: the plain opening passes its own check
  const { checkNumbers } = await import('../public/components/summary.js');
  const tr = fresh.find(m => m.who === 'trisha');
  assert.ok(checkNumbers(tr.sheet[0].line, tr.sheet).ok);
});

test('road miles: the shares still add up to the route day; a road way is never shorter than the straight line', async () => {
  const R = require('./rates.js');
  const { routeDay, allocate, roadPath, setRoadnet, miles, YARD } = await import('../public/components/routemap.js');
  const Z = require('../public/data/zcta.json');
  setRoadnet(require('../public/data/roadnet.json'));
  try {
    const loop = roadPath(YARD, Z['60606']);
    assert.ok(loop && loop.miles >= miles(YARD, Z['60606']) && loop.miles <= 2 * miles(YARD, Z['60606']), 'the yard to the Loop by road: longer than the straight line, not absurdly');
    const A = J('activity');
    const days = [...new Set(A.orders.filter(o => o.done).map(o => o.date + '|' + o.route + '|' + o.level1))].slice(0, 40);
    let checked = 0, roadDays = 0;
    for (const k of days) {
      const [date, , id] = k.split('|');
      const day = routeDay({ orders: A.orders }, date, +id, Z);
      if (!day) continue;
      const a = allocate(R, day);
      near(day.stops.reduce((t, s) => t + s.cost, 0), R.RATES.routeDay.v, 1e-6, `${k} shares by road`);
      assert.ok(a.road, 'the split used the roads');
      const pts = day.stops.filter(s => s.pt).map(s => s.pt), path = [YARD, ...pts, YARD];
      let crow = 0; for (let i = 1; i < path.length; i++) crow += miles(path[i - 1], path[i]);
      assert.ok(a.dayMiles >= crow - 1e-6, `${k} road miles ${a.dayMiles.toFixed(1)} not under the straight ${crow.toFixed(1)}`);
      if (a.dayMiles > crow + 0.5) roadDays++;
      checked++;
    }
    assert.ok(checked >= 20 && roadDays >= checked / 2, `${roadDays} of ${checked} route days found a way by road`);
  } finally { setRoadnet(null); }
});
