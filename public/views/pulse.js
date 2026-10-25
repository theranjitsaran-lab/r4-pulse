// Pulse — Trisha, phone first. One idea per card: a number and a line, a tap for the rest.
// Top to bottom: this month · levers to grow EBITDA · gross margin by line of business · price it
// · the team · the trend. Citadel is lumpy: shown on its own line, never inside a total or a lever.
// Figures from /api/pulse, /api/margin, /api/pricing, /api/activity and /api/calls; costs from
// model/rates.js through components/margin.js. Nothing is typed in.
import { barChart, money0, moneyK } from '/components/chart.js';
import { buildMargins, FAMILY_NAMES } from '/components/margin.js';

const TARGET = 1e6;
const CITADEL = 6714, CITY_2FM = 8153;
const TYPICAL_RISE = 0.08;   // the median rise when a rate moves (rate rounds, 24 months; scripts/levers.js §2)
// Route costs leave out delivery routes, whose days are not yet in the route volumes, so anything
// built on a visit is shown as under review rather than as a verdict.
const UNDER_REVIEW = new Set(['movement', 'handling', 'bin']);

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monY = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const nextMonth = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)).toISOString().slice(0, 10);
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())
  .replace(/(?!^)\b(Of|And|The|For|In|At|On)\b/g, m => m.toLowerCase()).replace(/\b(Llp|Pc|Inc|Llc|It|Icu|Cboe|Aha|Ups|Nfa)\b/g, m => m.toUpperCase());
const perMonth = v => moneyK(v) + '/mo';

const CSS = `
.pv2 { max-width: 1080px; margin: 0 auto; display: grid; gap: 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.pv2 .wide { grid-column: 1 / -1; }
.pv2 .card { background: var(--surface); border-radius: 14px; padding: 20px 22px; }
.pv2 .eyebrow { font-family: var(--f-narrow); font-size: 11px; letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink-3); margin: 0 0 8px; display: flex; justify-content: space-between; gap: 12px; }
.pv2 .eyebrow a { text-transform: none; letter-spacing: 0; font-size: 13px; text-decoration: none; }
.pv2 .hero { font-family: var(--f-narrow); font-size: 52px; font-weight: 600; line-height: 1; letter-spacing: -.01em; white-space: nowrap; }
.pv2 .lede { font-family: var(--f-display); font-size: 22px; line-height: 1.3; margin: 10px 0 0; max-width: 40ch; }
.pv2 .bar { height: 10px; background: var(--well-2); border-radius: 5px; margin: 16px 0 6px; position: relative; overflow: hidden; }
.pv2 .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); border-radius: 5px; }
.pv2 .bar b { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ink-4); }
.pv2 .barfoot { display: flex; justify-content: space-between; font-family: var(--f-narrow); font-size: 12px; color: var(--ink-3); }
.pv2 .aside { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--rule); font-size: 13px; color: var(--ink-3); }
.pv2 .list { list-style: none; margin: 0; padding: 0; }
.pv2 .list li a { display: grid; grid-template-columns: minmax(0, 1fr) auto 14px; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.pv2 .list li:first-child a { border-top: 0; }
.pv2 .list .t { font-weight: 600; font-size: 15px; line-height: 1.3; }
.pv2 .list .s { display: block; font-weight: 400; font-size: 12.5px; color: var(--ink-3); margin-top: 2px; }
.pv2 .list .v { font-family: var(--f-narrow); font-size: 19px; font-weight: 600; text-align: right; white-space: nowrap; }
.pv2 .list .v small { display: block; font-size: 11px; font-weight: 400; color: var(--ink-3); }
.pv2 .list .go { color: var(--brand); font-size: 18px; }
.pv2 .total { font-family: var(--f-narrow); font-size: 34px; font-weight: 600; }
.pv2 .fam { display: grid; grid-template-columns: minmax(0, 1.2fr) 52px minmax(0, 1fr); gap: 10px; align-items: center; padding: 8px 0; border-top: 1px solid var(--rule); font-size: 14px; }
.pv2 .fam:first-of-type { border-top: 0; }
.pv2 .fam .pc { font-family: var(--f-narrow); font-weight: 600; text-align: right; }
.pv2 .fam .track { height: 8px; background: var(--well-2); border-radius: 4px; position: relative; }
.pv2 .fam .track i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); border-radius: 4px; }
.pv2 .fam.review { color: var(--ink-3); }
.pv2 .fam.review .track i { background: repeating-linear-gradient(135deg, var(--ink-5) 0 3px, transparent 3px 6px); }
.pv2 .chip { display: inline-block; font-family: var(--f-narrow); font-size: 11px; font-weight: 400; color: var(--ink-3); border: 1px dashed var(--ink-5); border-radius: 10px; padding: 0 7px; margin-left: 6px; vertical-align: 3px; white-space: nowrap; }
.pv2 .btn { display: inline-block; margin-top: 14px; background: var(--ink); color: var(--surface); text-decoration: none; font-weight: 600; padding: 10px 16px; border-radius: 10px; }
.pv2 .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.pv2 .k { font-family: var(--f-narrow); font-size: 30px; font-weight: 600; white-space: nowrap; }
.pv2 .ks { font-size: 12.5px; color: var(--ink-3); }
.pv2 .chart { padding: 0; background: none; }
.pv2 .chart .chart-head { display: none; }
.pv2 .foot { grid-column: 1 / -1; font-family: var(--f-narrow); font-size: 11px; color: var(--ink-4); text-align: center; padding: 8px 0 20px; }
@media (max-width: 760px) {
  .pv2 { grid-template-columns: 1fr; gap: 12px; }
  .pv2 .card { padding: 18px; border-radius: 12px; }
  .pv2 .hero { font-size: 44px; }
  .pv2 .lede { font-size: 19px; }
  .pv2 .two { grid-template-columns: 1fr; }
}`;

