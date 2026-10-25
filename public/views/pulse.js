// Home — Trisha, phone first. Three things above the fold: this month, the main customers who are
// moving, and the levers to grow EBITDA. Below: margin by line of business, the team, the trend.
// Every row opens a customer list or a customer page; nothing is a dead end. Citadel is lumpy:
// shown on its own line, never inside a total, a mover list or a lever.
import { barChart, sparkline, money0, moneyK } from '/components/chart.js';
import { buildMargins, FAMILY_NAMES } from '/components/margin.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { seriesOf, deltaText } from '/views/customers.js';

const TARGET = 1e6;
const CITADEL = 6714, CITY_2FM = 8153;
const TYPICAL_RISE = 0.08;   // the median rise when a rate moves (24 months of rate rounds; scripts/levers.js §2)
const UNDER_REVIEW = new Set(['bin', 'handling', 'movement']);   // route costs: delivery days not yet in the volumes
const PRICED = ['B2', 'B3', 'B6', '01', '20', '25', '30', 'S3', 'S4', 'S6'];

const CSS = `
.home { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.home .wide { grid-column: 1 / -1; }
.home .greet { grid-column: 1 / -1; margin: 0 0 2px; }
.home .greet h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0; }
.home .greet p { color: var(--ink-3); margin: 2px 0 0; }
.home .now { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 28px; align-items: end; }
.home .now .lede { font-size: 17px; color: var(--ink-2); margin: 10px 0 0; line-height: 1.4; }
.home .track { height: 10px; background: var(--well-2); border-radius: 5px; position: relative; margin: 18px 0 6px; overflow: hidden; }
.home .track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; background: var(--ink); }
.home .track i.st { background: var(--s-storage); }
.home .track i.sv { background: var(--s-service); }
.home .track b { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--ink); opacity: .5; }
.home .trackfoot { display: flex; justify-content: space-between; gap: 10px; font-size: var(--fs-source); color: var(--ink-3); }
.home .trackfoot i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
.home .work { border-left: 1px solid var(--rule); padding-left: 24px; }
.home .aside { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--rule); font-size: var(--fs-label); color: var(--ink-3); }
.home .mover a { grid-template-columns: minmax(0, 1fr) 96px 64px 12px; }
.home .total { font-size: var(--fs-num-lg); font-weight: 700; letter-spacing: -.02em; }
.home .fam { display: grid; grid-template-columns: minmax(0, 1fr) 46px minmax(60px, .8fr) 12px; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.home .fam:first-child { border-top: 0; }
.home .fam .pc { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.home .fam .bar { height: 8px; background: var(--well-2); border-radius: 4px; position: relative; }
.home .fam .bar i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: var(--s-storage); }
.home .fam.review { color: var(--ink-3); }
.home .fam.review .bar i { background: repeating-linear-gradient(135deg, var(--ink-5) 0 2px, transparent 2px 5px); }
.home .fam .go { color: var(--ink-5); }
.home .team { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.home .chart { padding: 0; }
.home .foot { grid-column: 1 / -1; font-size: var(--fs-source); color: var(--ink-4); text-align: center; padding: 6px 0 10px; }
@media (max-width: 760px) {
  .home { grid-template-columns: 1fr; gap: 12px; }
  .home .greet h1 { font-size: 28px; }
  .home .now { grid-template-columns: 1fr; gap: 16px; }
  .home .work { border-left: 0; padding-left: 0; border-top: 1px solid var(--rule); padding-top: 14px; }
  .home .team { grid-template-columns: 1fr; gap: 14px; }
  .home .mover a { grid-template-columns: minmax(0, 1fr) 76px 56px 12px; }
  .home .trackfoot span:last-child { display: none; }
}`;

function injectCss() {
  if (document.getElementById('home-css')) return;
  const s = document.createElement('style'); s.id = 'home-css'; s.textContent = CSS; document.head.appendChild(s);
}
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const nextMonth = d => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 1)).toISOString().slice(0, 10);
const dayMonth = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pct = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(Math.round(v * 100)) + '%';
const dcls = v => v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat';

