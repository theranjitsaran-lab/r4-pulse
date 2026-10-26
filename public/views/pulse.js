// Home — Trisha, phone first. Her number is core billed revenue (storage plus service, Citadel held
// apart) against $1.0m a month. Three things, in order:
//   the month: this month's bill (already known: this month's storage, last month's work) and the
//     next one building from this month's work, at its pace against last month's;
//   the route to $1.0m: today's six-month average, each lever in dollars a month, and what is left
//     for new business; every step opens the accounts behind it;
//   customers moving: dollars a month against each account's own run, falls and gains.
import { money0, moneyK } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { marginSummary } from '/components/margin.js';
import { moveReason } from '/components/series.js';
import { project, dailyFrom, curve } from '/components/projection.js';
import { templateSummary, checkNumbers } from '/components/summary.js';
import { customerTable, falling, rising, tableHtml } from '/components/custtable.js';
import { bridge, billNow, slippingAccounts, risingAccounts, TARGET, CITADEL } from '/components/levers.js';

const CSS = `
.home { display: grid; gap: 14px; }
.home .greet .hi { color: var(--ink-3); margin: 0 0 6px; font-size: var(--fs-label); }
.home .greet .hv { font-size: 23px; line-height: 1.35; font-weight: 500; letter-spacing: -.01em; margin: 0; max-width: 980px; }
.home .greet .by { margin: 6px 0 0; font-size: var(--fs-source); color: var(--ink-4); }
.home .stale { margin: 0; padding: 8px 12px; border-radius: var(--r-sm); background: var(--warn-bg); color: var(--warn); font-size: var(--fs-label); }
.home .landgrid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 28px; }
.home .facts { display: flex; flex-direction: column; gap: 0; border-left: 1px solid var(--rule); padding-left: 24px; }
.home .fact { display: block; padding: 12px 0; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; font-size: 13.5px; line-height: 1.45; color: var(--ink-2); }
.home .fact:first-child { border-top: 0; padding-top: 2px; }
.home a.fact:hover .lab { color: var(--brand); }
.home .fact .lab { display: block; margin-bottom: 2px; }
.home .fact b { display: block; font-size: 30px; font-weight: 700; letter-spacing: var(--track-tight); color: var(--ink); line-height: 1.15; margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.home .c-line.faint { stroke-dasharray: 2 4; } .home i.k.faint { opacity: .5; }
.home .lede { font-size: 16px; color: var(--ink-2); margin: 8px 0 0; line-height: 1.45; }
.home h2.t { font-size: 22px; font-weight: 700; letter-spacing: var(--track-tight); margin: 0 0 4px; line-height: 1.2; }
.home .bridge { margin-top: 16px; }
.home .step { display: grid; grid-template-columns: minmax(0, 34%) minmax(0, 1fr) 84px 14px; gap: 14px; align-items: center; padding: 9px 4px; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.home a.step:hover { background: var(--well); }
.home .step:first-child { border-top: 0; }
.home .step .nm { font-weight: 600; line-height: 1.3; }
.home .step .nm small { display: block; font-weight: 400; font-size: var(--fs-label); color: var(--ink-3); margin-top: 2px; }
.home .step .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.home .step .v small { display: block; font-weight: 400; font-size: 11.5px; color: var(--ink-3); }
.home .step .go { color: var(--ink-5); font-size: 20px; }
.home .lane { position: relative; height: 22px; }
.home .lane::before { content: ""; position: absolute; left: 0; right: 0; top: 10px; height: 2px; background: var(--well-2); border-radius: 1px; }
.home .lane i { position: absolute; top: 3px; height: 16px; border-radius: 4px; background: var(--ink-3); }
.home .lane i.today { background: var(--ink); }
.home .lane i.ceil { background: repeating-linear-gradient(135deg, var(--ink-3) 0 3px, transparent 3px 6px); border: 1px solid var(--ink-3); }
.home .lane i.newb { background: none; border: 1.5px dashed var(--ink-4); }
.home .lane b { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink); }
.home .lane .tg { position: absolute; top: -16px; transform: translateX(-100%); font-size: 11px; color: var(--ink-3); white-space: nowrap; padding-right: 4px; }
.home .aside { margin-top: 14px; padding: 12px 14px; background: var(--well); border-radius: var(--r); font-size: var(--fs-label); color: var(--ink-2); line-height: 1.5; }
.home .mrow { display: grid; grid-template-columns: auto minmax(0, 1fr) 14px; gap: 22px; align-items: center; color: inherit; text-decoration: none; }
.home .mrow:hover { background: var(--well); }
.home .mrow .lab { display: block; margin-bottom: 2px; }
.home .mrow .mtxt { font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }
.home .mrow .go { color: var(--ink-5); font-size: 22px; }
.home .foot { font-size: var(--fs-source); color: var(--ink-4); text-align: center; padding: 4px 0 10px; }
@media (max-width: 760px) {
  .home .greet .hv { font-size: 18px; }
  .home .landgrid { grid-template-columns: 1fr; gap: 8px; } .home .facts { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule); }
  .home .step { grid-template-columns: minmax(0, 1fr) 78px 14px; grid-template-areas: "nm v go" "lane lane lane"; gap: 6px 10px; }
  .home .step .nm { grid-area: nm; } .home .step .v { grid-area: v; } .home .step .go { grid-area: go; } .home .step .lane { grid-area: lane; }
  .home .mrow { grid-template-columns: minmax(0, 1fr) 14px; gap: 6px 10px; } .home .mrow > span:first-child { grid-column: 1; } .home .mrow .mtxt { grid-column: 1; grid-row: 2; } .home .mrow .go { grid-row: 1 / 3; grid-column: 2; }
}`;

