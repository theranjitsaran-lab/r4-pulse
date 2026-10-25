// Customers — one list, several views. Every number on Home opens one of these; every row opens
// the customer page. Each row: name and why it is listed, a 24-month sparkline, twelve-month
// revenue, change on the twelve months before, and gross margin (◇ modelled).
import { sparkline, money0, moneyK } from '/components/chart.js';
import { buildMargins } from '/components/margin.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';

const CITADEL = 6714;
const ROUTE_FAMILIES = ['bin', 'handling', 'movement'];   // route costs under review: delivery days not yet in the volumes

export const VIEWS = {
  main:          { label: 'Main customers', blurb: 'The 20 largest accounts over the last twelve months.' },
  slipping:      { label: 'Slipping', blurb: 'Below their own six-month level for a second month running.' },
  gaps:          { label: 'Price gaps', blurb: 'Paying under the median for a service, sized by their volume.' },
  rounds:        { label: 'Missed rate rounds', blurb: 'No rate has moved in two years.' },
  margin:        { label: 'Lowest margin', blurb: 'Revenue less modelled cost to serve, worst first. Route costs are under review.' },
  all:           { label: 'All', blurb: 'Every account with revenue in the last twelve months.' },
};

const CSS = `
.cust h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0 0 4px; }
.cust .blurb { color: var(--ink-3); margin: 0 0 16px; }
.cust .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.cust .views { overflow-x: auto; max-width: 100%; }
.cust .views .seg { flex-wrap: nowrap; }
.cust .views .seg a { white-space: nowrap; }
.cust .list { list-style: none; margin: 0; padding: 0; }
.cust .list a { display: grid; grid-template-columns: minmax(0, 1fr) 130px 110px 84px 70px 14px; gap: 16px; align-items: center; padding: 12px 4px;
  border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.cust .list li:first-child a { border-top: 0; }
.cust .list a:hover { background: var(--well); }
.cust .head { display: grid; grid-template-columns: minmax(0, 1fr) 130px 110px 84px 70px 14px; gap: 16px; padding: 0 4px 8px; font-size: 12px; color: var(--ink-3); }
.cust .head span:nth-child(n+3) { text-align: right; }
.cust .nm { font-weight: 600; line-height: 1.3; }
.cust .why { display: block; font-weight: 400; font-size: var(--fs-label); color: var(--ink-3); margin-top: 2px; }
.cust .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cust .rev { font-weight: 600; }
.cust .go { color: var(--ink-5); font-size: 20px; }
.cust .foot { font-size: var(--fs-source); color: var(--ink-4); margin-top: 12px; }
.cust .list .rv small { display: none; }
.cust .rvm { color: var(--ink-5); font-size: 11px; margin-left: 3px; vertical-align: 1px; }
@media (max-width: 760px) {
  .cust h1 { font-size: 28px; }
  .cust .head { display: none; }
  .cust .list a { grid-template-columns: minmax(0, 1fr) 76px 14px; grid-template-areas: "nm rev go" "why spark go"; gap: 2px 12px; }
  .cust .list .nmw { grid-area: nm; } .cust .list .rv { grid-area: rev; } .cust .list .sp { grid-area: spark; justify-self: end; }
  .cust .list .ch, .cust .list .mg { display: none; }
  .cust .list .go { grid-area: go; }
  .cust .list .rv small { display: block; font-size: 12px; font-weight: 600; }
}`;

function injectCss() {
  if (document.getElementById('cust-css')) return;
  const s = document.createElement('style'); s.id = 'cust-css'; s.textContent = CSS; document.head.appendChild(s);
}

