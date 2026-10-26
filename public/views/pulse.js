// Home — Trisha, phone first. Her number is core billed revenue (storage plus service, Citadel held
// apart) against $1.0m a month. Three things, in order:
//   the month: this month's bill (already known: this month's storage, last month's work) and the
//     next one building from this month's work, at its pace against last month's;
//   the route to $1.0m: today's six-month average, each lever in dollars a month, and what is left
//     for new business; every step opens the accounts behind it;
//   customers moving: dollars a month against each account's own run, falls and gains.
import { money0, moneyK } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc, getLog } from '/components/data.js';
import { changesFor, daySentence } from '/components/changes.js';
import { anneList, mikeList, trishaView } from '/components/lists.js';
import { marginSummary } from '/components/margin.js';
import { moveReason } from '/components/series.js';
import { gapHtml } from '/components/gap.js';
import { reveal, drawIn } from '/components/motion.js';
import { project, dailyFrom, curve } from '/components/projection.js';
import { checkNumbers } from '/components/summary.js';
import { bridge, billNow, slippingAccounts, risingAccounts, TARGET, CITADEL } from '/components/levers.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const addMonths = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10);
const dayMonth = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pct = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(Math.round(v * 100)) + '%';
const mk = v => Math.abs(v) < 50 ? '$0' : moneyK(v);   // no "−$0" from a few cents of credit
const dcls = v => v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat';

// The slipping and rising accounts (components/levers.js, one definition everywhere), largest
// moves first, with which part moved.
function movers(C) {
  const pick = s => ({ level1: s.level1, customer: s.customer, d: s.move.d, last3: s.move.last3, run: s.move.run, why: moveReason(s.move, moneyK) });
  return { falls: slippingAccounts(C).slice(0, 5).map(pick), gains: risingAccounts(C).slice(0, 5).map(pick), slipping: slippingAccounts(C).length };
}