function injectCss() {
  if (document.getElementById('pv2-css')) return;
  const s = document.createElement('style'); s.id = 'pv2-css'; s.textContent = CSS; document.head.appendChild(s);
}
async function getJson(name) {
  const r = await fetch('/api/' + name); if (!r.ok) throw new Error(`${name}: ${r.status}`); return (await r.json()).data;
}
// model/rates.js is a classic script: add it once, however many times the screen renders
let ratesLoading = null;
function loadRates() {
  if (window.R4RATES) return Promise.resolve(window.R4RATES);
  return ratesLoading || (ratesLoading = new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = '/model/rates.js';
    s.onload = () => ok(window.R4RATES); s.onerror = () => { ratesLoading = null; fail(new Error('model/rates.js did not load')); };
    document.head.appendChild(s);
  }));
}

// Levers to grow EBITDA, each sized from the data in dollars a month, Citadel never among them.
function levers(P, PR, CA, A, R) {
  const out = [];
  // accounts that missed every rate round: the typical rise on their last twelve months
  const missed = CA.filter(c => c.not_raised_2y && c.level1 !== CITADEL);
  if (missed.length) {
    const rev = missed.reduce((t, c) => t + c.service, 0);
    out.push({ t: `Raise the ${missed.length} accounts that missed every rate round`, s: `${moneyK(rev)} of service a year at rates unchanged for two years`, v: rev * TYPICAL_RISE / 12, conf: 'measured', href: '#calls', owner: 'Anne' });
  }
  // 2FM storage, halfway towards the rest of the book
  const fm = PR.storage.find(r => r.level1 === CITY_2FM), rest = PR.storage.filter(r => r.level1 !== CITY_2FM);
  if (fm) {
    const restRate = rest.reduce((t, r) => t + r.storage_billed, 0) / rest.reduce((t, r) => t + r.boxes, 0);
    out.push({ t: `Move 2FM storage halfway to the book's rate`, s: `$${fm.rate_per_box.toFixed(3)} a box on ${fm.boxes.toLocaleString('en-US')} boxes; the rest of the book pays $${restRate.toFixed(3)}`, v: (restRate - fm.rate_per_box) / 2 * fm.boxes, conf: 'measured', href: '#pricing', owner: 'Trisha' });
  }
  // accounts below their own run two months running: back to their six-month level
  const down = P.downTwoMonths.filter(d => d.level1 !== CITADEL && d.trailing6_mean > d.revenue);
  if (down.length) out.push({ t: `Win back ${down.length} accounts running below their own level`, s: down.slice(0, 2).map(d => title(d.customer)).join(', ') + ' and others, two months down', v: down.reduce((t, d) => t + d.trailing6_mean - d.revenue, 0), conf: 'measured', href: '#calls', owner: 'Anne' });
  // 95-gallon accounts below the median, to the median
  const b2 = PR.rates.filter(r => r.servcode === 'B2' && r.modal_rate > 0 && r.units > 0);
  if (b2.length) {
    const med = b2.map(r => r.modal_rate).sort((a, b) => a - b)[Math.floor(b2.length / 2)];
    const low = b2.filter(r => r.modal_rate < med);
    out.push({ t: `Bring ${low.length} 95-gallon accounts up to the median`, s: `median $${med.toFixed(2)} a service; the rate definition is being confirmed`, v: low.reduce((t, r) => t + (med - r.modal_rate) * r.units, 0) / 12, conf: 'review', href: '#pricing', owner: 'Anne' });
  }
  // route days: a fuller day on the lighter routes (the last five weeks against the 75th percentile)
  const days = A.routeDays.filter(d => d.services_done > 0 && d.date <= A.latestDone);
  if (days.length > 10) {
    const s = days.map(d => d.services_done).sort((a, b) => a - b), p75 = s[Math.floor(s.length * .75)];
    const needed = Math.ceil(s.reduce((t, v) => t + v, 0) / p75);
    out.push({ t: 'Fill the lighter route days', s: `${days.length - needed} fewer route days in five weeks at today's fuller-day load, a ceiling`, v: (days.length - needed) * R.RATES.routeDay.v / 5 * 52 / 12, conf: 'review', href: '#activity', owner: 'Mike' });
  }
  return out.sort((a, b) => b.v - a.v);
}