const sum = a => a.reduce((t, v) => t + v, 0);
// Each account's series and twelve-month figures, from the customers fixture. Leading months that
// are empty for every account fall before the data begins (the series start November 2024), so
// they are dropped rather than drawn as a climb from zero. Change is the last twelve months against
// the months before, scaled to twelve when fewer than twelve exist.
export function seriesOf(C) {
  let start = 0;
  while (start < C.months.length - 1 && C.accounts.every(a => !a.storage[start] && !a.service[start])) start++;
  const months = C.months.slice(start);
  const map = new Map();
  for (const a of C.accounts) {
    const storage = a.storage.slice(start), service = a.service.slice(start);
    const total = storage.map((v, i) => v + service[i]);
    const ltm = sum(total.slice(-12)), before = total.slice(0, -12);
    const prior = before.length ? sum(before) * 12 / before.length : 0;
    map.set(a.level1, { ...a, months, storage, service, total, ltm, prior, change: prior > 0 ? ltm / prior - 1 : null });
  }
  return map;
}

function deltaCls(c) { return c == null ? 'flat' : c > 0.02 ? 'up' : c < -0.02 ? 'down' : 'flat'; }
export function deltaText(c) { return c == null ? 'new' : (c > 0 ? '▲ ' : c < 0 ? '▼ ' : '') + Math.abs(Math.round(c * 100)) + '%'; }

// Build the rows for a view: [{ level1, customer, why, sortValue }]
async function rowsFor(view, ser, book) {
  const marg = new Map(book.accounts.map(a => [a.level1, a]));
  const base = (id, why, extra = {}) => {
    const s = ser.get(id), m = marg.get(id);
    return { level1: id, customer: (s && s.customer) || (m && m.customer) || `Account ${id}`, why, s, m, ...extra };
  };
  if (view === 'main' || view === 'all') {
    const all = [...ser.values()].filter(s => s.ltm > 0).sort((a, b) => b.ltm - a.ltm);
    return (view === 'main' ? all.slice(0, 20) : all).map(s => base(s.level1, s.level1 === CITADEL ? 'Settlements land in lumps; held apart from core' : null));
  }
  if (view === 'slipping') {
    const P = await getJson('pulse');
    return P.downTwoMonths.filter(d => d.level1 !== CITADEL && d.trailing6_mean > d.revenue)
      .map(d => base(d.level1, `${money0(d.revenue)} last month against its own ${money0(d.trailing6_mean)}`, { worth: d.trailing6_mean - d.revenue }));
  }
  if (view === 'gaps') {
    const PR = await getJson('pricing');
    const meds = {};
    for (const code of ['B2', 'B3', 'B6', '01', '20', '25', '30', 'S3', 'S4', 'S6']) {
      const v = PR.rates.filter(r => r.servcode === code && r.modal_rate > 0 && r.units > 0).map(r => r.modal_rate).sort((a, b) => a - b);
      if (v.length >= 20) meds[code] = v[Math.floor(v.length / 2)];
    }
    const best = new Map();
    for (const r of PR.rates) {
      if (!meds[r.servcode] || r.level1 === CITADEL || !(r.modal_rate > 0) || r.modal_rate >= meds[r.servcode] || !(r.units > 0)) continue;
      const worth = (meds[r.servcode] - r.modal_rate) * r.units / 12;
      const cur = best.get(r.level1);
      if (!cur || worth > cur.worth) best.set(r.level1, { worth, r, med: meds[r.servcode] });
    }
    return [...best.values()].sort((a, b) => b.worth - a.worth).slice(0, 50)
      .map(g => base(g.r.level1, `${titleCase(g.r.service)}: $${g.r.modal_rate.toFixed(2)} against a $${g.med.toFixed(2)} median · ${moneyK(g.worth)}/mo`, { worth: g.worth, customer: g.r.customer }));
  }
  if (view === 'rounds') {
    const CA = await getJson('calls');
    return CA.filter(c => c.not_raised_2y && c.level1 !== CITADEL).sort((a, b) => b.service - a.service)
      .map(c => base(c.level1, `No rate moved since ${c.last_changed ? c.last_changed.slice(0, 7) : 'before the window'} · ${moneyK(c.service)} of service a year`));
  }
  if (view === 'margin') {
    return book.accounts.filter(a => a.revenue > 1000).sort((a, b) => a.margin - b.margin).slice(0, 50)
      .map(a => base(a.level1, `${money0(a.margin)} a year after ${money0(a.cost)} to serve ◇`));
  }
  return [];
}

