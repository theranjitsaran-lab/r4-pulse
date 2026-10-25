// Pulse — Trisha, phone first, weekly. Briefing register.
// Top to bottom: date · headline carrying the gap · the core bar with the month in progress as a
// dashed range · Needs a decision (four rows, ranked by money at stake) · storage and service side
// by side · the 23-month chart titled by its conclusion · finding of the week.
// Every figure comes from /api/pulse, plus /api/margin and /api/pricing for the decision rows;
// costs come from model/rates.js. Nothing is typed in.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { meter } from '/components/meter.js';

const TARGET = 1e6;
const CITADEL = 6714, CITY_2FM = 8153;

// Iron Mountain's published figures, shown beside R4's. Not in the database: carried from the
// committed design (docs/design/pulse-desktop.png), Iron Mountain Q3 2025. Confirm the source.
const IRON_MOUNTAIN = { label: 'Iron Mountain Q3 2025', storageGrowth: 5.1, serviceGrowth: 4.7, storageMargin: 70.5, serviceMargin: 32.0, retention: 93.2 };

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct0 = v => Math.round(v) + '%';
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
// VCK names are in capitals; set them in title case, small words lower, firm suffixes upper
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase())
  .replace(/(?!^)\b(Of|And|The|For|In|At|On)\b/g, m => m.toLowerCase()).replace(/\b(Llp|Pc|Inc|Llc|It)\b/g, m => m.toUpperCase());

const CSS = `
.pulse { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; }
.pulse .date { font-family: var(--f-narrow); color: var(--ink-3); font-size: var(--fs-label); margin: 0 0 6px; }
.pulse .top { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr); gap: 40px; align-items: end; margin-bottom: 40px; }
.pulse h1 { font-family: var(--f-display); font-weight: 400; font-size: var(--fs-display); line-height: 1.06; letter-spacing: var(--track-tight); margin: 0; max-width: 24ch; }
.pulse section { margin-bottom: 40px; }
.pulse .sec h2 { font-size: var(--fs-head); margin: 0; }
.pulse .sec small { font-family: var(--f-narrow); font-size: var(--fs-source); color: var(--ink-3); text-align: right; }
.decisions .row { display: grid; grid-template-columns: 120px minmax(0, 1.6fr) 150px minmax(0, 1.4fr) 56px; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--rule-2); align-items: start; }
.decisions .tag { font-family: var(--f-narrow); font-size: var(--fs-label); font-weight: 600; display: flex; gap: 8px; align-items: baseline; color: var(--ink-2); }
.decisions .tag::before { content: ""; width: 9px; height: 9px; background: currentColor; display: inline-block; }
.decisions .tag.is-bad { color: var(--bad); }
.decisions .tag.is-warn { color: var(--warn); }
.decisions .tag.is-warn::before { background: none; border: 1.5px solid currentColor; }
.decisions .say { font-weight: 600; font-size: var(--fs-body-lg); line-height: 1.4; }
.decisions .money { font-family: var(--f-narrow); font-size: var(--fs-num); font-weight: 600; text-align: right; white-space: nowrap; line-height: 1.1; }
.decisions .money small { display: block; font-size: var(--fs-source); font-weight: 400; color: var(--ink-3); }
.decisions .why { font-size: var(--fs-label); color: var(--ink-3); line-height: 1.5; }
.decisions .open { font-family: var(--f-narrow); font-weight: 600; text-align: right; }
.halves { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.half { background: var(--surface); border-radius: var(--r-lg); padding: 16px 18px; display: grid; grid-template-columns: 1.15fr 1fr 1fr 1fr; gap: 16px; }
.half h3 { margin: 0 0 4px; font-size: var(--fs-head); }
.half .big { font-family: var(--f-narrow); font-size: var(--fs-num-lg); font-weight: 600; white-space: nowrap; }
.half .note { font-size: var(--fs-source); color: var(--ink-3); line-height: 1.4; margin-top: 2px; }
.half .k { font-family: var(--f-narrow); font-size: var(--fs-num); font-weight: 600; white-space: nowrap; margin: 2px 0; }
.half .im { font-family: var(--f-narrow); font-size: var(--fs-source); color: var(--ink-3); margin-top: 4px; }
.finding { border-top: 2px solid var(--rule-ink); padding-top: 12px; }
.finding p { font-family: var(--f-display); font-size: 30px; line-height: 1.2; margin: 6px 0 12px; max-width: 34ch; }
@media (max-width: 900px) {
  .pulse .top { grid-template-columns: 1fr; gap: 22px; margin-bottom: 28px; }
  .pulse h1 { font-size: 28px; line-height: 1.12; }
  .decisions .row { grid-template-columns: 1fr auto; gap: 6px 14px; }
  .decisions .tag { grid-column: 1 / -1; }
  .decisions .why { grid-column: 1 / -1; }
  .decisions .open { grid-column: 1 / -1; text-align: left; }
  .halves { grid-template-columns: 1fr; }
  .half { grid-template-columns: 1fr 1fr; }
  .finding p { font-size: 24px; }
  /* above the fold on a phone: the headline, the core bar and one chart */
  .pulse .p-chart { order: 1; } .pulse .p-decide { order: 2; } .pulse .p-halves { order: 3; } .pulse .finding { order: 4; }
}`;