export async function render(main, P) {
  if (!main) return;
  const [PR, A, CA, C, M, R] = await Promise.all([getJson('pricing'), getJson('activity'), getJson('calls'), getJson('customers'), getJson('margin'), loadRates()]);

  // ── the month ──
  const BN = billNow(P, A);                                       // this month's bill: run, posted, or pending
  const billMonth = BN.month, run = BN.run, runCore = BN.core;
  const last = P.monthly.find(m => m.month === addMonths(billMonth, -1)) || P.monthly[P.monthly.length - 1];   // the bill before it
  const workMonth = A.latestDone.slice(0, 8) + '01';              // the month being worked now
  const daily = dailyFrom(P, A);
  const doneIn = m => daily.filter(r => r.date.startsWith(m.slice(0, 7))).reduce((t, r) => t + r.done, 0);
  // the bill's work is last month's: its value per done service prices this month's work ◇
  const perService = BN.perService;
  const X = project({ daily, latest: A.latestDone, perService, storage: BN.storage, routeDays: A.routeDays });
  const nextBill = X.bill ? X.bill.central : null;
  // the same month last year, priced so it ends on what its bill actually carried
  const lyMonth = addMonths(workMonth, -12), lyBill = P.monthly.find(m => m.month === addMonths(lyMonth, 1)), lyDone = doneIn(lyMonth);
  const lastYear = lyBill && lyDone ? curve(daily, lyMonth, lyBill.core_service / lyDone, lyBill.storage) : [];
  const lastMonth = perService ? curve(daily, addMonths(workMonth, -1), perService, BN.storage) : [];
  const thisMonth = perService ? curve(daily, workMonth, perService, BN.storage, A.latestDone) : [];

  // ── the route to $1.0m ──
  const B = bridge({ P, PR, CA, M, C });
  const scale = v => v / (TARGET * 1.04) * 100;
  let cum = B.today;
  const stepRows = B.steps.map(s => { const from = cum; cum += s.v; return { ...s, from }; });

  // ── margin: the lines we can cost with confidence, and the accounts that cost more than they pay ──
  const { solidPc, losers } = marginSummary(R, M, [CITADEL]);
  const sure = losers.filter(a => !a.review), unsure = losers.filter(a => a.review);
  const sureLoss = -sure.reduce((t, a) => t + a.margin, 0);

  const mv = movers(C);
  const hour = new Date().getHours();
  // the answer to Trisha's three questions, before anything else: where the month lands, the two
  // biggest levers, who is slipping and why
  const top2 = B.steps.slice(0, 2);
  const age = Math.round((Date.now() - Date.parse(A.latestDone + 'T12:00:00Z')) / 864e5);
  const staleNote = age > 2 ? `<p class="stale">The data stops on ${dayMonth(A.latestDone)}, ${age} days ago: the daily refresh has not run since. Figures below are as of then.</p>` : '';
  // the figure sheet behind the opening paragraph: each fact as a line for Claude and as the
  // template's own sentence (components/summary.js checks Claude's numbers against these lines)
  const nb = addMonths(billMonth, 1), top = mv.falls[0], gain = mv.gains[0];
  const sheet = [
    age > 2 && { key: 'stale', line: `The data stops on ${dayMonth(A.latestDone)}, ${age} days ago; the daily refresh has not run since` },
    runCore != null && { key: 'bill', line: `${mon(billMonth)}'s bill, already known: ${moneyK(runCore)} core, ${Math.round(runCore / TARGET * 100)}% of the $1.0M target, ${pct(runCore / last.core - 1).replace('▲ ', 'up ').replace('▼ ', 'down ')} on ${mon(last.month)}'s ${moneyK(last.core)}`,
      say: `${mon(billMonth)} bills ${moneyK(runCore)}, ${Math.round(runCore / TARGET * 100)}% of the $1.0M target.` },
    X.bill && { key: 'next', line: `${mon(nb)}'s bill, building from ${mon(workMonth)}'s work: about ${moneyK(X.bill.central)} ◇ (likely ${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)}), ${moneyK(TARGET - X.bill.central)} short of $1.0M; ${X.elapsed} of ${X.workdays} working days in`,
      say: `${mon(nb)} is heading for about ${moneyK(X.bill.central)} ◇, likely ${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)}.` },
    top2.length && { key: 'levers', line: `Biggest levers to $1.0M from existing customers: ${top2.map(x => `${x.t.toLowerCase()}, ${x.modelled ? 'up to ' : ''}${moneyK(x.v)} a month${x.modelled ? ' (a ceiling ◇)' : ''}`).join('; ')}; new business must find ${moneyK(B.newBusiness)} a month`,
      say: `The biggest levers: ${top2.map(x => `${x.t.charAt(0).toLowerCase() + x.t.slice(1)} (${x.modelled ? 'up to ' : ''}${moneyK(x.v)} a month)`).join(' and ')}.` },
    top && { key: 'slipping', line: `${mv.slipping} accounts are slipping; the largest is ${titleCase(top.customer)}, ${top.why}, ${moneyK(-top.d)} a month below its own run`,
      say: `${mv.slipping} accounts are slipping; the largest is ${titleCase(top.customer)}, ${top.why}.` },
    gain && { key: 'rising', line: `Rising most: ${titleCase(gain.customer)}, ${moneyK(gain.d)} a month above its own run` },
    { key: 'margin', line: `${sure.length} accounts cost more to serve than they pay on costs R4 is sure of; ${unsure.length} more only while route costs are under review` },
  ].filter(Boolean);

  // ── what changed yesterday, and the team's lists (components/changes.js, lists.js) ──
  const [log, feedback, user] = await Promise.all([getLog().catch(() => []),
    fetch('/api/feedback', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { data: [] }).then(j => j.data || []).catch(() => []),
    fetch('/api/me', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
  const CH = changesFor(P, A), DS = daySentence(P, A);
  if (DS) sheet.unshift({ key: 'day', line: DS.text, say: DS.text });
  const me = (user && user.name) || 'trisha';
  const TV = trishaView({ CA, log, feedback, changes: CH, who: me });
  const AN = anneList({ C, PR, CA, log, feedback, changes: CH, n: 3 });
  const MK = mikeList({ A, feedback, changes: CH });
  for (const i of TV.lines.slice(0, 3)) sheet.unshift({ key: 'ch_' + i.key + '_' + i.subject, line: i.text, say: i.text });

  const own = TV.lines.filter(i => i.owner === 'trisha'), others = TV.lines.filter(i => i.owner !== 'trisha');
  const gapAll = TARGET - B.today;
  const dBill = runCore != null ? runCore / last.core - 1 : null;
  const strip = `<section class="strip" data-rv>
      <a href="#customers?view=main"><span class="lab">${mon(billMonth)}'s bill</span><b>${runCore != null ? moneyK(runCore) : 'posted'}</b><small>${dBill != null ? `${pct(dBill)} on ${mon(last.month)}` : BN.source === 'pending' ? 'total with the next rebuild' : 'run not started'}</small></a>
      <div><span class="lab">${mon(nb)}'s, building ◇</span><b>${nextBill != null ? '≈ ' + moneyK(nextBill) : '—'}</b><small>${X.bill ? `${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)} · day ${X.elapsed} of ${X.workdays}` : 'no priced month yet'}</small></div>
      <div><span class="lab">Gap to $1.0M</span><b>${moneyK(TARGET - (nextBill || B.today))}</b><small>a month, ${nextBill != null ? `at ${mon(nb)}'s pace` : 'on the six-month average'}</small></div>
      <a href="#customers?view=slipping"><span class="lab">Slipping ›</span><b>${mv.slipping}</b><small>accounts down 10% on their own run</small></a>
    </section>`;
  const fbBtns = i => `<span class="fb" data-key="${esc(i.key)}" data-subject="${esc(i.subject)}"><button data-v="useful" title="Useful">Useful</button><button data-v="knew" title="Already knew this">Knew</button><button data-v="wrong" title="Not right">Not right</button></span>`;
  const lineList = (ls, empty) => ls.length ? `<ul class="chg">${ls.map(i => `<li class="${i.level}"><span>${esc(i.text)}</span>${fbBtns(i)}</li>`).join('')}</ul>` : `<p class="quiet">${empty}</p>`;
  const dayLabel = new Date(A.latestDone + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const briefCard = `<section class="card brief" data-rv>
      <div class="card-head"><h2 class="sec-t">${esc(dayLabel)}</h2><small id="home-by"></small></div>
      <p class="hv" id="home-hv">${DS ? esc(DS.text) : ''}</p>
      ${lineList(own.slice(0, 4), others.length ? '' : `Nothing unusual on ${esc(dayLabel)}: the day's work and every route were within their usual range.`)}
      ${others.length ? `<p class="quiet">${own.length ? 'And ' : ''}${others.length} line${others.length === 1 ? '' : 's'} for the team below: ${[...new Set(others.map(i => i.owner === 'mike' ? 'Mike' : 'Anne'))].join(' and ')}.</p>` : ''}
    </section>`;
  const t = TV.team;
  const teamCard = `<div class="team" data-rv>
      <section class="card">
        <div class="card-head"><h3>Anne · this week</h3><a href="#customers?view=conversations">All ›</a></div>
        ${AN.lines.length ? lineList(AN.lines, '') : ''}
        <ol class="calls">${AN.calls.map(c => `<li><a href="#customer/${c.level1}"><b>${esc(c.name)}</b><small>${esc(c.sigs[0].ev)}</small></a><span>${c.stake ? `${moneyK(c.stake)}<small>a year</small>` : ''}</span></li>`).join('')}</ol>
      </section>
      <section class="card">
        <div class="card-head"><h3>Mike · ${esc(new Date(A.latestDone + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }))}</h3><a href="#activity">Routes ›</a></div>
        ${lineList(MK.lines, 'Every route within its usual range.')}
        ${MK.next ? `<p class="next">Booked for ${esc(MK.next.label)}: ${MK.next.services.toLocaleString('en-US')} services on ${MK.next.routes.length} routes${MK.next.routes.length ? ` (${MK.next.routes.slice(0, 4).map(r => `${esc(r.route)} ${r.services}`).join(', ')})` : ''}.</p>` : ''}
      </section>
      <p class="done">Last 7 days: ${t.called} called · ${t.emailed} emailed · ${t.deferred} put off · rates moved on ${t.ratesMoved} account${t.ratesMoved === 1 ? '' : 's'} in 30 days · lines marked useful ${t.useful}, already known ${t.knew}, not right ${t.wrong}</p>
    </div>`;
  const landCard = `<section class="card" data-rv><div id="home-land"></div></section>`;
  const moveCard = `<section class="card" data-rv>
      <div class="card-head"><h3 id="home-ct-h"></h3><a href="#customers?view=slipping">All ›</a></div>
      <div class="seg" id="home-ct-seg"><a href="#" data-f="falling" class="on">Slipping</a><a href="#" data-f="rising">Rising</a></div>
      <div id="home-ct"></div>
    </section>`;
  const more = `<details class="card more" data-rv><summary><span>The route to $1.0M: existing customers could close ${moneyK(B.levers)} of the ${moneyK(gapAll)} gap</span><span class="go">›</span></summary>
      <p class="sec-s">From today's ${moneyK(B.today)} a month, the average of ${mon(B.sixFrom)} to ${mon(B.sixTo)}. Tap a lever for its accounts.</p>
      ${gapHtml(B)}
      <div class="src">◇ cross-sell is a ceiling · prices and slipping counted halfway · ${B.stopped.accounts} stopped accounts (${moneyK(B.stopped.lost)} a month) left out, <a href="#customers?view=slipping">listed with Slipping</a></div>
    </details>
    <div class="also" data-rv>
      <a href="#customers?view=margin"><b>Margin ◇</b> ${Math.round(solidPc * 100)}% on costs we are sure of; ${sure.length} account${sure.length === 1 ? '' : 's'} below cost, ${unsure.length} more under review ›</a>
      <a href="#activity?tab=warehouse"><b>Warehouse</b> ${Math.round(B.overdue.boxes / 1000)}K boxes past retention review across ${B.overdue.accounts} accounts ›</a>
    </div>`;

  main.innerHTML = `<div class="h">${staleNote}${briefCard}${strip}${teamCard}
    <div class="split">${landCard}${moveCard}</div>
    ${more}
    <div class="foot">Posted through ${mon(P.monthly[P.monthly.length - 1].month)} · work done through ${dayMonth(A.latestDone)} · ◇ modelled · Citadel held apart</div>
  </div>`;

  // feedback on a line: useful · knew · not right; a knew or wrong line is held back for 30 days
  main.querySelector('.h').addEventListener('click', async ev => {
    const b = ev.target.closest('.fb button'); if (!b) return;
    const box = b.closest('.fb'), li = b.closest('li');
    box.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      const r = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: box.dataset.key, subject: box.dataset.subject, verdict: b.dataset.v, brief_date: A.latestDone }) });
      if (!r.ok) throw new Error('not saved');
      box.innerHTML = `<em>${b.dataset.v === 'useful' ? 'Noted: useful' : b.dataset.v === 'knew' ? 'Held back for 30 days' : 'Marked not right'}</em>`;
      if (b.dataset.v !== 'useful') li.classList.add('held');
    } catch (e) { box.querySelectorAll('button').forEach(x => x.disabled = false); }
  });

  // the template first, then Claude's paragraph if it arrives and passes the check; text, never HTML
  const hv = main.querySelector('#home-hv'), by = main.querySelector('#home-by');
  // the day in a sentence first; Claude's paragraph replaces it if it arrives and passes the check
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: sheet.map(({ key, line, say }) => ({ key, line, say })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && j.text && checkNumbers(j.text, sheet).ok && hv.isConnected) { hv.textContent = j.text; by.textContent = 'Written by Claude from these figures; every number checked'; } })
    .catch(() => {});

  // slipping and rising: the three-month measure (one-off projects that stopped are left out)
  const ct = f => {
    const rows = (f === 'falling' ? mv.falls : mv.gains).slice(0, 5);
    main.querySelector('#home-ct-h').textContent = rows[0] ? `${titleCase(rows[0].customer)} ${f === 'falling' ? 'has slipped most' : 'has grown most'}, ${moneyK(Math.abs(rows[0].d))} a month` : 'Customers moving';
    main.querySelector('#home-ct').innerHTML = `<ul class="mv">${rows.map(r => `<li><a href="#customer/${r.level1}"><span class="t">${esc(titleCase(r.customer))}<small>${esc(r.why)}</small></span><span class="v">${f === 'falling' ? '−' : '+'}${moneyK(Math.abs(r.d))}</span></a></li>`).join('')}</ul>`;
    main.querySelectorAll('#home-ct-seg a').forEach(a => a.classList.toggle('on', a.dataset.f === f));
  };
  main.querySelectorAll('#home-ct-seg a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); ct(a.dataset.f); }));
  ct('falling');

  // the chart's title is its conclusion: this month against last month and last year at the same day
  const atDay = (pts, d) => (pts.find(p => p.day === d) || {}).y;
  const dNow = thisMonth.length ? thisMonth[thisMonth.length - 1].day : null, yNow = dNow ? atDay(thisMonth, dNow) : null;
  const vsLast = yNow && atDay(lastMonth, dNow) ? yNow / atDay(lastMonth, dNow) - 1 : null, vsYear = yNow && atDay(lastYear, dNow) ? yNow / atDay(lastYear, dNow) - 1 : null;
  const word = v => Math.abs(v) < 0.02 ? 'level with' : v > 0 ? `${Math.round(v * 100)}% ahead of` : `${Math.round(-v * 100)}% behind`;
  const landTitle = vsLast != null ? `${mon(nb)}'s bill is ${word(vsLast)} ${mon(billMonth)}'s at working day ${dNow}${vsYear != null ? `, ${word(vsYear)} last year's` : ''}` : 'Where the month lands';
  landing(main.querySelector('#home-land'), {
    title: landTitle,
    sub: `Each bill building by working day: its storage, then each day's work at ${perService ? '$' + perService.toFixed(2) : "last month's value"} a service ◇`,
    series: [
      { name: `${mon(addMonths(lyMonth, 1))} ${addMonths(lyMonth, 1).slice(0, 4)}'s bill`, cls: 'neutral faint', points: lastYear },
      { name: `${mon(billMonth)}'s bill`, cls: 'neutral', points: lastMonth },
      { name: `${mon(addMonths(billMonth, 1))}'s bill so far`, cls: 'service', points: thisMonth },
    ].filter(x => x.points.length),
    cone: X.bill && thisMonth.length ? { from: thisMonth[thisMonth.length - 1], to: X.workdays, lo: X.bill.lo, c: X.bill.central, hi: X.bill.hi } : null,
    days: X.workdays, target: TARGET,
    source: `Veri-Shred done orders by working day · storage and last month's work from the current VCK run · ${lastYear.length ? 'last year priced to end on its posted bill' : 'last year joins with the next snapshot'} · weekend work counted on the Friday · ${X.backtest ? `band tested: ${X.backtest.hits} of the last ${X.backtest.n} months landed inside it` : 'band untested until fifteen months of daily work'}`,
  });
  reveal(main.querySelector('.h'));
}