export async function render(main, C, params) {
  if (!main) return;
  injectCss();
  const view = VIEWS[params.view] ? params.view : 'main';
  const sort = ['size', 'change', 'margin'].includes(params.sort) ? params.sort : null;
  const [R, M] = await Promise.all([loadRates(), getJson('margin')]);
  const ser = seriesOf(C);
  const book = buildMargins(R, M, {});
  let rows = await rowsFor(view, ser, book);
  if (sort === 'size') rows.sort((a, b) => ((b.s && b.s.ltm) || 0) - ((a.s && a.s.ltm) || 0));
  if (sort === 'change') rows.sort((a, b) => ((a.s && a.s.change) ?? 9) - ((b.s && b.s.change) ?? 9));
  if (sort === 'margin') rows.sort((a, b) => marginPc(a) - marginPc(b));

  const link = (v, s) => `#customers?view=${v}${s ? '&sort=' + s : ''}`;
  main.innerHTML = `
  <div class="cust">
    <h1>Customers</h1>
    <p class="blurb">${esc(VIEWS[view].blurb)}</p>
    <div class="bar">
      <div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="${link(k)}" class="${k === view ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div>
      <div class="seg">${[['size', 'Size'], ['change', 'Change'], ['margin', 'Margin']].map(([k, l]) => `<a href="${link(view, k)}" class="${k === sort ? 'on' : ''}">${l}</a>`).join('')}</div>
    </div>
    <div class="card">
      <div class="head"><span>Customer</span><span>24 months</span><span>Last 12 months</span><span>Change</span><span>Margin</span><span></span></div>
      <ul class="list">${rows.map(row).join('') || '<li style="padding:16px;color:var(--ink-3)">No accounts in this view.</li>'}</ul>
    </div>
    <p class="foot">${rows.length} accounts · change is the last twelve months against the twelve before · margin ◇ is revenue less modelled cost to serve; route-based costs are under review.</p>
  </div>`;
}

function marginPc(r) { return r.m && r.m.revenue > 0 ? r.m.margin / r.m.revenue : 9; }

function row(r) {
  const s = r.s, m = r.m, pc = m && m.revenue > 0 ? m.margin / m.revenue : null;
  const routeHeavy = m && ROUTE_FAMILIES.some(f => m.fam[f] && m.fam[f].cost > 0.25 * m.cost);
  const cls = s ? (s.change > 0.02 ? 'up' : s.change < -0.1 ? 'down' : '') : '';
  return `<li><a href="#customer/${r.level1}">
    <span class="nmw"><span class="nm">${esc(titleCase(r.customer))}</span>${r.why ? `<span class="why">${esc(r.why)}</span>` : ''}</span>
    <span class="sp">${s ? sparkline(s.total, { w: 130, h: 30, cls }) : ''}</span>
    <span class="r rv"><span class="rev">${s ? moneyK(s.ltm) : '—'}</span>${s ? (r.level1 === CITADEL ? '<small class="delta flat">lumpy</small>' : `<small class="delta ${deltaCls(s.change)}">${deltaText(s.change)}</small>`) : ''}</span>
    <span class="r ch">${r.level1 === CITADEL ? '<span class="delta flat">lumpy</span>' : `<span class="delta ${s ? deltaCls(s.change) : 'flat'}">${s ? deltaText(s.change) : '—'}</span>`}</span>
    <span class="r mg">${pc == null ? '—' : `${Math.round(pc * 100)}%${routeHeavy ? '<span class="rvm" title="route costs under review">◇</span>' : ''}`}</span>
    <span class="go">›</span></a></li>`;
}