function injectCss() {
  if (document.getElementById('pulse-css')) return;
  const s = document.createElement('style');
  s.id = 'pulse-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

async function getJson(name) {
  const r = await fetch('/api/' + name);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return (await r.json()).data;
}

// model/rates.js is a classic script: add it once, however many times the screen renders
let ratesLoading = null;
function loadRates() {
  if (window.R4RATES) return Promise.resolve(window.R4RATES);
  return ratesLoading || (ratesLoading = new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = '/model/rates.js';
    s.onload = () => ok(window.R4RATES);
    s.onerror = () => { ratesLoading = null; fail(new Error('model/rates.js did not load')); };
    document.head.appendChild(s);
  }));
}

// The four decision rows, each from the data, ranked by money at stake.
function decisions(P, M, PR, R) {
  const rows = [];
  const conc = P.concentration;

  // Citadel: concentration and the swing, with nothing contractual on file
  const cit = conc.find(c => c.level1 === CITADEL);
  const citNow = P.downTwoMonths.find(d => d.level1 === CITADEL);
  if (cit) rows.push({
    tag: 'Critical', cls: 'is-bad', stake: cit.ltm,
    say: `Citadel is ${(cit.share * 100).toFixed(0)}% of revenue, all of it service, with no contract date on file.`,
    money: money0(cit.ltm), unit: 'last 12 months',
    why: citNow ? `${monShort(citNow.month)} billed ${money0(citNow.revenue)} against its own six-month run of ${money0(citNow.trailing6_mean)}. Settlements and credits land in lumps; nothing holds the volume in place.` : 'Settlements and credits land in lumps; nothing holds the volume in place.',
    href: `#margin/${CITADEL}`,
  });

  // 2FM storage rate against the rest of the book, per box
  const fm = PR.storage.find(r => r.level1 === CITY_2FM);
  const rest = PR.storage.filter(r => r.level1 !== CITY_2FM);
  if (fm) {
    const restRate = rest.reduce((t, r) => t + r.storage_billed, 0) / rest.reduce((t, r) => t + r.boxes, 0);
    const perCent = fm.boxes * 0.01;
    rows.push({
      tag: 'Below the book', cls: 'is-warn', stake: (restRate - fm.rate_per_box) * fm.boxes * 12,
      say: `City of Chicago 2FM stores ${fm.boxes.toLocaleString('en-US')} boxes at $${fm.rate_per_box.toFixed(3)} a box. The rest of the book averages $${restRate.toFixed(3)}.`,
      money: '$' + fm.rate_per_box.toFixed(3), unit: 'a box a month',
      why: `Every cent a box is ${money0(perCent)} a month. The rate stepped down in July 2025; the cost to house a box is $${R.RATES.facilities.v.toFixed(4)} ◇.`,
      href: `#margin/${CITY_2FM}`,
    });
  }

  // Accounts below their own six-month run two months running, Citadel apart
  const down = P.downTwoMonths.filter(d => d.level1 !== CITADEL && d.trailing6_mean > d.revenue);
  if (down.length) {
    const short = down.reduce((t, d) => t + (d.trailing6_mean - d.revenue), 0);
    const top = down.slice().sort((a, b) => (b.trailing6_mean - b.revenue) - (a.trailing6_mean - a.revenue)).slice(0, 3);
    rows.push({
      tag: 'Down', cls: 'is-bad', stake: short * 12,
      say: `${down.length} accounts are below their own six-month run for a second month.`,
      money: money0(short), unit: 'a month short',
      why: top.map(d => `${title(d.customer)} ${money0(d.revenue)} against ${money0(d.trailing6_mean)}`).join(' · ') + '.',
      href: '#calls',
    });
  }

  // Below cost: the account whose bin work loses most, costed with the model
  const binLb = new Map();
  for (const l of M.lines) if (l.servcode === 'S5B') binLb.set(l.level1, (binLb.get(l.level1) || 0) + l.units);
  let worst = null;
  for (const a of M.accounts) {
    if (!a.bins || a.level1 === CITADEL) continue;
    const lb = binLb.get(a.level1) || 0;
    const binRev = M.lines.filter(l => l.level1 === a.level1 && l.family === 'bin').reduce((t, l) => t + l.revenue, 0);
    if (binRev <= 0) continue;   // work billed some other way: Margin sorts those out
    const c = R.costToServe('bin', a.bins, Object.assign({ visits: a.visits || null }, lb > 0 ? { pounds: lb } : { binCode: a.main_bin }));
    const gap = binRev - c.total;
    if (!worst || gap < worst.gap) worst = { a, gap, c, binRev };
  }
  if (worst) rows.push({
    tag: 'Below cost', cls: 'is-bad', stake: -worst.gap,
    say: `${title(worst.a.customer)} pays $${(worst.binRev / worst.a.bins).toFixed(2)} a bin service against $${worst.c.perUnit.toFixed(2)} to serve it.`,
    money: money0(worst.gap), unit: 'a year ◇',
    why: `${worst.a.bins.toLocaleString('en-US')} bin services on ${worst.a.visits} visits in the last twelve months. Cost to serve uses a ${R.SETTINGS.split * 100}% travel share of a route day.`,
    href: `#margin/${worst.a.level1}`,
  });

  return rows.sort((a, b) => b.stake - a.stake).slice(0, 4);
}