function injectCss() {
  if (document.getElementById('home-css')) return;
  const s = document.createElement('style'); s.id = 'home-css'; s.textContent = CSS; document.head.appendChild(s);
}
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
  injectCss();
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

  main.innerHTML = `
  <div class="home">
    ${staleNote}<div class="greet"><p class="hi">${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'} · core revenue, Citadel apart · target $1.0M a month</p>
      <h1 class="hv" id="home-hv"></h1><p class="by" id="home-by"></p></div>

    <section class="card land">
      <div class="landgrid">
        <div id="home-land"></div>
        <div class="facts">
          <a class="fact" href="#customers?view=main"><span class="lab">${mon(billMonth)}'s bill · already known ›</span><b>${runCore != null ? moneyK(runCore) : '—'}</b><span>${runCore != null ? `<span class="delta ${dcls(runCore / last.core - 1)}">${pct(runCore / last.core - 1)}</span> on ${mon(last.month)}'s ${moneyK(last.core)}: ${mon(billMonth)}'s storage and ${mon(last.month)}'s work, Citadel's ${moneyK(run.citadel)} apart.` : 'The run has not started.'}</span></a>
          <div class="fact"><span class="lab">${mon(addMonths(billMonth, 1))}'s bill · building now ◇</span><b>${nextBill != null ? '≈ ' + moneyK(nextBill) : '—'}</b><span>${X.bill ? `Likely ${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)}. ${X.doneToDate.toLocaleString('en-US')} services done in ${X.elapsed} of ${X.workdays} working days; the other ${X.remaining} at ${Math.round(X.pace)} a day, ${X.paces.length > 1 ? `the median of the last ${X.paces.length} months` : `${mon(X.paces.length ? X.paces[0].month : workMonth)}'s pace`}.` : 'Not yet calculable: no priced month to value the work.'}</span></div>
          <div class="fact"><span class="lab">How far to trust it</span><span>${X.backtest ? `Projected this way from working day ${X.elapsed}, the last ${X.backtest.n} months landed inside their band ${X.backtest.hits} times.` : `Untested: the band is the middle half of recent days. The next snapshot adds fifteen months of daily work, and each of the last twelve months is then projected from the same day to test it.`}${X.bookings ? ` Bookings to ${dayMonth(X.bookings.horizon)} point to ${Math.round(X.bookings.done).toLocaleString('en-US')} services by then, at the ${Math.round(X.bookings.completion * 100)}% of bookings R4 completes.` : ''}</span></div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2 class="t">Existing customers could carry ${moneyK(B.levers)} of the ${moneyK(TARGET - B.today)} a month to $1.0M</h2>
      <div class="sub">From today's ${moneyK(B.today)} a month (the six-month average, ${mon(B.sixFrom)} to ${mon(B.sixTo)}). The rest, ${moneyK(B.newBusiness)} a month, has to come from new business. Tap a step for the accounts behind it.</div>
      <div class="bridge">
        <div class="step"><span class="nm">Today<small>six-month average, core</small></span><span class="lane"><i class="today" style="left:0;width:${scale(B.today)}%"></i><b style="left:${scale(TARGET)}%"></b></span><span class="v">${moneyK(B.today)}</span><span></span></div>
        ${stepRows.map(s => `<a class="step" href="${s.href}"><span class="nm">${esc(s.t)}<small>${esc(s.s)} · ${esc(s.who)}</small></span><span class="lane"><i class="${s.modelled ? 'ceil' : ''}" style="left:${scale(s.from)}%;width:${Math.max(.6, scale(s.v))}%"></i><b style="left:${scale(TARGET)}%"></b></span><span class="v">+${moneyK(s.v)}${s.note || s.modelled ? `<small>${esc(s.note || '')}${s.modelled ? ' ◇' : ''}</small>` : ''}</span><span class="go">›</span></a>`).join('')}
        <div class="step"><span class="nm">New business<small>what the levers above leave to win</small></span><span class="lane"><i class="newb" style="left:${scale(cum)}%;width:${scale(B.newBusiness)}%"></i><b style="left:${scale(TARGET)}%"></b><span class="tg" style="left:${scale(TARGET)}%">$1.0M</span></span><span class="v">+${moneyK(B.newBusiness)}</span><span></span></div>
      </div>
      <div class="aside"><b>Boxes past their retention review:</b> ${Math.round(B.overdue.boxes).toLocaleString('en-US')} across ${B.overdue.accounts} accounts. Destroying them would bill about ${moneyK(B.overdue.oneOff)} once, at the book's median $${B.overdue.perBox.toFixed(2)} a box, and end about ${moneyK(B.overdue.storageLost)} a month of storage, so it sits beside the bridge rather than in it. <a href="#customers?view=destruction">The accounts and their boxes ›</a></div>
      <div class="src">Cross-sell is the ceiling if every account bought like comparable accounts ◇ · prices: half the gap to the book's median (storage weighted by boxes) · slipping: half the shortfall of accounts still billing, last three months against their own twelve before · left out: ${B.stopped.accounts} accounts that have stopped or nearly (${moneyK(B.stopped.lost)} a month), often one-off projects, <a href="#customers?view=slipping" style="color:var(--brand)">listed with Slipping</a>${B.minor.length ? ` · ${B.minor.map(m => m.t.toLowerCase()).join(', ')}: under $1K a month once price gaps are counted` : ''}</div>
    </section>

    <a class="card mrow" href="#customers?view=margin">
      <span><span class="lab">Gross margin ◇</span><span class="big">${Math.round(solidPc * 100)}%</span></span>
      <span class="mtxt">on storage, shredding, labour and ITAD over twelve months. <b>${sure.length} account${sure.length === 1 ? '' : 's'} cost more to serve than ${sure.length === 1 ? 'it pays' : 'they pay'}</b> on costs we are sure of (${moneyK(sureLoss)} a year); ${unsure.length} more look that way only because route costs are under review. Open the margin drill: account, line, order.</span>
      <span class="go">›</span>
    </a>

    <section class="card">
      <div class="card-head"><h3 id="home-ct-h"></h3><a href="#customers?view=main">Every customer up and down ›</a></div>
      <div class="tools" style="margin:4px 0 6px"><div class="seg" id="home-ct-seg"><a href="#" data-f="falling" class="on">Falling</a><a href="#" data-f="rising">Rising</a></div></div>
      <div id="home-ct" style="overflow-x:auto"></div>
    </section>

    <div class="foot">Posted through ${mon(last.month)} ${last.month.slice(0, 4)} · work done through ${dayMonth(A.latestDone)} · ◇ modelled · tap any row to open it</div>
  </div>`;

  // the template first, then Claude's paragraph if it arrives and passes the check; text, never HTML
  const hv = main.querySelector('#home-hv'), by = main.querySelector('#home-by');
  hv.textContent = templateSummary(sheet);
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sheet: sheet.map(({ key, line, say }) => ({ key, line, say })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && j.text && checkNumbers(j.text, sheet).ok && hv.isConnected) { hv.textContent = j.text; by.textContent = 'Written by Claude from the figures on this page; every number checked against them.'; } })
    .catch(() => {});

  // customers up and down: the same table as Customers, five rows
  const T = customerTable(C, A, { bookPerService: perService }), ctLast = mon(T.last);
  const ct = f => {
    const rows = (f === 'falling' ? falling(T) : rising(T)).slice(0, 5);
    main.querySelector('#home-ct-h').textContent = rows[0] ? `${titleCase(rows[0].customer)} ${f === 'falling' ? 'fell' : 'rose'} most in ${ctLast}, ${f === 'falling' ? '−' : '+'}${moneyK(Math.abs(rows[0].dLast))} on the month before` : 'Customers up and down';
    main.querySelector('#home-ct').innerHTML = tableHtml(T, rows);
    main.querySelectorAll('#home-ct tbody tr').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
    main.querySelectorAll('#home-ct-seg a').forEach(a => a.classList.toggle('on', a.dataset.f === f));
  };
  main.querySelectorAll('#home-ct-seg a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); ct(a.dataset.f); }));
  ct('falling');

  landing(main.querySelector('#home-land'), {
    title: nextBill != null ? `${mon(addMonths(billMonth, 1))}'s bill is heading for about ${moneyK(nextBill)} ◇, ${moneyK(TARGET - nextBill)} short of $1.0M` : 'Where the month lands',
    sub: `Each line is one bill building through the month: the storage it carries, then the work done each working day, at last month's ${perService ? '$' + perService.toFixed(2) : ''} a service ◇.`,
    series: [
      { name: `${mon(addMonths(lyMonth, 1))} ${addMonths(lyMonth, 1).slice(0, 4)}'s bill`, cls: 'neutral faint', points: lastYear },
      { name: `${mon(billMonth)}'s bill`, cls: 'neutral', points: lastMonth },
      { name: `${mon(addMonths(billMonth, 1))}'s bill so far`, cls: 'service', points: thisMonth },
    ].filter(x => x.points.length),
    cone: X.bill && thisMonth.length ? { from: thisMonth[thisMonth.length - 1], to: X.workdays, lo: X.bill.lo, c: X.bill.central, hi: X.bill.hi } : null,
    days: X.workdays, target: TARGET,
    source: `Veri-Shred done orders by working day · storage and last month's work from the current VCK run · ${lastYear.length ? 'last year priced to end on its posted bill' : 'last year joins with the next snapshot'} · weekend work counted on the Friday`,
  });
}

// Where the month lands: bills building by working day, the projection as a cone to month end,
// the target as a hairline. One axis; a crosshair reads every line at a working day.
function landing(el, o) {
  if (!el) return;
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
