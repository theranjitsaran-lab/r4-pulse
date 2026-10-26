// Home — Trisha, phone first. Her number is core billed revenue (storage plus service, Citadel held
// apart) against $1.0m a month. Three things, in order:
//   the month: this month's bill (already known: this month's storage, last month's work) and the
//     next one building from this month's work, at its pace against last month's;
//   the route to $1.0m: today's six-month average, each lever in dollars a month, and what is left
//     for new business; every step opens the accounts behind it;
//   customers moving: dollars a month against each account's own run, falls and gains.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { buildMargins } from '/components/margin.js';
import { seriesOf } from '/views/customers.js';
import { bridge, TARGET, CITADEL } from '/components/levers.js';

const CSS = `
.home { display: grid; gap: 14px; }
.home .greet h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0; }
.home .greet p { color: var(--ink-3); margin: 2px 0 0; }
.home .month { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px; }
.home .month > div + div { border-left: 1px solid var(--rule); padding-left: 28px; }
.home .lede { font-size: 16px; color: var(--ink-2); margin: 8px 0 0; line-height: 1.45; }
.home .track { height: 10px; background: var(--well-2); border-radius: 5px; position: relative; margin: 16px 0 6px; overflow: hidden; }
.home .track i { position: absolute; top: 0; bottom: 0; }
.home .track i.st { background: var(--s-storage); border-radius: 5px 0 0 5px; }
.home .track i.sv { background: var(--s-service); }
.home .track i.est { background: repeating-linear-gradient(135deg, var(--s-service) 0 3px, transparent 3px 6px); }
.home .trackfoot { display: flex; gap: 14px; flex-wrap: wrap; font-size: var(--fs-source); color: var(--ink-3); }
.home .trackfoot i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; vertical-align: 0; }
.home .note { font-size: var(--fs-label); color: var(--ink-3); margin-top: 12px; line-height: 1.45; }
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
.home .movers { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 28px; margin-top: 8px; }
.home .mv { display: grid; grid-template-columns: minmax(0, 1fr) 40% 76px; gap: 12px; align-items: center; padding: 8px 4px; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.home .mv:hover { background: var(--well); }
.home .mv .nm { font-weight: 600; font-size: 14px; line-height: 1.25; }
.home .mv .nm small { display: block; font-weight: 400; font-size: 12px; color: var(--ink-3); }
.home .mv .bar { height: 12px; position: relative; }
.home .mv .bar i { position: absolute; top: 0; bottom: 0; border-radius: 3px; }
.home .mv.down .bar i { right: 0; background: var(--bad); }
.home .mv.up .bar i { left: 0; background: var(--good); }
.home .mv .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 14px; }
.home .mv.down .v { color: var(--bad); }
.home .mvh { font-size: 12px; color: var(--ink-3); padding: 0 4px 6px; }
.home .mrow { display: grid; grid-template-columns: auto minmax(0, 1fr) 14px; gap: 22px; align-items: center; color: inherit; text-decoration: none; }
.home .mrow:hover { background: var(--well); }
.home .mrow .lab { display: block; margin-bottom: 2px; }
.home .mrow .mtxt { font-size: 14.5px; line-height: 1.45; color: var(--ink-2); }
.home .mrow .go { color: var(--ink-5); font-size: 22px; }
.home .foot { font-size: var(--fs-source); color: var(--ink-4); text-align: center; padding: 4px 0 10px; }
@media (max-width: 760px) {
  .home .greet h1 { font-size: 28px; }
  .home .month { grid-template-columns: 1fr; gap: 18px; }
  .home .month > div + div { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule); padding-top: 16px; }
  .home .step { grid-template-columns: minmax(0, 1fr) 78px 14px; grid-template-areas: "nm v go" "lane lane lane"; gap: 6px 10px; }
  .home .step .nm { grid-area: nm; } .home .step .v { grid-area: v; } .home .step .go { grid-area: go; } .home .step .lane { grid-area: lane; }
  .home .movers { grid-template-columns: 1fr; }
  .home .mrow { grid-template-columns: minmax(0, 1fr) 14px; gap: 6px 10px; } .home .mrow > span:first-child { grid-column: 1; } .home .mrow .mtxt { grid-column: 1; grid-row: 2; } .home .mrow .go { grid-row: 1 / 3; grid-column: 2; }
  .home .mv { grid-template-columns: minmax(0, 1fr) 22% 62px; gap: 10px; }
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
const weekdays = m => { let n = 0; for (let d = new Date(m + 'T00:00:00Z'); d.getUTCMonth() === +m.slice(5, 7) - 1; d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() % 6) n++; return n; };

// Services done each working day of a month, from Veri-Shred done orders, cumulated.
function cumulative(A, month) {
  const by = new Map();
  for (const r of A.routeDays) if (r.date.startsWith(month.slice(0, 7)) && r.services_done > 0 && r.date <= A.latestDone) by.set(r.date, (by.get(r.date) || 0) + r.services_done);
  let t = 0;
  return [...by.keys()].sort().map((d, i) => ({ x: String(i + 1).padStart(2, '0'), y: (t += by.get(d)), date: d }));
}

// Each account's last three months against its own twelve before them, in dollars a month.
function movers(C) {
  const out = [];
  for (const s of seriesOf(C).values()) {
    if (s.level1 === CITADEL || s.ltm < 20000 || s.total.length < 15) continue;
    const last3 = s.total.slice(-3).reduce((t, v) => t + v, 0) / 3;
    const run = s.total.slice(-15, -3).reduce((t, v) => t + v, 0) / 12;
    out.push({ level1: s.level1, customer: s.customer, d: last3 - run, last3, run });
  }
  return { falls: out.filter(m => m.d < 0).sort((a, b) => a.d - b.d).slice(0, 5), gains: out.filter(m => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 5) };
}

export async function render(main, P) {
  if (!main) return;
  injectCss();
  const [PR, A, CA, C, M, R] = await Promise.all([getJson('pricing'), getJson('activity'), getJson('calls'), getJson('customers'), getJson('margin'), loadRates()]);

  // ── the month ──
  const last = P.monthly[P.monthly.length - 1];                 // the latest posted month
  const billMonth = addMonths(last.month, 1);                     // the bill in the current run
  const run = P.currentRun.find(r => r.part === 'run');
  const runCore = run ? run.storage + run.service - run.citadel : null;
  const workMonth = A.latestDone.slice(0, 8) + '01';              // the month being worked now
  const now = cumulative(A, workMonth), before = cumulative(A, addMonths(workMonth, -1));
  const nowDays = now.length, nowDone = nowDays ? now[nowDays - 1].y : 0;
  const prevDays = before.length, prevDone = prevDays ? before[prevDays - 1].y : 0;
  const atSameDay = before[nowDays - 1] ? before[nowDays - 1].y : null;
  const perDayNow = nowDays ? nowDone / nowDays : null, perDayPrev = prevDays ? prevDone / prevDays : null;
  // the work in the current run is last month's: its value per done service prices this month's work
  const perService = run && prevDone ? (run.service - run.citadel) / prevDone : null;
  const projService = perService && perDayNow ? perDayNow * weekdays(workMonth) * perService : null;
  const nextStorage = run ? run.storage : null;                    // storage carries forward; it is billed in advance
  const nextBill = projService != null ? nextStorage + projService : null;

  // ── the route to $1.0m ──
  const B = bridge({ P, PR, CA, M });
  const scale = v => v / (TARGET * 1.04) * 100;
  let cum = B.today;
  const stepRows = B.steps.map(s => { const from = cum; cum += s.v; return { ...s, from }; });

  // ── margin: the lines we can cost with confidence, and the accounts that cost more than they pay ──
  const book = buildMargins(R, M, { exclude: [CITADEL] });
  const solid = Object.entries(book.families).filter(([f, v]) => ['storage', 'shred', 'labour', 'itad'].includes(f) && v.revenue > 0);
  const solidPc = 1 - solid.reduce((t, [, v]) => t + v.cost, 0) / solid.reduce((t, [, v]) => t + v.revenue, 0);
  const losers = book.accounts.filter(a => a.revenue > 1000 && a.margin < 0);
  const lossTotal = -losers.reduce((t, a) => t + a.margin, 0);

  const mv = movers(C), mvMax = Math.max(1, ...mv.falls.map(m => -m.d), ...mv.gains.map(m => m.d));
  const hour = new Date().getHours();

  main.innerHTML = `
  <div class="home">
    <div class="greet"><h1>${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1><p>Core revenue: storage plus service, Citadel held apart · target $1.0M a month</p></div>

    <section class="card">
      <div class="month">
        <div>
          <div class="lab">${mon(billMonth)}'s bill · already known</div>
          <div class="hero">${runCore != null ? money0(runCore) : '—'}</div>
          <p class="lede">${runCore != null ? `<span class="delta ${dcls(runCore / last.core - 1)}">${pct(runCore / last.core - 1)}</span> on ${mon(last.month)}'s ${moneyK(last.core)}, and ${moneyK(TARGET - runCore)} short of $1.0M.` : 'The run has not started.'}</p>
          <div class="track"><i class="st" style="left:0;width:${run ? run.storage / TARGET * 100 : 0}%"></i><i class="sv" style="left:${run ? run.storage / TARGET * 100 : 0}%;width:${run ? (run.service - run.citadel) / TARGET * 100 : 0}%"></i></div>
          <div class="trackfoot"><span><i style="background:var(--s-storage)"></i>${mon(billMonth)} storage ${moneyK(run ? run.storage : 0)}</span><span><i style="background:var(--s-service)"></i>${mon(last.month)} work ${moneyK(run ? run.service - run.citadel : 0)}</span><span>bar ends at $1.0M</span></div>
          <p class="note">Storage bills in advance and work in arrears, so each month's bill is that month's storage and the month before's work. Citadel in this bill: ${run ? money0(run.citadel) : '—'}, held apart.</p>
        </div>
        <div>
          <div class="lab">${mon(addMonths(billMonth, 1))}'s bill · building from ${mon(workMonth)}'s work</div>
          <div class="hero">${nextBill != null ? '≈ ' + moneyK(nextBill) : '—'}<span style="font-size:18px;color:var(--ink-5);font-weight:400"> ◇</span></div>
          <p class="lede">${perDayNow ? `${nowDone.toLocaleString('en-US')} services done in ${nowDays} working day${nowDays === 1 ? '' : 's'} to ${dayMonth(A.latestDone)}: ${Math.round(perDayNow)} a day, <span class="delta ${dcls(perDayNow / perDayPrev - 1)}">${pct(perDayNow / perDayPrev - 1)}</span> on ${mon(addMonths(workMonth, -1))}'s ${Math.round(perDayPrev)}.${nowDays < 8 ? ' Early days: read the pace with care.' : ''}` : `No work done yet in ${mon(workMonth)}.`}</p>
          <div class="track"><i class="st" style="left:0;width:${nextStorage ? nextStorage / TARGET * 100 : 0}%"></i><i class="est" style="left:${nextStorage ? nextStorage / TARGET * 100 : 0}%;width:${projService ? projService / TARGET * 100 : 0}%"></i></div>
          <div class="trackfoot"><span><i style="background:var(--s-storage)"></i>storage carried forward ${moneyK(nextStorage || 0)}</span><span><i style="background:repeating-linear-gradient(135deg,var(--s-service) 0 2px,transparent 2px 4px)"></i>${mon(workMonth)} work at this pace ${moneyK(projService || 0)} ◇</span></div>
        </div>
      </div>
      <div id="home-pace" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--rule)"></div>
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
      <div class="src">Cross-sell is the ceiling if every account bought like comparable accounts ◇ · prices: half the gap to the book's median (storage weighted by boxes) · slipping: each account's shortfall against its own six-month level${B.minor.length ? ` · ${B.minor.map(m => m.t.toLowerCase()).join(', ')}: under $1K a month once price gaps are counted` : ''}</div>
    </section>

    <a class="card mrow" href="#customers?view=margin">
      <span><span class="lab">Gross margin ◇</span><span class="big">${Math.round(solidPc * 100)}%</span></span>
      <span class="mtxt">on storage, shredding, labour and ITAD over twelve months. <b>${losers.length} accounts cost more to serve than they pay</b>, ${moneyK(lossTotal)} a year between them; bins, retrieval and delivery are still under review. Open the margin drill: account, line, order.</span>
      <span class="go">›</span>
    </a>

    <section class="card">
      <div class="card-head"><h3>${mv.falls.length && -mv.falls[0].d > (mv.gains[0] ? mv.gains[0].d : 0) ? `${esc(titleCase(mv.falls[0].customer))} has fallen most, ${moneyK(-mv.falls[0].d)} a month below its own run` : mv.gains.length ? `${esc(titleCase(mv.gains[0].customer))} has grown most, ${moneyK(mv.gains[0].d)} a month above its own run` : 'Customers moving'}</h3><a href="#customers">Every customer by month ›</a></div>
      <div class="sub">The last three months against each account's own twelve before them, in dollars a month. Citadel apart.</div>
      <div class="movers">
        <div><div class="mvh">Falling</div>${mv.falls.map(m => `<a class="mv down" href="#customer/${m.level1}"><span class="nm">${esc(titleCase(m.customer))}<small>${mk(m.last3)} a month, was ${mk(m.run)}</small></span><span class="bar"><i style="width:${-m.d / mvMax * 100}%"></i></span><span class="v">−${moneyK(-m.d)}</span></a>`).join('')}</div>
        <div><div class="mvh">Rising</div>${mv.gains.map(m => `<a class="mv up" href="#customer/${m.level1}"><span class="nm">${esc(titleCase(m.customer))}<small>${mk(m.last3)} a month, was ${mk(m.run)}</small></span><span class="bar"><i style="width:${m.d / mvMax * 100}%"></i></span><span class="v">+${moneyK(m.d)}</span></a>`).join('')}</div>
      </div>
    </section>

    <div class="foot">Posted through ${mon(last.month)} ${last.month.slice(0, 4)} · work done through ${dayMonth(A.latestDone)} · ◇ modelled · tap any row to open it</div>
  </div>`;

  if (now.length || before.length) {
    lineChart(main.querySelector('#home-pace'), {
      title: atSameDay != null ? `${nowDone >= atSameDay ? 'Ahead of' : 'Behind'} ${mon(addMonths(workMonth, -1))} at the same working day` : 'Services done, by working day',
      series: [{ name: mon(addMonths(workMonth, -1)), cls: 'neutral', points: before }, { name: mon(workMonth), cls: 'service', points: now }].filter(s => s.points.length),
      xFormat: x => 'day ' + Number(x), yFormat: v => Math.round(v).toLocaleString('en-US'), height: 170, area: false,
      source: 'Veri-Shred done orders · services completed, cumulated by working day',
    });
  }
}