export async function render(main, P) {
  const el = main; if (!el) return;
  injectCss();
  const [R, M, PR] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing')]);

  const months = P.monthly;
  const avg = (from, to) => { const w = months.filter(m => m.month >= from && m.month <= to); return w.reduce((t, m) => t + m.core, 0) / w.length; };
  // the six-month average to the month before the latest, as the headline basis in DECISIONS.md
  const last = months[months.length - 1];
  const six = months.slice(-7, -1), core = six.reduce((t, m) => t + m.core, 0) / six.length;
  const early = avg('2025-01-01', '2025-06-01');
  const fall = 1 - core / early;
  const run = P.currentRun.find(r => r.part === 'run');
  const svc6 = months.slice(-6).map(m => m.core_service);
  const range = run ? [run.storage + Math.min(...svc6), run.storage + Math.max(...svc6)] : null;
  const rows = decisions(P, M, PR, R);
  const words = ['', 'One thing needs', 'Two things need', 'Three things need', 'Four things need'][rows.length];

  // storage gross margin, modelled: revenue less the facilities pool's share for the boxes held
  const stoMargin = last.storage_boxes ? 1 - (last.storage_boxes * R.RATES.facilities.v) / last.storage : null;
  const prevYear = months.find(m => m.month === last.month.replace(/^(\d{4})/, y => String(+y - 1)));
  const prevMonth = months[months.length - 2];
  const C = P.customers;

  el.innerHTML = `
  <div class="pulse register-briefing">
    <p class="date">${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · posted through ${mon(last.month)}</p>
    <div class="top">
      <h1>Core revenue is ${money0(TARGET - core)} a month short of $1.0m and down ${pct0(fall * 100)} since early 2025.${words ? ` ${words} a decision.` : ''}</h1>
      <div id="p-meter"></div>
    </div>

    <section class="decisions p-decide">
      <div class="sec"><h2>Needs a decision</h2><small>ranked by money at stake · open any row for its evidence</small></div>
      ${rows.map(r => `
        <div class="row">
          <span class="tag ${r.cls}">${esc(r.tag)}</span>
          <span class="say">${esc(r.say)}</span>
          <span class="money ${r.money.startsWith('−') ? 'is-bad' : ''}">${esc(r.money)}<small>${esc(r.unit)}</small></span>
          <span class="why">${esc(r.why)}</span>
          <a class="open" href="${r.href}">Open ↓</a>
        </div>`).join('')}
    </section>

    <section class="p-halves">
      <div class="sec"><h2>Two businesses. Storage carries the margin; service is winning customers and losing revenue.</h2><small>${mon(last.month)} · beside ${IRON_MOUNTAIN.label}</small></div>
      <div class="halves">
        <div class="half">
          <div><h3>Storage</h3><div class="big">${money0(last.storage)}</div><div class="note">${C.storage_ltm} accounts in the last 12 months · ${(last.storage_boxes / 1e6).toFixed(2)}m boxes · billed on the 1st</div></div>
          <div><div class="lab">Growth</div><div class="k ${last.storage_growth_yoy_pct < 0 ? 'is-bad' : ''}">${last.storage_growth_yoy_pct < 0 ? '▼' : '▲'} ${Math.abs(last.storage_growth_yoy_pct).toFixed(1)}%</div><div class="note">on ${prevYear ? monShort(prevYear.month) : 'a year ago'}</div><div class="im">IM +${IRON_MOUNTAIN.storageGrowth}%</div></div>
          <div><div class="lab">Gross margin</div><div class="k modelled">${stoMargin != null ? pct0(stoMargin * 100) : '—'}</div><div class="note">revenue less the facilities pool</div><div class="im">IM ${IRON_MOUNTAIN.storageMargin}%</div></div>
          <div><div class="lab">Retention rate</div><div class="pending">Not yet measured. Needs box in/out history from VCK.</div><div class="im">IM ${IRON_MOUNTAIN.retention}%</div></div>
        </div>
        <div class="half">
          <div><h3>Service</h3><div class="big">${money0(last.core_service)}</div><div class="note">Citadel apart · ${C.service_ltm} accounts in the last 12 months, ${C.service_prior} the year before</div></div>
          <div><div class="lab">Growth</div><div class="k ${last.core_service_growth_yoy_pct < 0 ? 'is-bad' : ''}">${last.core_service_growth_yoy_pct < 0 ? '▼' : '▲'} ${Math.abs(last.core_service_growth_yoy_pct).toFixed(0)}%</div><div class="note">on ${prevYear ? monShort(prevYear.month) : 'a year ago'}; accounts ▲ ${pct0((C.service_ltm / C.service_prior - 1) * 100)}</div><div class="im">IM +${IRON_MOUNTAIN.serviceGrowth}%</div></div>
          <div><div class="lab">Gross margin</div><div class="pending">Runs once line costs load in Margin.</div><div class="im">IM ${IRON_MOUNTAIN.serviceMargin}%</div></div>
          <div><div class="lab">Revenue per stop</div><div class="k">${money0(last.revenue_per_stop)}</div><div class="note">${monShort(prevMonth.month)} ${money0(prevMonth.revenue_per_stop)} · ${last.stops_per_route_day} stops a route day</div><div class="im">no published benchmark</div></div>
        </div>
      </div>
    </section>

    <section class="p-chart"><div id="p-chart"></div></section>

    <section class="finding" id="p-finding"></section>
  </div>`;

  meter(el.querySelector('#p-meter'), {
    label: 'Core, 6-month average', value: core, delta: { text: '▼ ' + pct0(fall * 100), cls: 'is-bad' }, target: TARGET,
    // the run in invoices_current bills the month after the last posted one
    range, rangeLabel: range ? `${new Date(Date.UTC(+last.month.slice(0, 4), +last.month.slice(5, 7), 1)).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })} run ${moneyK(range[0])}–${moneyK(range[1])}, narrowing` : null,
    tick: early, tickLabel: 'early-2025 average',
  });

  const lowS = months.reduce((a, m) => m.service < a.service ? m : a), highS = months.reduce((a, m) => m.service > a.service ? m : a);
  lineChart(el.querySelector('#p-chart'), {
    title: `Storage is the annuity with one step. Service swings ten times as wide, from ${moneyK(lowS.service)} to ${moneyK(highS.service)}.`,
    sub: `${monShort(months[0].month)} – ${monShort(last.month)} · invoice month · one axis`,
    series: [{ name: 'Storage', points: months.map(m => ({ x: m.month, y: m.storage })) }, { name: 'Service, all', cls: 's-2', points: months.map(m => ({ x: m.month, y: m.service })) }],
    band: { name: 'of which Citadel', points: months.map(m => ({ x: m.month, lo: m.service - m.citadel, hi: m.service })) },
    marks: [{ x: '2025-07-01', text: 'Jul 2025 · storage steps down, 2FM rate cut' }],
    notes: [{ x: lowS.month, y: lowS.service, text: `${monShort(lowS.month)} credit run ${money0(lowS.service)}`, cls: 'is-bad' },
            { x: highS.month, y: highS.service, text: `${monShort(highS.month)} ${money0(highS.service)}` }],
    source: 'VCK invoices, posted runs, COALESCE(invdate, billdate) · storage ret_tot, service ser_tot · Citadel = ser_tot for custno 00870, negative months carried',
  });

  // Finding of the week: the business winning customers and losing revenue
  const f = el.querySelector('#p-finding');
  f.innerHTML = `<div class="lab">Finding of the week</div>
    <p>Service accounts rose from ${C.service_prior} to ${C.service_ltm} in a year, while core service revenue in ${mon(last.month)} was ${Math.abs(last.core_service_growth_yoy_pct).toFixed(0)}% below the same month last year.</p>
    <div class="src">kpi.customer_monthly, accounts billing any service in the twelve months to ${mon(C.ltm_to)} against the twelve before · kpi.monthly core service</div>`;
}
