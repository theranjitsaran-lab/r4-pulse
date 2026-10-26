// Home — Trisha, phone first. Her number is core billed revenue (storage plus service, Citadel held
// apart) against $1.0m a month. Three things, in order:
//   the month: this month's bill (already known: this month's storage, last month's work) and the
//     next one building from this month's work, at its pace against last month's;
//   the route to $1.0m: today's six-month average, each lever in dollars a month, and what is left
//     for new business; every step opens the accounts behind it;
//   customers moving: dollars a month against each account's own run, falls and gains.
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { marginSummary } from '/components/margin.js';
import { moveReason, deltaText } from '/components/series.js';
import { gapHtml } from '/components/gap.js';
import { reveal, drawIn } from '/components/motion.js';
import { project, dailyFrom, curve } from '/components/projection.js';
import { templateSummary, checkNumbers } from '/components/summary.js';
import { customerTable, falling, rising } from '/components/custtable.js';
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
  const last = P.monthly[P.monthly.length - 1];                 // the latest posted month
  const billMonth = addMonths(last.month, 1);                     // the bill in the current run
  const { run, core: runCore } = billNow(P);
  const workMonth = A.latestDone.slice(0, 8) + '01';              // the month being worked now
  const daily = dailyFrom(P, A);
  const doneIn = m => daily.filter(r => r.date.startsWith(m.slice(0, 7))).reduce((t, r) => t + r.done, 0);
  // the work in the current run is last month's: its value per done service prices this month's work ◇
  const prevDone = doneIn(addMonths(workMonth, -1));
  const perService = run && prevDone ? (run.service - run.citadel) / prevDone : null;
  const X = project({ daily, latest: A.latestDone, perService, storage: run ? run.storage : 0, routeDays: A.routeDays });
  const nextBill = X.bill ? X.bill.central : null;
  // the same month last year, priced so it ends on what its bill actually carried
  const lyMonth = addMonths(workMonth, -12), lyBill = P.monthly.find(m => m.month === addMonths(lyMonth, 1)), lyDone = doneIn(lyMonth);
  const lastYear = lyBill && lyDone ? curve(daily, lyMonth, lyBill.core_service / lyDone, lyBill.storage) : [];
  const lastMonth = perService ? curve(daily, addMonths(workMonth, -1), perService, run.storage) : [];
  const thisMonth = perService ? curve(daily, workMonth, perService, run.storage, A.latestDone) : [];

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

  const dBill = runCore != null ? runCore / last.core - 1 : null;
  const gapAll = TARGET - B.today;
  const at = x => (Math.max(0, Math.min(1, x / TARGET)) * 100).toFixed(2) + '%';
  const track = `<div class="hb-track">${runCore != null ? `<span class="hb-fill grow" style="width:${at(runCore)}"></span>` : ''}${X.bill ? `<span class="hb-range" style="left:${at(X.bill.lo)};width:${at(X.bill.hi - X.bill.lo)}"></span><span class="hb-tick" style="left:${at(X.bill.central)}"></span>` : ''}</div>
      <div class="hb-ends"><span>$0</span><span><span class="gap-wide">${X.bill ? `${mon(nb)} likely ${moneyK(X.bill.lo)}–${moneyK(X.bill.hi)} ◇ · ` : ''}</span>$1.0M target</span></div>`;
  const billFig = `<span class="hb-lab">${mon(billMonth)}'s bill · already known</span><span class="hb-fig">${runCore != null ? moneyK(runCore) : '—'}</span>`;
  const billNote = dBill != null ? `<p class="hb-note"><span class="hb-pill ${dBill < 0 ? 'down' : ''}">${pct(dBill)}</span> on ${mon(last.month)} · <b>${Math.round(runCore / TARGET * 100)}%</b> of $1.0M</p>` : '<p class="hb-note">The run has not started.</p>';
  const nextFact = `<span class="hb-lab">${mon(nb)}'s bill · building ◇</span><b>${nextBill != null ? '≈ ' + moneyK(nextBill) : '—'}</b><small>${X.bill ? `likely ${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)} · working day ${X.elapsed} of ${X.workdays}` : 'no priced month to value the work yet'}</small>`;
  const slipFact = `<span class="hb-lab">Slipping ›</span><b>${mv.slipping} accounts</b><small>${top ? `largest: ${esc(titleCase(top.customer))}, ${esc(top.why)}` : 'none down 10% on their own run'}</small>`;

  const hero = `<section class="hero-band" data-rv><div>${billFig}${billNote}${track}</div>
      <div class="hb-side"><div>${nextFact}</div><a href="#customers?view=slipping">${slipFact}</a></div></section>`;

  const gapCard = `<section class="card" data-rv>
      <h2 class="sec-t">Existing customers could close ${moneyK(B.levers)} of the ${moneyK(gapAll)} gap</h2>
      <p class="sec-s">From today's ${moneyK(B.today)} a month, the average of ${mon(B.sixFrom)} to ${mon(B.sixTo)}. Tap a lever for its accounts.</p>
      ${gapHtml(B)}
      <div class="src">◇ cross-sell is a ceiling · prices and slipping counted halfway · ${B.stopped.accounts} stopped accounts (${moneyK(B.stopped.lost)} a month) left out, <a href="#customers?view=slipping">listed with Slipping</a></div>
    </section>`;
  const landCard = `<section class="card" data-rv><div id="home-land"></div></section>`;
  const moveCard = `<section class="card" data-rv>
      <div class="card-head"><h3 id="home-ct-h"></h3><a href="#customers?view=main">All ›</a></div>
      <div class="seg" id="home-ct-seg"><a href="#" data-f="falling" class="on">Falling</a><a href="#" data-f="rising">Rising</a></div>
      <div id="home-ct"></div>
    </section>`;
  const tiles = `<div class="tiles">
      <a class="card tile" href="#customers?view=margin" data-rv><span class="lab">Gross margin ◇ ›</span><b>${Math.round(solidPc * 100)}%</b>
        <p><strong>${sure.length} account${sure.length === 1 ? '' : 's'}</strong> cost more to serve than ${sure.length === 1 ? 'it pays' : 'they pay'} (${moneyK(sureLoss)} a year); ${unsure.length} more while route costs are under review.</p></a>
      <a class="card tile" href="#customers?view=destruction" data-rv><span class="lab">Boxes past retention review ›</span><b>${Math.round(B.overdue.boxes / 1000)}K boxes</b>
        <p>Across ${B.overdue.accounts} accounts: about ${moneyK(B.overdue.oneOff)} once to destroy, and ${moneyK(B.overdue.storageLost)} a month of storage ended.</p></a>
    </div>`;
  const brief = `<details class="brief" data-rv><summary>The month in a paragraph ›</summary><p id="home-hv"></p><p class="src" id="home-by"></p></details>`;

  main.innerHTML = `<div class="h">${staleNote}${hero}${brief}
    ${gapCard}<div class="split">${landCard}${moveCard}</div>
    ${tiles}
    <div class="foot">Posted through ${mon(last.month)} ${last.month.slice(0, 4)} · work done through ${dayMonth(A.latestDone)} · ◇ modelled · tap any row to open it</div>
  </div>`;

  // the template first, then Claude's paragraph if it arrives and passes the check; text, never HTML
  const hv = main.querySelector('#home-hv'), by = main.querySelector('#home-by');
  hv.textContent = templateSummary(sheet);
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: sheet.map(({ key, line, say }) => ({ key, line, say })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && j.text && checkNumbers(j.text, sheet).ok && hv.isConnected) { hv.textContent = j.text; by.textContent = 'Written by Claude from the figures on this page; every number checked against them.'; } })
    .catch(() => {});

  // customers moving: a short list, each account with its thirteen months
  const T = customerTable(C, A, { bookPerService: perService }), ctLast = mon(T.last), ctBefore = mon(T.before);
  const list = (rows, f) => `<ul class="mv">${rows.map(r => `<li><a href="#customer/${r.level1}"><span class="t">${esc(titleCase(r.customer))}<small>${deltaText(r.lastPct)} on ${ctBefore}</small></span>${sparkline(r.spark, { w: 96, h: 28, cls: f === 'falling' ? 'down' : 'up' })}<span class="v">${f === 'falling' ? '−' : '+'}${moneyK(Math.abs(r.dLast))}</span></a></li>`).join('')}</ul>`;
  const ct = f => {
    const rows = (f === 'falling' ? falling(T) : rising(T)).slice(0, 5);
    main.querySelector('#home-ct-h').textContent = rows[0] ? `${titleCase(rows[0].customer)} ${f === 'falling' ? 'fell' : 'rose'} most in ${ctLast}` : 'Customers up and down';
    main.querySelector('#home-ct').innerHTML = list(rows, f);
    main.querySelectorAll('#home-ct tbody tr').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
    main.querySelectorAll('#home-ct-seg a').forEach(a => a.classList.toggle('on', a.dataset.f === f));
  };
  main.querySelectorAll('#home-ct-seg a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); ct(a.dataset.f); }));
  ct('falling');

  landing(main.querySelector('#home-land'), {
    title: nextBill != null ? `${mon(addMonths(billMonth, 1))}'s bill is heading for about ${moneyK(nextBill)} ◇` : 'Where the month lands',
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