// Work done this month: services completed so far, and the pace per working day against last
// month's, from Veri-Shred done orders. Per working day, because the first days of two months
// rarely hold the same weekdays.
function workPace(A) {
  const d = A.latestDone, mStart = d.slice(0, 8) + '01';
  const prev = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  const pace = (from, to) => {
    const rows = A.routeDays.filter(r => r.date >= from && r.date <= to && r.services_done > 0);
    const days = new Set(rows.map(r => r.date)).size, done = rows.reduce((t, r) => t + r.services_done, 0);
    return { done, days, perDay: days ? done / days : null };
  };
  const now = pace(mStart, d), before = pace(prev, prev.slice(0, 8) + '31');
  return { now, before: before.days >= 15 ? before : null, month: mStart, prevMonth: prev, through: d };
}

function levers(P, PR, CA, A, R) {
  const out = [];
  const down = P.downTwoMonths.filter(d => d.level1 !== CITADEL && d.trailing6_mean > d.revenue);
  if (down.length) out.push({ t: `Win back ${down.length} accounts running below their own level`, s: down.slice(0, 2).map(d => titleCase(d.customer)).join(', ') + ' and others', v: down.reduce((t, d) => t + d.trailing6_mean - d.revenue, 0), href: '#customers?view=slipping', who: 'Anne' });
  const meds = {};
  for (const code of PRICED) {
    const v = PR.rates.filter(r => r.servcode === code && r.modal_rate > 0 && r.units > 0).map(r => r.modal_rate).sort((a, b) => a - b);
    if (v.length >= 20) meds[code] = v[Math.floor(v.length / 2)];
  }
  const gaps = PR.rates.filter(r => meds[r.servcode] && r.level1 !== CITADEL && r.modal_rate > 0 && r.modal_rate < meds[r.servcode] && r.units > 0);
  if (gaps.length) {
    const v = gaps.reduce((t, r) => t + (meds[r.servcode] - r.modal_rate) * r.units, 0) / 12;
    out.push({ t: 'Close the price gaps to the median', s: `${new Set(gaps.map(g => g.level1)).size} accounts pay under the median for a service`, v: v / 2, note: 'halfway', href: '#customers?view=gaps', who: 'Anne' });
  }
  const fm = PR.storage.find(r => r.level1 === CITY_2FM), rest = PR.storage.filter(r => r.level1 !== CITY_2FM);
  if (fm) {
    const restRate = rest.reduce((t, r) => t + r.storage_billed, 0) / rest.reduce((t, r) => t + r.boxes, 0);
    out.push({ t: 'Move City of Chicago storage towards the book', s: `$${fm.rate_per_box.toFixed(3)} a box on ${fm.boxes.toLocaleString('en-US')} boxes; the rest pay $${restRate.toFixed(3)}`, v: (restRate - fm.rate_per_box) / 2 * fm.boxes, note: 'halfway', href: `#customer/${CITY_2FM}`, who: 'Trisha' });
  }
  const missed = CA.filter(c => c.not_raised_2y && c.level1 !== CITADEL);
  if (missed.length) {
    const rev = missed.reduce((t, c) => t + c.service, 0);
    out.push({ t: `Raise the ${missed.length} accounts that missed every rate round`, s: `${moneyK(rev)} of service a year at rates two years old`, v: rev * TYPICAL_RISE / 12, href: '#customers?view=rounds', who: 'Anne' });
  }
  const days = A.routeDays.filter(d => d.services_done > 0 && d.date <= A.latestDone);
  if (days.length > 10) {
    const s = days.map(d => d.services_done).sort((a, b) => a - b), p75 = s[Math.floor(s.length * .75)];
    const fewer = days.length - Math.ceil(s.reduce((t, v) => t + v, 0) / p75);
    out.push({ t: 'Fill the lighter route days', s: `${fewer} fewer route days in five weeks at a fuller-day load`, v: fewer * R.RATES.routeDay.v / 5 * 52 / 12, note: 'ceiling ◇', href: '#activity', who: 'Mike' });
  }
  return out.sort((a, b) => b.v - a.v);
}