export async function render(main, P) {
  if (!main) return;
  injectCss();
  const [R, M, PR, A, CA] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing'), getJson('activity'), getJson('calls')]);

  const months = P.monthly, last = months[months.length - 1];
  const run = P.currentRun.find(r => r.part === 'run');
  const runCore = run ? run.storage + run.service - run.citadel : null;
  const runMonth = nextMonth(last.month);
  const six = months.slice(-7, -1), core6 = six.reduce((t, m) => t + m.core, 0) / six.length;
  const book = buildMargins(R, M, { exclude: [CITADEL] });
  const lv = levers(P, PR, CA, A, R);
  const lvTotal = lv.reduce((t, l) => t + l.v, 0);
  const lvSolid = lv.filter(l => l.conf === 'measured').reduce((t, l) => t + l.v, 0);

  // margin by line of business, Citadel apart; 'other' carries no cost, so it stays out of the list
  const fams = Object.entries(book.families).filter(([f, v]) => f !== 'other' && v.revenue > 0)
    .map(([f, v]) => ({ f, ...v, pc: 1 - v.cost / v.revenue })).sort((a, b) => b.revenue - a.revenue);
  const solid = fams.filter(x => !UNDER_REVIEW.has(x.f));
  const solidPc = 1 - solid.reduce((t, x) => t + x.cost, 0) / solid.reduce((t, x) => t + x.revenue, 0);

  // Mike: done services per route day, the latest week against the twelve-month norm
  const done = A.routeDays.filter(d => d.services_done > 0 && d.date <= A.latestDone);
  const wkFrom = new Date(new Date(A.latestDone + 'T00:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
  const wk = done.filter(d => d.date >= wkFrom);
  const wkRate = wk.reduce((t, d) => t + d.services_done, 0) / (wk.length || 1);
  const wd = A.weekdays.filter(d => d.dow <= 5);
  const norm = wd.reduce((t, d) => t + d.done_per_day * d.route_days, 0) / wd.reduce((t, d) => t + d.route_days, 0);

  // price it: the biggest single price gaps in the book, each account's rate against its service's
  // median, sized by its volume. Codes whose units are services, boxes, trips, pounds or devices.
  const PRICED = ['B2', 'B3', 'B6', '01', '20', '25', '30', 'S3', 'S4', 'S6'];
  const meds = {};
  for (const code of PRICED) {
    const v = PR.rates.filter(r => r.servcode === code && r.modal_rate > 0 && r.units > 0).map(r => r.modal_rate).sort((a, b) => a - b);
    if (v.length >= 20) meds[code] = v[Math.floor(v.length / 2)];
  }
  const gaps = PR.rates.filter(r => meds[r.servcode] && r.level1 !== CITADEL && r.modal_rate > 0 && r.modal_rate < meds[r.servcode] && r.units > 0)
    .map(r => ({ ...r, med: meds[r.servcode], worth: (meds[r.servcode] - r.modal_rate) * r.units / 12 }))
    .sort((a, b) => b.worth - a.worth);
  const gapTop = gaps.slice(0, 3), gapAll = gaps.reduce((t, g) => t + g.worth, 0);
  const svcName = s => String(s || '').toLowerCase().replace(/^./, c => c.toUpperCase());

  const ahead = runCore != null ? runCore - last.core : null;
  const shortDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  main.innerHTML = `
  <div class="pv2">
    <section class="card wide">
      <p class="eyebrow"><span>${mon(runMonth)} billing run so far · core</span><span>${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></p>
      <div class="hero">${runCore != null ? money0(runCore) : '—'}</div>
      <p class="lede">${runCore != null ? `${ahead >= 0 ? 'Ahead of' : 'Behind'} ${mon(last.month)} by ${money0(Math.abs(ahead))}, and ${money0(TARGET - runCore)} short of $1.0m.` : 'The run for this month has not started.'}</p>
      <div class="bar"><i style="width:${Math.min(100, (runCore || 0) / TARGET * 100)}%"></i><b style="left:${last.core / TARGET * 100}%" title="${mon(last.month)}"></b></div>
      <div class="barfoot"><span>grey mark: ${mon(last.month)} ${moneyK(last.core)}</span><span>$1.0m</span></div>
      <div class="aside">Citadel, held apart: ${run ? money0(run.citadel) : '—'} in this run. Settlements land in lumps and are never counted above. · ${run ? run.invoices.toLocaleString('en-US') : '—'} invoices in the run, work to ${run ? shortDate(run.latest_work_date) : '—'}.</div>
    </section>

    <section class="card wide">
      <p class="eyebrow"><span>Levers to grow EBITDA</span><span>a month, Citadel apart</span></p>
      <div class="total">up to ${moneyK(lvTotal)}/mo<span class="chip">${moneyK(lvSolid)} measured · the rest under review</span></div>
      <ul class="list" style="margin-top:8px">
        ${lv.map(l => `<li><a href="${l.href}"><span class="t">${esc(l.t)}<span class="s">${esc(l.s)} · ${esc(l.owner)}</span></span><span class="v">${perMonth(l.v)}${l.conf === 'review' ? '<small>◇ under review</small>' : ''}</span><span class="go">›</span></a></li>`).join('')}
      </ul>
    </section>

    <section class="card">
      <p class="eyebrow"><span>Gross margin · last 12 months</span><a href="#margin">All accounts ›</a></p>
      <div class="k">${Math.round(solidPc * 100)}%</div><div class="ks">across storage, shredding, labour and ITAD, Citadel apart ◇</div>
      <div style="margin-top:12px">
        ${fams.map(x => `<div class="fam ${UNDER_REVIEW.has(x.f) ? 'review' : ''}"><span>${esc(FAMILY_NAMES[x.f] || x.f)}${UNDER_REVIEW.has(x.f) ? '<span class="chip">under review</span>' : ''}</span><span class="pc">${UNDER_REVIEW.has(x.f) ? '—' : Math.round(x.pc * 100) + '%'}</span><span class="track"><i style="width:${UNDER_REVIEW.has(x.f) ? 100 : Math.max(0, x.pc) * 100}%"></i></span></div>`).join('')}
      </div>
      <div class="aside">Route-based lines are under review: delivery routes are not yet in the route volumes, so visit costs run high.</div>
    </section>

    <section class="card">
      <p class="eyebrow"><span>Price it</span><span>the biggest gaps to the median</span></p>
      <div class="k">${perMonth(gapAll)}</div>
      <div class="ks">if every account under its service's median moved to it · ${gaps.length} account-services, Citadel apart</div>
      <ul class="list" style="margin-top:8px">
        ${gapTop.map(g => `<li><a href="#pricing"><span class="t">${esc(title(g.customer))}<span class="s">${esc(svcName(g.service))}: $${g.modal_rate.toFixed(2)} against a $${g.med.toFixed(2)} median</span></span><span class="v">${perMonth(g.worth)}</span><span class="go">›</span></a></li>`).join('')}
      </ul>
      <a class="btn" href="#pricing">Price a customer ›</a>
    </section>

    <section class="card wide">
      <p class="eyebrow"><span>The team this week</span><span>against their own norm</span></p>
      <div class="two">
        <div><div class="ks">Mike · routes</div><div class="k">${wkRate.toFixed(1)}</div><div class="ks">done services a route day in the week to ${shortDate(A.latestDone)}, against ${norm.toFixed(1)} over twelve months</div></div>
        <div><div class="ks">Anne · pricing and calls</div><div class="pending" style="margin-top:6px">Starts with the Calls screen: accounts repriced and calls logged each week.</div></div>
      </div>
    </section>

    <section class="card wide">
      <p class="eyebrow"><span>Core by month · Citadel apart</span><span>six-month average ${moneyK(core6)}</span></p>
      <div id="pv2-trend"></div>
    </section>

    <div class="foot">Data posted through ${mon(last.month)} ${last.month.slice(0, 4)} · ◇ modelled from model/rates.js · tap any row for its evidence</div>
  </div>`;

  barChart(main.querySelector('#pv2-trend'), {
    // thirteen months on a desktop, seven on a phone so the figures stay legible
    title: 'Core by month', bars: months.slice(innerWidth < 760 ? -7 : -13).map(m => ({ label: monY(m.month), value: m.core, cls: m.core < core6 ? 'is-muted' : '' })),
    yFormat: v => moneyK(v), height: 170,
  });
}