// Where the month lands: bills building by working day, the projection as a cone to month end,
// the target as a hairline. One axis; a crosshair reads every line at a working day.
function landing(el, o) {
  if (!el) return;
  o = { ...o, days: Math.max(o.days, ...o.series.map(x => x.points.length)) };   // a month with more working days than this one
  const W = Math.max(300, Math.min(1000, el.clientWidth || 640)), compact = W < 560;
  const H = compact ? 230 : 290, L = compact ? 44 : 52, R = compact ? 12 : 64, T = 16, B = 28;
  const ys = o.series.flatMap(x => x.points.map(p => p.y)).concat(o.cone ? [o.cone.lo, o.cone.hi] : []).concat([o.target]);
  const step = 100000, lo = Math.floor(Math.min(...ys) * 0.96 / step) * step, hi = Math.ceil(Math.max(...ys) / step) * step;
  const fx = d => L + (d - 1) / Math.max(1, o.days - 1) * (W - L - R), fy = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  let g = '';
  for (let v = lo; v <= hi + 1; v += step) g += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${fy(v)}" y2="${fy(v)}"/><text class="c-axis" x="${L - 8}" y="${fy(v) + 4}" text-anchor="end">${moneyK(v)}</text>`;
  for (const d of (compact ? [1, 10, o.days] : [1, 5, 10, 15, 20, o.days]).filter((d, i, a) => d <= o.days && a.indexOf(d) === i && (d === o.days || o.days - d >= 3)))
    g += `<text class="c-axis" x="${fx(d)}" y="${H - 8}" text-anchor="${d === 1 ? 'start' : d === o.days ? 'end' : 'middle'}">${d === 1 ? (compact ? 'day 1' : 'working day 1') : d}</text>`;
  g += `<line class="c-mark" x1="${L}" x2="${W - R}" y1="${fy(o.target)}" y2="${fy(o.target)}"/><text class="c-note" x="${W - R}" y="${fy(o.target) - 6}" text-anchor="end">$1.0M target</text>`;
  if (o.cone) {
    const f = o.cone.from;
    g += `<polygon class="c-area service" style="opacity:.16" points="${fx(f.day)},${fy(f.y)} ${fx(o.cone.to)},${fy(o.cone.hi)} ${fx(o.cone.to)},${fy(o.cone.lo)}"/>`;
    g += `<line class="c-line service" style="stroke-dasharray:4 4" x1="${fx(f.day)}" y1="${fy(f.y)}" x2="${fx(o.cone.to)}" y2="${fy(o.cone.c)}"/>`;
    if (!compact) g += `<text class="c-note" x="${fx(o.cone.to) + 6}" y="${fy(o.cone.c) + 4}">≈ ${moneyK(o.cone.c)} ◇</text>`;
  }
  for (const x of o.series) {
    g += `<polyline class="c-line ${x.cls}" points="${x.points.map(p => `${fx(p.day)},${fy(p.y)}`).join(' ')}"/>`;
    const e = x.points[x.points.length - 1];
    g += `<circle class="c-end ${x.cls}" cx="${fx(e.day)}" cy="${fy(e.y)}" r="${x.cls === 'service' ? 4 : 3}"/>`;
  }
  g += `<line class="c-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/><rect class="c-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>`;
  const key = `<div class="chart-key">${o.series.map(x => `<span><i class="k ${x.cls}"></i>${esc(x.name)}</span>`).join('')}${o.cone ? '<span><i class="k service" style="opacity:.35"></i>likely landing ◇</span>' : ''}</div>`;
  el.classList.add('chart');
  el.innerHTML = `<div class="chart-head"><div><h3 class="chart-title">${esc(o.title)}</h3><p class="chart-sub">${esc(o.sub)}</p></div></div>${key}
    <div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">${g}</svg><div class="c-tip" hidden></div></div><div class="src">${esc(o.source)}</div>`;
  drawIn(el.querySelector('svg'), { x: L, y: T, w: W - L, h: H - T - B });
  const svg = el.querySelector('svg'), tip = el.querySelector('.c-tip'), cross = svg.querySelector('.c-cross'), hit = svg.querySelector('.c-hit');
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev, r = svg.getBoundingClientRect();
    const d = Math.max(1, Math.min(o.days, Math.round(((pt.clientX - r.left) * (W / r.width) - L) / (W - L - R) * (o.days - 1)) + 1));
    cross.setAttribute('x1', fx(d)); cross.setAttribute('x2', fx(d)); cross.setAttribute('visibility', 'visible');
    const rows = o.series.map(x => { const p = x.points.find(q => q.day === d); return p ? `<span><i class="k ${x.cls}"></i>${esc(x.name)} <b>${money0(p.y)}</b></span>` : null; }).filter(Boolean);
    if (o.cone && d > o.cone.from.day) { const t = (d - o.cone.from.day) / (o.cone.to - o.cone.from.day), at = v => o.cone.from.y + (v - o.cone.from.y) * t; rows.push(`<span><i class="k service" style="opacity:.35"></i>likely ◇ <b>${moneyK(at(o.cone.lo))} to ${moneyK(at(o.cone.hi))}</b></span>`); }
    tip.innerHTML = `<b>Working day ${d}</b>${rows.join('')}`;
    tip.style.left = Math.max(90, Math.min(r.width - 90, fx(d) / W * r.width)) + 'px'; tip.hidden = false;
  };
  hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}