export async function render(main, P) {
  if (!main) return;
  injectCss();
  const [R, M, PR, A, CA, C] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing'), getJson('activity'), getJson('calls'), getJson('customers')]);

  const months = P.monthly, last = months[months.length - 1];
  const run = P.currentRun.find(r => r.part === 'run');
  const runCore = run ? run.storage + run.service - run.citadel : null;
  const runMonth = nextMonth(last.month);
  const wp = workPace(A);
  const ser = seriesOf(C);
  const movers = [...ser.values()].filter(s => s.level1 !== CITADEL && s.ltm > 0).sort((a, b) => b.ltm - a.ltm).slice(0, 20)
    .filter(s => s.change != null).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 5);
  const lv = levers(P, PR, CA, A, R), lvTotal = lv.reduce((t, l) => t + l.v, 0);
  const book = buildMargins(R, M, { exclude: [CITADEL] });
  const fams = Object.entries(book.families).filter(([f, v]) => f !== 'other' && v.revenue > 0)
    .map(([f, v]) => ({ f, ...v, pc: 1 - v.cost / v.revenue })).sort((a, b) => b.revenue - a.revenue);
  const solid = fams.filter(x => !UNDER_REVIEW.has(x.f));
  const solidPc = 1 - solid.reduce((t, x) => t + x.cost, 0) / solid.reduce((t, x) => t + x.revenue, 0);

  const wkFrom = new Date(new Date(A.latestDone + 'T00:00:00Z') - 6 * 864e5).toISOString().slice(0, 10);
  const wk = A.routeDays.filter(d => d.services_done > 0 && d.date >= wkFrom && d.date <= A.latestDone);
  const wkRate = wk.reduce((t, d) => t + d.services_done, 0) / (wk.length || 1);
  const wd = A.weekdays.filter(d => d.dow <= 5);
  const norm = wd.reduce((t, d) => t + d.done_per_day * d.route_days, 0) / wd.reduce((t, d) => t + d.route_days, 0);
  const six = months.slice(-6), core6 = six.reduce((t, m) => t + m.core, 0) / six.length;

  const ahead = runCore != null ? runCore - last.core : null;
  const stW = run ? run.storage / TARGET * 100 : 0, svW = run ? (run.service - run.citadel) / TARGET * 100 : 0;
  main.innerHTML = `
  <div class="home">
    <div class="greet"><h1>${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}</h1><p>${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>

    <section class="card wide">
      <div class="now">
        <div>
          <div class="lab">${mon(runMonth)} bill so far · core</div>
          <div class="hero">${runCore != null ? money0(runCore) : '—'}</div>
          <p class="lede">${runCore != null ? `<span class="delta ${dcls(ahead / last.core)}">${pct(ahead / last.core)}</span> on ${mon(last.month)}, and ${moneyK(TARGET - runCore)} short of $1.0M.` : 'This month\'s run has not started.'}</p>
          <div class="track"><i class="st" style="width:${stW}%"></i><i class="sv" style="left:${stW}%;width:${svW}%"></i><b style="left:${last.core / TARGET * 100}%"></b></div>
          <div class="trackfoot"><span><i style="background:var(--s-storage)"></i>storage ${moneyK(run ? run.storage : 0)} <i style="background:var(--s-service);margin-left:8px"></i>service ${moneyK(run ? run.service - run.citadel : 0)}</span><span>line: ${monShort(last.month)} · end: $1.0M</span></div>
        </div>
        <div class="work">
          <div class="lab">Work done in ${mon(wp.month)}</div>
          <div class="big">${wp.now.done.toLocaleString('en-US')}</div>
          <div class="sub">services done in ${wp.now.days} working days to ${dayMonth(wp.through)}${wp.before && wp.now.perDay ? ` · ${Math.round(wp.now.perDay)} a day, <span class="delta ${dcls(wp.now.perDay / wp.before.perDay - 1)}">${pct(wp.now.perDay / wp.before.perDay - 1)}</span> on ${mon(wp.prevMonth)}'s ${Math.round(wp.before.perDay)}` : ''}</div>
          <div class="aside" style="margin-top:12px">Citadel, held apart: ${run ? money0(run.citadel) : '—'} in this bill. Settlements land in lumps, so they are never counted here.</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h3>Main customers on the move</h3><a href="#customers">All main customers ›</a></div>
      <ul class="rows mover">${movers.map(s => `<li><a href="#customer/${s.level1}">
        <span class="t">${esc(titleCase(s.customer))}<span class="s">${moneyK(s.ltm)} in the last 12 months</span></span>
        <span>${sparkline(s.total, { w: 96, h: 28, cls: s.change > .02 ? 'up' : s.change < -.1 ? 'down' : '' })}</span>
        <span class="v"><span class="delta ${dcls(s.change)}">${deltaText(s.change)}</span></span><span class="go">›</span></a></li>`).join('')}</ul>
    </section>

    <section class="card">
      <div class="card-head"><h3>Levers to grow EBITDA</h3><small>a month · Citadel apart</small></div>
      <div class="total">up to ${moneyK(lvTotal)}<span style="font-size:15px;font-weight:500;color:var(--ink-3)"> a month</span></div>
      <ul class="rows" style="margin-top:6px">${lv.map(l => `<li><a href="${l.href}">
        <span class="t">${esc(l.t)}<span class="s">${esc(l.s)} · ${esc(l.who)}</span></span>
        <span class="v">${moneyK(l.v)}${l.note ? `<small>${esc(l.note)}</small>` : ''}</span><span class="go">›</span></a></li>`).join('')}</ul>
    </section>

    <section class="card">
      <div class="card-head"><h3>Gross margin</h3><a href="#customers?view=margin">Lowest-margin accounts ›</a></div>
      <div class="big">${Math.round(solidPc * 100)}%<span style="font-size:15px;color:var(--ink-5)"> ◇</span></div>
      <div class="sub" style="margin-bottom:8px">storage, shredding, labour and ITAD over the last 12 months, Citadel apart</div>
      <div>${fams.map(x => `<a class="fam ${UNDER_REVIEW.has(x.f) ? 'review' : ''}" href="#customers?view=margin">
        <span>${esc(FAMILY_NAMES[x.f] || x.f)}${UNDER_REVIEW.has(x.f) ? ' <span class="chip review">under review</span>' : ''}<span class="sub" style="display:block">${moneyK(x.revenue)} revenue</span></span>
        <span class="pc">${UNDER_REVIEW.has(x.f) ? '—' : Math.round(x.pc * 100) + '%'}</span>
        <span class="bar"><i style="width:${UNDER_REVIEW.has(x.f) ? 100 : Math.max(0, x.pc) * 100}%"></i></span><span class="go">›</span></a>`).join('')}</div>
      <div class="aside">Bins, handling and delivery are under review: delivery routes are not yet in the route volumes, so their visit costs run high.</div>
    </section>

    <section class="card">
      <div class="card-head"><h3>The team this week</h3><small>against their own norm</small></div>
      <div class="team">
        <a href="#activity" style="color:inherit;text-decoration:none"><div class="lab">Mike · routes</div><div class="big">${wkRate.toFixed(1)}</div><div class="sub">done services a route day in the week to ${dayMonth(A.latestDone)} · <span class="delta ${dcls(wkRate / norm - 1)}">${pct(wkRate / norm - 1)}</span> on his 12-month ${norm.toFixed(1)}</div></a>
        <div><div class="lab">Anne · pricing and calls</div><div class="pending" style="margin-top:6px">Starts with the conversations log: accounts repriced and calls logged each week.</div></div>
      </div>
      <div class="card-head" style="margin-top:22px"><h3>Core by month</h3><small>six-month average ${moneyK(core6)} · Citadel apart</small></div>
      <div id="home-trend"></div>
    </section>

    <div class="foot">Posted through ${mon(last.month)} ${last.month.slice(0, 4)} · ◇ modelled from the cost model · tap any row to open it</div>
  </div>`;

  const span = innerWidth < 760 ? 7 : 13;
  barChart(main.querySelector('#home-trend'), {
    // the first, last and January bars carry their year, so a repeated month name is never ambiguous
    bars: months.slice(-span).map((m, i, a) => ({ label: monShort(m.month) + (i === 0 || i === a.length - 1 || m.month.slice(5, 7) === '01' ? " '" + m.month.slice(2, 4) : ''), value: m.core, cls: i === a.length - 1 ? 'storage' : '' })),
    yFormat: v => moneyK(v), height: 170,
  });
}
