// Customers — one list, several views. Every number on Home opens one of these; every row opens
// the customer page. Each row: name and why it is listed, a 24-month sparkline, twelve-month
// revenue, change on the twelve months before, and gross margin (est. means modelled).
import * as Fmt from '/components/format.js';
import { customerTable, falling, rising, tableHtml, sortRows, COLUMNS } from '/components/custtable.js';
import { dataTable, kOnly } from '/components/datatable.js';
import { accountFilters, carryHash } from '/components/acctfilters.js';
import { dailyFrom, addMonths } from '/components/projection.js';
import { sparkline, money0, moneyK } from '/components/chart.js';
import { buildMargins, marginBand, marginSummary, marginAction, accountLines, accountCosts, flatFeeYear, costParts, PARTS, FAMILY_NAMES } from '/components/margin.js';
import { costOrders, jobHtml, drawRouteBlock, jobPlace, densityByPostcode } from '/components/jobview.js';
import { loadRoadnet } from '/components/routemap.js';
import { getJson, loadRates, titleCase, esc, getLog, postLog } from '/components/data.js';
import { billNow, serviceGaps, storageGaps, overdueBoxes, crossSellPace, slippingAccounts, stoppedAccounts, risingAccounts, CROSS_SELL_DEPTH, PRICED } from '/components/levers.js';
import { buildWhitespace, LINES, lineCodes } from '/components/whitespace.js';
import { drillData, drillHtml, wireDrill } from '/components/crossdrill.js';
import { openExplainer } from '/components/explain.js';
import { conversationCandidates } from '/components/lists.js';
import { LABELS } from '/components/metrics.js';
import { costsVisible, whoAmI } from '/components/access.js';
import { accountTable } from '/components/accttable.js';
import { litCard, drawPoints } from '/components/lit.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
const acPlay = main => { document.documentElement.classList.add('js'); const root = main.querySelector('.ac'); if (firstPlay('r4-accounts-' + location.hash.slice(0, 40))) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); } };

const CITADEL = 6714;
const ROUTE_FAMILIES = ['bin', 'handling', 'movement'];   // route costs under review: delivery days not yet in the volumes

export const VIEWS = {
  overview:      { label: 'All accounts', blurb: 'Last month, who moved, and every account: sort any column, filter to a line, tap a figure for why.' },
  conversations: { label: 'This week', hidden: true, blurb: 'Ten conversations worth having, ranked by what is at stake. Log what you did; the list learns.' },
  main:          { label: 'Up and down', hidden: true, blurb: 'Last month against the month before and a year ago, the year to date, and this month so far.' },
  grid:          { label: 'Month grid', blurb: 'The 30 largest accounts, month by month, each against its own run.' },
  whitespace:    { label: 'Cross-sell', blurb: 'What each large account buys, and what it doesn\'t buy yet, sized at what comparable accounts spend.' },
  slipping:      { hidden: true, label: 'Slipping', blurb: 'Down 10% or more on their own run over the last three months. Still-billing accounts first; then those that have stopped or nearly, often one-off projects, which Home leaves out of the win-back.' },
  gaps:          { hidden: true, label: 'Price gaps', blurb: 'Paying under the book\'s median for storage or a service, sized by their volume. Home counts half of each gap.' },
  rounds:        { hidden: true, label: 'Missed rate rounds', blurb: 'No rate has moved in two years.' },
  destruction:   { hidden: true, label: 'Overdue boxes', blurb: 'Boxes past their retention review, by account: what destruction bills once, and the storage it ends.' },
  margin:        { hidden: true, label: 'Margin', blurb: 'Every account: revenue less what it costs to serve, worst first.' },
  all:           { label: 'All', hidden: true, blurb: 'Every account with revenue in the last twelve months.' },
};


// the series and the one measure of movement live in components/series.js; re-exported for views
export { seriesOf, deltaText } from '/components/series.js';
import { seriesOf, deltaText, deltaCls, moveReason } from '/components/series.js';

// Build the rows for a view: [{ level1, customer, why, sortValue }]
async function rowsFor(view, ser, book, C) {
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
    const row = (d, tag) => base(d.level1, `${tag}${moneyK(d.move.last3)} a month over the last three months, against its own ${moneyK(d.move.run)} before: ${moveReason(d.move, moneyK)}`, { worth: -d.move.d });
    return slippingAccounts(C).map(d => row(d, '')).concat(stoppedAccounts(C).map(d => row(d, 'Stopped or nearly: ')));
  }
  if (view === 'gaps') {
    const PR = await getJson('pricing');
    const sg = serviceGaps(PR), st = storageGaps(PR), by = new Map();
    for (const a of sg.values()) by.set(a.level1, { level1: a.level1, customer: a.customer, worth: a.worth, why: `${titleCase(a.top.service)}: ${Fmt.money(a.top.rate, { dp: 2 })} against a ${Fmt.money(a.top.med, { dp: 2 })} median` });
    for (const r of st.rows) {
      const a = by.get(r.level1) || { level1: r.level1, customer: r.customer, worth: 0, why: null };
      a.worth += r.worth;
      const sw = `Storage ${Fmt.money(r.rate, { dp: 3 })} a box against ${Fmt.money(r.med, { dp: 3 })} on ${Fmt.num(r.boxes)} boxes`;
      a.why = a.why ? `${sw}; ${a.why}` : sw;
      by.set(r.level1, a);
    }
    return [...by.values()].sort((a, b) => b.worth - a.worth).slice(0, 60)
      .map(g => base(g.level1, `${g.why}, ${moneyK(g.worth * 12)} a year at the median`, { worth: g.worth, customer: g.customer }));
  }
  if (view === 'rounds') {
    const CA = await getJson('calls');
    return CA.filter(c => c.not_raised_2y && c.level1 !== CITADEL).sort((a, b) => b.service - a.service)
      .map(c => base(c.level1, `No rate moved since ${c.last_changed ? new Date(c.last_changed + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'at least two years ago'}, ${moneyK(c.service)} of service a year`));
  }
  if (view === 'margin') {
    return book.accounts.filter(a => a.revenue > 1000).sort((a, b) => a.margin - b.margin).slice(0, 50)
      .map(a => base(a.level1, `${money0(a.margin)} a year after ${money0(a.cost)} to serve est.`));
  }
  return [];
}

export async function render(main, C, params) {
  if (!main) return;
  const view = VIEWS[params.view] && (params.view !== 'margin' || costsVisible()) || params.view === 'opportunities' ? params.view : 'overview';
  if (view === 'overview') return (await import('/views/custoverview.js')).render(main, C, params, tabsHtml('overview'));
  if (view === 'opportunities') return (await import('/views/opps.js')).render(main, params, C);
  if (view === 'conversations') return conversations(main, C);
  if (view === 'whitespace') return whitespace(main, C, params);
  if (view === 'main') return upDown(main, C, params);
  if (view === 'grid') return monthGrid(main, C, params);
  if (view === 'margin') return marginView(main, C, params);
  if (view === 'destruction') return destructionView(main, C, params);
  const sort = ['size', 'change', 'margin'].includes(params.sort) ? params.sort : null;
  const [R, M] = await Promise.all([loadRates(), getJson('margin')]);
  const ser = seriesOf(C);
  const book = buildMargins(R, M, {});
  let rows = await rowsFor(view, ser, book, C);
  if (sort === 'size') rows.sort((a, b) => ((b.s && b.s.ltm) || 0) - ((a.s && a.s.ltm) || 0));
  if (sort === 'change') rows.sort((a, b) => (mvPc(a.s) ?? 9) - (mvPc(b.s) ?? 9));
  if (sort === 'margin') rows.sort((a, b) => marginPc(a) - marginPc(b));

  const link = (v, s) => `#customers?view=${v}${s ? '&sort=' + s : ''}`;
  main.innerHTML = `
  <div class="cust">
    <h1>Accounts</h1>
    <p class="blurb">${esc(VIEWS[view].blurb)}</p>
    <div class="bar">
      ${tabsHtml(view)}
      <div class="seg">${[['size', 'Size'], ['change', 'Change'], ...(costsVisible() ? [['margin', 'Margin']] : [])].map(([k, l]) => `<a href="${link(view, k)}" class="${k === sort ? 'on' : ''}">${l}</a>`).join('')}</div>
    </div>
    ${view === 'all' ? '<input class="find" id="c-find" type="search" placeholder="Find a customer by name" aria-label="Find a customer by name">' : ''}
    <div class="card">
      <div class="head"><span>Customer</span><span>24 months</span><span>Last 12 months</span><span>Last 3 months</span><span>${costsVisible() ? 'Margin' : ''}</span><span></span></div>
      <ul class="list">${rows.map(row).join('') || '<li style="padding:var(--sp-4);color:var(--ink-3)">No accounts in this view.</li>'}</ul>
    </div>
    <p class="foot"><span id="c-count">${rows.length}</span> accounts, last 3 months is each account against its own twelve months before them, the same measure as Home and Slipping ${costsVisible() ? '· margin est. is revenue less modelled cost to serve; route-based costs are under review.' : ''}</p>
  </div>`;
  wireFind(main);
}

// the view tabs, the same on every Customers view; Up and down and All are kept for old links only
// search, filters and the months switch carry across the tabs, as they stand when the tab is tapped
const goView = v => { location.hash = carryHash('#customers?view=' + v, location.hash); };
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => { const a = e.target.closest('.bar .views a[href^="#customers?view="]'); if (a) { e.preventDefault(); goView(new URLSearchParams(a.getAttribute('href').split('?')[1]).get('view')); } });
  document.addEventListener('change', e => { if (e.target.matches('.c2-viewpick')) goView(e.target.value); });
}

export function tabsHtml(on) {
  const views = Object.entries(VIEWS).filter(([k, v]) => (!v.hidden || (k === on && k !== 'margin')));
  // a dropdown on a phone, so no tab is ever scrolled off the screen
  return `<div class="bar"><div class="views on-desk"><div class="seg">${views.map(([k, v]) => `<a href="#customers?view=${k}" class="${k === on ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div>
    <select class="on-phone c2-viewpick" aria-label="View">${views.map(([k, v]) => `<option value="${k}" ${k === on ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>`;
}

const mvPc = s => s && s.move ? s.move.pct : null;
function wireFind(main) {
  const f = main.querySelector('#c-find'); if (!f) return;
  f.addEventListener('input', () => {
    const q = f.value.trim().toLowerCase(); let n = 0;
    main.querySelectorAll('.list > li').forEach(li => { const hit = !q || li.textContent.toLowerCase().includes(q); li.hidden = !hit; if (hit) n++; });
    const c = main.querySelector('#c-count'); if (c) c.textContent = n;
  });
}

function marginPc(r) { return r.m && r.m.revenue > 0 ? r.m.margin / r.m.revenue : 9; }

function row(r) {
  const s = r.s, m = r.m, pc = m && m.revenue > 0 ? m.margin / m.revenue : null;
  const routeHeavy = m && ROUTE_FAMILIES.some(f => m.fam[f] && m.fam[f].cost > 0.25 * m.cost);
  const c = mvPc(s), cls = c == null ? '' : c > 0.02 ? 'up' : c < -0.1 ? 'down' : '';
  return `<li><a href="#customer/${r.level1}">
    <span class="nmw"><span class="nm">${esc(titleCase(r.customer))}</span>${r.why ? `<span class="why">${esc(r.why)}</span>` : ''}</span>
    <span class="sp">${s ? sparkline(s.total, { w: 130, h: 30, cls }) : ''}</span>
    <span class="r rv"><span class="rev">${s ? moneyK(s.ltm) : '—'}</span>${s ? (r.level1 === CITADEL ? '<small class="delta flat">lumpy</small>' : `<small class="delta ${deltaCls(c)}">${deltaText(c)}</small>`) : ''}</span>
    <span class="r ch">${r.level1 === CITADEL ? '<span class="delta flat">lumpy</span>' : `<span class="delta ${deltaCls(c)}">${s && s.move ? deltaText(c) : '—'}</span>`}</span>
    <span class="r mg">${!costsVisible() ? '' : pc == null ? '—' : `${Fmt.pct(pc)}${routeHeavy ? '<span class="rvm" title="route costs under review">est.</span>' : ''}`}</span>
    <span class="go">›</span></a></li>`;
}

// ── This week: ten conversations, each from a signal, ranked by what is at stake a year ─────
// The ranking and the opening lines live in components/lists.js, shared with Anne's morning email.
async function conversations(main, C) {
  const [PR, CA, log] = await Promise.all([getJson('pricing'), getJson('calls'), getLog().catch(() => [])]);
  const list = conversationCandidates({ C, PR, CA, log }).slice(0, 10);

  main.innerHTML = `
  <div class="cust">
    <h1>Accounts</h1>
    <p class="blurb">${esc(VIEWS.conversations.blurb)}</p>
    ${tabsHtml('conversations')}
    <div class="convs">${list.map((c, i) => `
      <div class="card conv" data-id="${c.level1}" data-sig="${c.sigs[0].key}">
        <div class="card-head"><h3><a href="#customer/${c.level1}" style="color:inherit;text-decoration:none">${i + 1}. ${esc(c.name)} <span style="color:var(--ink-5)">›</span></a></h3><small>${c.stake ? moneyK(c.stake) + ' a year at stake' : ''}</small></div>
        <div class="sub">${c.sigs.slice(0, 2).map(s => esc(s.ev)).join(', ')}</div>
        <p class="open-line">“${esc(c.opener)}”</p>
        <div class="acts"><button data-v="called">Called</button><button data-v="emailed">Emailed</button><button data-v="not_this_week">Not this week</button><span class="done-note"></span></div>
      </div>`).join('') || '<div class="card">Nothing to call about this week.</div>'}</div>
    <p class="foot">At stake: a year of the slipping shortfall, the gap to the median, or the typical 8% rise. Logged accounts drop out for seven days.</p>
  </div>`;
  main.querySelector('.convs').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    const card = b.closest('.conv');
    card.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      await postLog({ level1: Number(card.dataset.id), kind: 'call', signal: card.dataset.sig, verdict: b.dataset.v });
      card.classList.add('logged');
      card.querySelector('.done-note').textContent = `Logged: ${b.textContent.toLowerCase()}`;
    } catch (e) { card.querySelector('.done-note').textContent = e.message; card.querySelectorAll('button').forEach(x => x.disabled = false); }
  });
}

// ── Cross-sell: what each account buys, and what it doesn't buy yet ─────────────────────────

const lc = n => n === 'ITAD' ? n : n.toLowerCase();

async function whitespace(main, C, params) {
  const M = await getJson('margin');
  const W = buildWhitespace(M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
  const lows = r => LINES.filter(x => r.cells[x.key].low);
  const rows = W.rows.filter(r => r.opp > 0 || lows(r).length).sort((a, b) => b.opp - a.opp);
  const best = r => LINES.map(x => ({ x, c: r.cells[x.key] })).filter(o => !o.c.have && o.c.opp > 0).sort((a, b) => b.c.opp - a.c.opp)[0];
  const starts = rows.filter(r => r.opp > 0).slice(0, 3).map(r => { const b = best(r); return `${titleCase(r.customer)} (${b.x.name === 'ITAD' ? 'ITAD' : lc(b.x.name)}, about ${moneyK(b.c.opp / 12)} a month)`; });
  const byLine = LINES.map(x => ({ x, v: rows.reduce((t, r) => t + (r.cells[x.key].have ? 0 : r.cells[x.key].opp), 0) })).sort((a, b) => b.v - a.v);
  const pace = crossSellPace(M.history), names = new Map(M.accounts.map(a => [a.level1, a.customer]));
  const pts = [
    { key: 'worth', tone: 'g', lead: `${moneyK(W.total / 12)} a month more est.`, rest: `if the largest ${CROSS_SELL_DEPTH} accounts bought each line the way comparable accounts do. Most of it is ${byLine[0].x.name === 'ITAD' ? 'ITAD' : lc(byLine[0].x.name)} and ${byLine[1].x.name === 'ITAD' ? 'ITAD' : lc(byLine[1].x.name)}.` },
    { key: 'start', tone: 'a', lead: 'Start with:', rest: `${starts.join(', ')}.` },
  ];
  if (pace) { const b = pace.best[0]; pts.push({ key: 'done', tone: 'g', lead: 'It happens already:', rest: `in the last twelve months ${pace.count} accounts added a line, worth about ${moneyK(pace.value)} in their first year${b ? `. The biggest was ${titleCase(names.get(b.level1) || '')}, ${moneyK(b.first_year)}` : ''}.` }); }
  const tile1 = (r, x) => {
    const c = r.cells[x.key];
    if (c.have && c.low) return `<span class="lowc" title="${esc(c.note)}">${moneyK(c.spend)}</span>`;
    if (c.have) return `<span title="${esc(x.name)}: ${money0(c.spend)} in the last twelve months">${moneyK(c.spend)}</span>`;
    if (c.opp > 0) return `<span class="xs" title="${esc(c.note || c.basis)}">+${moneyK(c.opp)}</span>`;
    return '<span class="none">—</span>';
  };
  main.innerHTML = `<div class="cust c2 h2 ac ws">
    <h1>Accounts</h1>
    ${tabsHtml('whitespace')}
    ${litCard('ws-lit', 'Pulse summary. Comparable accounts: the same kind of organisation at a similar storage size, on R4\'s own books.')}
    <section class="h2-card" data-in>
      <div class="ragkey"><span>A plain figure buys it, twelve months</span><span class="xs">+$</span><span>does not buy it yet: what comparable accounts spend a year est.</span><span class="lowc">$</span><span>buys it, but low for its size</span></div>
      <div id="ws-t"></div>
      <div class="src">Comparable: the same kind of organisation, read from the account's name because the database holds no industry, with a third to three times its boxes, or its spend if it does not store. Where fewer than five qualify it widens to the same kind at any size, then to the whole book, and says so. A ceiling at the median comparable, not a forecast. Tap an account to see why.</div>
    </section>
  </div>`;
  drawPoints(main.querySelector('#ws-lit'), pts);
  const opp = (r, x) => { const c = r.cells[x.key]; return !c.have && c.opp > 0 ? c.opp : 0; };
  // the drill-down: each account's own run, the code Quote opens on for each line, and what has been sent already
  const seen = new Set(), SR = seriesOf(C), kinds = new Map();
  for (const [list, kind] of [[slippingAccounts(C), 'slipping'], [stoppedAccounts(C), 'stopped'], [risingAccounts(C), 'rising']]) for (const a of list) kinds.set(a.level1, kind);
  const quote = lineCodes(M, PRICED);
  const said = await fetch('/api/sales/opportunities', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => (j && j.data) || {}).catch(() => ({}));
  const drill = r => { const s = SR.get(r.level1); return drillData(r, s ? { move: s.move, kind: kinds.get(r.level1) || 'level' } : null); };
  const why = r => drillHtml(drill(r), { fresh: !seen.has(r.level1), quote });
  // kept to the width of the table's window, so it stays on screen however far the table has scrolled
  const fit = () => { const box = main.querySelector('#ws-t .dt-scroll'); if (box) box.style.setProperty('--cd-w', box.clientWidth + 'px'); };
  addEventListener('resize', fit);
  const onDraw = () => {
    fit(); seen.clear();
    main.querySelectorAll('#ws-t .cd').forEach(el => {
      const id = +el.dataset.cd, r = rows.find(x => x.level1 === id), d = drill(r);
      seen.add(id); drawPoints(el.querySelector('[data-cd-pts]'), d.points); wireDrill(el, d, said);
    });
  };
  dataTable(main.querySelector('#ws-t'), { key: 'crosssell', who: whoAmI(), filters: accountFilters(await getJson('view/customers'), C), rows, noun: 'accounts', placeholder: 'Find an account', search: r => r.customer, totalLabel: 'Total', detail: why, onDraw,
    cols: [
      { k: 'customer', l: 'Account', name: true, text: true, get: r => titleCase(r.customer), fmt: r => `<a href="#customer/${r.level1}">${esc(titleCase(r.customer))}</a><span class="peer">${esc(r.kind)}</span>` },
      ...LINES.map(x => ({ k: x.key, l: x.short || x.name, fixed: true, get: r => opp(r, x), fmt: r => tile1(r, x), total: 'sum', totalFmt: v => '+' + moneyK(v) })),
      { k: 'opp', l: 'Not bought yet', fixed: true, first: true, sorted: true, get: r => r.opp, fmt: r => r.opp > 0 ? '+' + moneyK(r.opp) : 'buys all', total: 'sum', totalFmt: v => '+' + moneyK(v) },
    ],
  });
  acPlay(main);
}
// ── Main customers: the 30 largest, month by month ───────────────────────────────────────────
// Each cell is the month's billing; its shade is the change against the account's own average of
// the six months before it. Red is down, green is up, ink is within 10%. Storage, service or both.

// Up and down: the customer table (components/custtable.js), filtered to falling, rising or all,
// sortable by any figure. Falling and rising are last month against the month before, in dollars.
async function upDown(main, C, params) {
  const [A, P] = await Promise.all([getJson('activity'), getJson('pulse')]);
  const T = customerTable(C, A, { bookPerService: bookPerService(P, A) });
  const f = ['falling', 'rising', 'all'].includes(params.f) ? params.f : 'falling';
  const base = f === 'falling' ? falling(T) : f === 'rising' ? rising(T) : T.rows.slice().sort((a, b) => b.last - a.last);
  let sort = COLUMNS.some(c => c.key === params.sort) ? params.sort : null, dir = params.dir === 'up' ? 1 : -1;
  const lastName = new Date(T.last + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const fall = falling(T), rise = rising(T), net = T.rows.reduce((t, r) => t + r.dLast, 0);
  const link = (ff, so, d) => `#customers?view=main&f=${ff}${so ? `&sort=${so}${d > 0 ? '&dir=up' : ''}` : ''}`;
  const draw = () => {
    const rows = sortRows(base, sort, dir).slice(0, f === 'all' ? 400 : 60);
    main.querySelector('#ud-table').innerHTML = tableHtml(T, rows, { sort, dir });
    main.querySelectorAll('#ud-table th[data-sort]').forEach(th => {
      const go = () => { const k = th.dataset.sort; dir = sort === k ? -dir : -1; sort = k; history.replaceState(null, '', link(f, sort, dir)); draw(); };
      th.addEventListener('click', go); th.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
    main.querySelectorAll('#ud-table tbody tr').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  };
  main.innerHTML = `
  <div class="cust">
    <h1>Accounts</h1>
    ${tabsHtml('main')}
    <p class="lede">In ${lastName}, ${fall.length} accounts billed less than the month before and ${rise.length} more; net ${net < 0 ? '−' : '+'}${moneyK(Math.abs(net))}. ${fall[0] ? `The biggest fall was ${esc(titleCase(fall[0].customer))}, −${moneyK(-fall[0].dLast)}.` : ''}</p>
    <div class="tools"><div class="seg">${[['falling', 'Falling'], ['rising', 'Rising'], ['all', 'All']].map(([k, l]) => `<a href="${link(k)}" class="${k === f ? 'on' : ''}">${l}</a>`).join('')}</div></div>
    <div class="card" id="ud-table" style="overflow-x:auto"></div>
    <div class="src">Posted invoices by invoice date, Citadel apart (exact), ${esc(new Date(T.month + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' }))} so far est.: each account's Veri-Shred done services to ${esc(T.latest)} × its own value per done service in the weeks before, or the book's where it had none${T.outside.services ? `, ${T.outside.services} services this month were for ${T.outside.accounts} smaller accounts outside this list` : ''}, storage for the month is billed in advance and not in this column, tap a column to sort</div>
  </div>`;
  draw();
}

// the book's value per done service: last month's work in the current run ÷ last month's done services
function bookPerService(P, A) { return billNow(P, A).perService; }

async function monthGrid(main, C, params) {
  const [P, VW, R] = await Promise.all([getJson('pulse'), getJson('view/customers'), loadRates()]);
  const B = { rows: VW.rows, book: VW.book, months: VW.months, ws: VW.ws };
  const big = VW.rows.filter(r => !r.citadel).sort((a, b) => b.ltm - a.ltm).slice(0, 30), ids = new Set(big.map(r => r.level1));
  const slip = slippingAccounts(C).filter(x => ids.has(x.level1)), rise = risingAccounts(C).filter(x => ids.has(x.level1));
  const top = slip.slice().sort((a, b) => a.move.d - b.move.d)[0], up = rise.slice().sort((a, b) => b.move.d - a.move.d)[0];
  const pts = [
    slip.length ? { key: 'slip', tone: 'r', lead: `${slip.length} of the 30 largest are slipping,`, rest: `at least 10% below their own run.${top ? ` The biggest is ${titleCase(top.customer)}, down ${moneyK(-top.move.d)} a month.` : ''}` } : { key: 'slip', tone: 'g', lead: 'None of the 30 largest is slipping', rest: 'against its own run.' },
  ];
  if (costsVisible()) {
    const thin = big.filter(r => r.pc != null && marginBand(R, r.pc).cls === 'r').sort((a, b) => a.pc - b.pc);
    const say = r => `${titleCase(r.customer)} ${(r.pc < 0 ? '−' : '') + Fmt.pct(Math.abs(r.pc))}`;
    pts.push(thin.length ? { key: 'thin', tone: 'r', lead: `${thin.length} of the 30 largest ${thin.length === 1 ? 'is' : 'are'} Thin:`, rest: `${thin.slice(0, 3).map(say).join(', ')} est.` } : { key: 'thin', tone: 'g', lead: 'None of the 30 largest is Thin', rest: 'on the cost model est.' });
  }
  pts.push(rise.length ? { key: 'rise', tone: 'g', lead: `${rise.length} ${rise.length === 1 ? 'is' : 'are'} rising,`, rest: `led by ${titleCase(up.customer)}, up ${moneyK(up.move.d)} a month on its own run.` } : { key: 'rise', tone: 'a', lead: 'None of the 30 largest is rising', rest: 'on its own run.' });
  main.innerHTML = `<div class="cust c2 h2 ac mg">
    <h1>Accounts</h1>
    ${tabsHtml('grid')}
    ${litCard('mg-lit', "Pulse summary. A shaded month is more than 25% and $5K from the account's own 12-month average.")}
    <section class="h2-card" data-in><div id="mg-t"></div>
      <div class="src">Invoice month, posted runs. Storage bills in advance, so a month's storage is that month's boxes; service is the month before's work. Citadel apart. Tap an account for its lines, a month for its invoices.</div></section>
  </div>`;
  drawPoints(main.querySelector('#mg-lit'), pts);
  VW.lines = async r => { const v = await getJson('view/account-lines?level1=' + r.level1); return v.rows.map(l => ({ name: l.name, values: Object.fromEntries(v.months.map((m, i) => [m, l.values[i]])) })); };
  accountTable(main.querySelector('#mg-t'), { key: 'monthgrid', VW, C, R, B, P, series: true });
  acPlay(main);
}
// ── Margin: every account, revenue less what it costs to serve, worst first ──────────────────
// The top of the margin drill: account → line of business → its orders → one order's cost build.
// Filters: the app's one definition of a margin (margin.js marginBand). Route-heavy accounts carry
// "under review" while delivery routes are missing from the route volumes.

function marginReason(a, m) {
  const top = Object.entries(m.fam).filter(([f, v]) => v.cost > 0).sort((x, y) => y[1].cost - x[1].cost)[0];
  if (!top) return 'no modelled cost: fees and charges only';
  const [f] = top;
  if (f === 'bin') return `${Fmt.grouped(a.bins || 0)} bin services on ${Fmt.grouped(a.visits || 0)} visits`;
  if (f === 'storage') return `${Fmt.num(a.boxes)} boxes stored`;
  if (f === 'movement') return 'deliveries and pickups carry most of the cost';
  if (f === 'handling') return 'retrievals and refiles carry most of the cost';
  if (f === 'itad') return 'ITAD collections carry most of the cost';
  if (f === 'shred') return 'shredding by weight or box carries most of the cost';
  return 'labour carries most of the cost';
}

// ── Margin: four levels, each replacing the last (v10's path, on real data) ──────────────────
//   1 every account: revenue, cost to serve, what is left, margin, and what to do about it
//   2 one account: its cost by kind and its lines of business
//   3 one line, job by job: each order with its place on the route that day
//   4 one job: the cost build in sentences, the route that day on a map, what would have made it cheaper
// #customers?view=margin[&id=<level1>[&line=<family>[&job=<woid>]]]
const n0 = Fmt.count;
const pcText = pc => pc == null ? '—' : pc < 0 ? 'below cost' : Fmt.pct(pc);
const mlink = (o = {}) => '#customers?view=margin' + Object.entries(o).filter(([, v]) => v != null && v !== 'all').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
const zctaP = () => fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
const jobCache = new Map();

async function marginView(main, C, params) {
  const [R, M] = await Promise.all([loadRates(), getJson('margin')]);
  const MS = marginSummary(R, M, [CITADEL]);
  const id = params.id != null ? Number(params.id) : null;
  if (id != null && params.line && params.job) return marginJob(main, R, M, MS, id, params.line, params.job);
  if (id != null && params.line) return marginLine(main, R, M, MS, id, params.line);
  if (id != null) return marginAccount(main, R, M, MS, id);
  return marginList(main, R, M, MS, params);
}

// level 1: every account
async function marginList(main, R, M, MS, params) {
  const filter = params.f === 'normal' ? 'normal' : params.f === 'thin' || params.f === 'below' ? 'thin' : 'all';   // 'below' is an old link
  const [A, Z] = await Promise.all([getJson('activity').catch(() => null), zctaP(), loadRoadnet()]);
  const acct = new Map(M.accounts.map(a => [a.level1, a])), AL = accountLines(R, M);
  const travelOf = id => (AL.get(id) || []).filter(l => l[0] === 'Travel to site' || l[0] === 'Truck time').reduce((t, l) => t + l[1], 0);
  const all = MS.accounts.map(m => ({ ...m, why: marginReason(acct.get(m.level1) || {}, m), act: marginAction(m, travelOf(m.level1), R.SETTINGS) }));
  const rows = all.filter(r => filter === 'all' || marginBand(R, r.pc).word.startsWith(filter === 'thin' ? 'Thin' : 'Normal')).sort((a, b) => a.margin - b.margin);
  const count = t => all.filter(r => r.act.tag === t).length;
  const sum = k => rows.reduce((t, r) => t + r[k], 0);
  const shown = params.n === 'all' ? rows.length : 60;
  const D = A ? densityByPostcode(R, A, Z) : { rows: [] };
  main.innerHTML = `
  <div class="cust mv2">
    <h1>Accounts</h1>
    ${tabsHtml('margin')}
    <p class="lede">What each account pays against what it costs to serve est., worst first. ${count('Renegotiate') + count('Re-route') + count('Drop')} accounts need a decision now (${count('Renegotiate')} renegotiate, ${count('Re-route')} re-route, ${count('Drop')} too small to keep), ${count('Reprice')} are thin enough to reprice, and ${count('Check routes')} look thin only on route costs still under review. Tap an account for its lines, then its jobs, then one job's cost.</p>
    <div class="tools"><div class="seg">${[['all', 'All'], ['normal', 'Normal'], ['thin', 'Thin']].map(([k, l]) => `<a href="${mlink({ f: k })}" class="${k === filter ? 'on' : ''}">${l}</a>`).join('')}</div></div>
    <div class="card">
      <div class="hd a"><span>Customer</span><span>Revenue</span><span>Cost est.</span><span>Left</span><span>Margin</span><span>Action</span><span></span></div>
      ${rows.slice(0, shown).map(r => `<a class="rw a" href="${mlink({ id: r.level1 })}">
        <span class="nm">${esc(titleCase(r.customer))}<small>${esc(r.why)}</small></span>
        <span class="r rv">${money0(r.revenue)}</span><span class="r cs">${money0(r.cost)}</span>
        <span class="r lf ${r.margin < 0 && !r.review ? 'is-bad' : ''}">${money0(r.margin)}</span>
        <span class="r pc ${r.pc < 0.15 && !r.review ? 'is-bad' : r.pc < 0.5 && !r.review ? 'is-warn' : ''}">${pcText(r.pc)}</span>
        <span class="ac"><span class="tag ${r.act.cls}" title="${esc(r.act.why)}">${r.act.tag}</span></span><span class="go">›</span></a>`).join('')}
      <div class="rw a tot" style="cursor:default"><span class="nm">${rows.length} accounts</span><span class="r rv">${money0(sum('revenue'))}</span><span class="r cs">${money0(sum('cost'))}</span><span class="r lf">${money0(sum('margin'))}</span><span class="r pc">${sum('revenue') > 0 ? Fmt.pct(sum('margin') / sum('revenue')) : '—'}</span><span></span><span></span></div>
      ${rows.length > shown ? `<a class="more" style="display:inline-block;margin-top:var(--sp-3);color:var(--brand);font-weight:500;text-decoration:none" href="${mlink({ f: filter, n: 'all' })}">Show all ${rows.length}</a>` : ''}
    </div>
    ${D.rows.length ? `<div class="card dens" style="margin-top:var(--sp-4)">
      <div class="card-head"><h3>Where more volume would cut cost: ${esc(D.rows[0].postcode)} first, about ${money0(D.rows[0].saving)} a year est.</h3></div>
      <p class="sub" style="margin:0 0 var(--sp-2)">Travel to a postcode is shared by the customers on the visit. Where visits carry one customer, one more on the same visits takes this much a year off the cost of serving the ones already there.</p>
      ${D.rows.map(d => `<div class="rw"><span class="nm">${esc(d.postcode)}, ${Fmt.fixed(d.miles, 0)} miles out<small>${n0(d.visits)} route visits a year, ${d.perVisit < 1.5 ? 'one customer each' : `${Fmt.fixed(d.perVisit, 1)} customers each`}, ${esc(titleCase(String(d.names || '').split(',').slice(0, 2).join(', ')))}</small></span><span class="r lf">${money0(d.saving)} a year</span><span></span></div>`).join('')}
      <div class="src">Route visits from ${D.days > 120 ? 'six months of route days' : `the ${D.days} days of routes held offline, scaled to a year`}, customers a visit from the twelve-month postcode book</div>
    </div>` : ''}
    <p class="foot">Twelve months. Cost to serve est. from the cost model: warehouse space, handling, route time and shred plant; sales, management and overhead sit above this line. Accounts over $1,000 a year. Citadel apart. Actions follow the one margin band: Thin is Drop under $5,000, Re-route with travel over 40% of cost, else Renegotiate; Normal is Reprice; Healthy is Hold; Check routes where most of the cost is route cost under review.</p>
  </div>`;
}

// level 2: one account, its cost by kind and its lines
async function marginAccount(main, R, M, MS, id) {
  const m = MS.book.accounts.find(a => a.level1 === id), a = M.accounts.find(x => x.level1 === id);
  if (!m || !a) { main.innerHTML = `<div class="cust mv2"><div class="crumb"><a href="${mlink()}">Margin</a></div><div class="pending">No twelve-month revenue or cost for this account.</div></div>`; return; }
  const lines = M.lines.filter(l => l.level1 === id), AC = accountCosts(R, a, lines);
  const parts = costParts(Object.values(AC).flat().flatMap(r => r.lines)), left = m.margin;
  const total = Math.max(m.revenue, m.cost, 1), name = titleCase(m.customer);
  const sm = MS.accounts.find(x => x.level1 === id), act = sm ? marginAction(sm, parts.route * R.SETTINGS.split, R.SETTINGS) : null;
  const units = f => f === 'storage' ? `${n0(a.boxes)} boxes` : (() => { const ls = lines.filter(l => (l.family || 'other') === f); const u = ls.reduce((t, l) => t + (l.units || 0), 0); const un = (ls[0] || {}).unit || 'units'; return u ? `${n0(u)} ${un}${u === 1 || /s$/.test(un) ? '' : 's'}` : ''; })();
  const fams = Object.entries(m.fam).filter(([, v]) => v.revenue > 0 || v.cost > 0).sort((x, y) => y[1].revenue - x[1].revenue);
  const seg = (v, cls, label) => v > 0.5 ? `<i class="${cls}" style="width:${v / total * 100}%" title="${esc(label)} ${money0(v)}">${v / total > 0.1 ? moneyK(v) : ''}</i>` : '';
  main.innerHTML = `
  <div class="cust mv2">
    <div class="crumb"><a href="${mlink()}">Margin</a><span>›</span><span>${esc(name)}</span></div>
    <h2 class="t">${esc(name)} pays ${money0(m.revenue)} a year for work that costs about ${money0(m.cost)} to serve est.</h2>
    <p class="lede">${left >= 0 ? `That leaves ${money0(left)}, ${Fmt.pct(left / m.revenue)} of what it pays.` : `That is ${money0(-left)} a year short.`} ${act ? `<span class="tag ${act.cls}">${act.tag}</span> ${esc(act.why)}` : ''} <a href="#customer/${id}?from=margin" style="color:var(--brand);text-decoration:none">The customer page ›</a></p>
    <div class="card">
      <div class="jv-bars">
        <span class="lab">Pays</span><div class="jv-bar"><i class="p-rev" style="width:${m.revenue / total * 100}%">${moneyK(m.revenue)}</i></div>
        <span class="lab">Costs est.</span><div class="jv-bar">${PARTS.map(p => seg(parts[p[0]], { space: 'p-space', handling: 'p-hand', route: 'p-route', plant: 'p-plant', labour: 'p-lab' }[p[0]], p[1])).join('')}</div>
        <span class="lab">${left >= 0 ? 'Left' : 'Short'}</span><div class="jv-bar"><i class="${left >= 0 ? 'p-left' : 'p-loss'}" style="width:${Math.abs(left) / total * 100}%">${Math.abs(left) / total > 0.1 ? moneyK(left) : ''}</i></div>
      </div>
      <div class="jv-key">${PARTS.filter(p => parts[p[0]] > 0.5).map(p => `<span><i class="${{ space: 'p-space', handling: 'p-hand', route: 'p-route', plant: 'p-plant', labour: 'p-lab' }[p[0]]}"></i>${p[1]} ${moneyK(parts[p[0]])}</span>`).join('')}</div>
    </div>
    <div class="card lines" style="margin-top:var(--sp-4)">
      <div class="card-head"><h3>By line of business, largest first</h3></div>
      <div class="hd"><span>Line</span><span>Volume</span><span>Revenue</span><span>Cost est.</span><span>Left</span><span>Margin</span><span></span></div>
      ${fams.map(([f, v]) => { const l = v.revenue - v.cost, pc = v.revenue > 0 ? l / v.revenue : null; return `<a class="rw" href="${mlink({ id, line: f })}">
        <span class="nm">${esc(FAMILY_NAMES[f] || f)}${pc != null && pc < 0 ? ' <span class="tag bad">below cost</span>' : ''}</span><span class="r u">${f === 'storage' || v.cost > 0 ? esc(units(f)) : ''}</span>
        <span class="r rv">${money0(v.revenue)}</span><span class="r cs">${v.cost ? money0(v.cost) : '—'}</span><span class="r lf ${l < 0 ? 'is-bad' : ''}">${money0(l)}</span>
        <span class="r pc">${pcText(pc)}</span><span class="go">›</span></a>`; }).join('')}
      <div class="src">Twelve months, posted invoices, cost est. from the cost model, tap a line for its jobs</div>
    </div>
  </div>`;
}

// the account's orders, costed on their route days, kept between levels 3 and 4
async function accountJobs(R, M, id) {
  if (jobCache.has(id)) return jobCache.get(id);
  const p = (async () => {
    const meta = new Map();
    for (const l of M.lines) if (l.level1 === id || !meta.has(l.servcode)) meta.set(l.servcode, { family: l.family, unit: l.unit, drives_cost: l.drives_cost });
    const [r, A, Z, PR] = await Promise.all([fetch(`/api/customer/${id}`, { credentials: 'same-origin' }), getJson('activity').catch(() => null), zctaP(), getJson('pricing'), loadRoadnet()]);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `HTTP ${r.status}` };
    const d = j.data; d.flatFee = flatFeeYear(M.lines.filter(l => l.level1 === id));
    const C = costOrders(R, d, meta, A, Z, id);
    return { d, meta, A, Z, C, svcName: new Map(PR.rates.map(x => [x.servcode, x.service])) };
  })();
  jobCache.set(id, p);
  return p;
}
const famItems = (o, f, meta) => o.items.filter(i => ((meta.get(i.code) || {}).family || 'other') === f);

// level 3: one line, job by job
async function marginLine(main, R, M, MS, id, f) {
  const m = MS.book.accounts.find(a => a.level1 === id), name = titleCase(m ? m.customer : `Account ${id}`), fname = FAMILY_NAMES[f] || f;
  const a = M.accounts.find(x => x.level1 === id), AC = a ? accountCosts(R, a, M.lines.filter(l => l.level1 === id)) : {};
  const v = (m && m.fam[f]) || { revenue: 0, cost: 0 };
  const crumb = `<div class="crumb"><a href="${mlink()}">Margin</a><span>›</span><a href="${mlink({ id })}">${esc(name)}</a><span>›</span><span>${esc(fname)}</span></div>`;
  const working = (AC[f] || []).flatMap(r => r.lines);
  const workHtml = working.length ? `<table class="jv-tab working"><tbody>${working.map(l => `<tr><td>${esc(l[0])}${l[3] ? ' est.' : ''}</td><td class="why">${esc(l[2])}</td><td class="num">${money0(l[1])}</td></tr>`).join('')}</tbody></table>` : '';
  main.innerHTML = `<div class="cust mv2">${crumb}<h2 class="t">${esc(fname)}: ${money0(v.revenue)} a year against about ${money0(v.cost)} to serve est.</h2><div id="mv-jobs"><p class="sub">Loading the jobs…</p></div>
    <div class="card" style="margin-top:var(--sp-4)"><div class="card-head"><h3>The year's cost, worked out est.</h3></div>${workHtml || '<p class="sub">No modelled cost on this line: fees and charges with no volume behind them.</p>'}<div class="src">Twelve months of volume at the cost model's rates ; the jobs above are costed one by one on their own route days</div></div></div>`;
  const box = main.querySelector('#mv-jobs');
  if (['storage', 'other'].includes(f)) { box.innerHTML = `<p class="note">${f === 'storage' ? 'Storage bills every month for the boxes held, so it has no jobs: its cost is the warehouse space below.' : 'Fees and charges carry no volume, so there are no jobs to cost.'}</p>`; return; }
  const J = await accountJobs(R, M, id);
  if (!box.isConnected) return;
  if (J.error) { box.innerHTML = `<div class="pending">${esc(J.error)}</div>`; return; }
  const jobs = J.d.orders.map(o => { const items = famItems(o, f, J.meta); if (!items.length) return null; const x = J.C.cost(o, items); return { o, items, ...x, rev: items.reduce((t, i) => t + (i.revenue || 0), 0), place: jobPlace(x.ctx) }; }).filter(Boolean);
  if (!jobs.length) { box.innerHTML = '<p class="note">No orders on this line in the last six months.</p>'; return; }
  const onFee = j => !!J.d.flatFee && !j.rev, short = jobs.filter(j => j.margin < 0 && !onFee(j)), real = jobs.filter(j => j.cost.real).length, route = jobs.filter(j => j.cost.route).length;
  const units = j => j.items.reduce((t, i) => t + (i.units || 0), 0);
  box.innerHTML = `<p class="note">${J.d.flatFee ? `<b>Billed as a flat fee, ${money0(J.d.flatFee)} in the last twelve months, so read the line's year, not each job.</b>` : short.length ? `<b>${short.length} of ${jobs.length} jobs did not cover their cost.</b>` : `All ${jobs.length} jobs covered their cost.`} ${route ? `The route share moves most: it depends on how many other stops the driver made that day and how far apart they were. ${real} of the ${route} route jobs are costed on their real route day; the rest at the model's average visit${real < route ? ' (no Veri-Shred route for this account that day, or the date is outside the routes held offline)' : ''}.` : ''} Tap a job to see how its cost is built.</p>
    <div class="card jobs"><div class="hd"><span>Date</span><span>Where</span><span>Miles</span><span>Stops</span><span>Units</span><span>Billed</span><span>Cost est.</span><span>Left</span><span></span></div>
    ${jobs.slice(0, 80).map(j => `<a class="rw" href="${mlink({ id, line: f, job: j.o.woid })}">
      <span class="dt">${esc(new Date(j.o.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }))}</span>
      <span class="nm">${j.place ? `${esc(j.place.postcode || '—')} <small style="display:inline;color:var(--ink-4)">route ${esc(/\d/.test(j.place.route) ? j.place.route : titleCase(j.place.route))}</small>` : '<span class="sub">no route that day</span>'}</span>
      <span class="pl">${j.place ? `${j.place.miles != null ? Fmt.fixed(j.place.miles, 0) + ' mi, ' : ''}${j.place.stops} stops` : ''}</span>
      <span class="r mi">${j.place && j.place.miles != null ? Fmt.fixed(j.place.miles, 0) : '—'}</span><span class="r st">${j.place ? `${j.place.stops}` : '—'}</span>
      <span class="r u">${n0(units(j))}</span><span class="r rv">${onFee(j) ? 'flat fee' : money0(j.rev)}</span><span class="r cs">${money0(j.cost.total)}</span>
      <span class="r lf ${onFee(j) ? '' : j.margin < 0 ? (j.cost.real || !j.cost.route ? 'is-bad' : 'is-warn') : ''}">${onFee(j) ? '—' : money0(j.margin)}</span><span class="go">›</span></a>`).join('')}
    <div class="src">VCK work orders, six months, this line's items only, miles from the yard and stops on the route that day from Veri-Shred done orders${J.d.routes && J.d.routes.length ? '' : ' (about three weeks held offline)'}, cost est. from the cost model</div></div>`;
}

// level 4: one job
async function marginJob(main, R, M, MS, id, f, woid) {
  const m = MS.book.accounts.find(a => a.level1 === id), name = titleCase(m ? m.customer : `Account ${id}`), fname = FAMILY_NAMES[f] || f;
  main.innerHTML = `<div class="cust mv2"><p class="sub">Loading the job…</p></div>`;
  const J = await accountJobs(R, M, id);
  const o = J.d && J.d.orders.find(x => String(x.woid) === String(woid));
  const crumb = `<div class="crumb"><a href="${mlink()}">Margin</a><span>›</span><a href="${mlink({ id })}">${esc(name)}</a><span>›</span><a href="${mlink({ id, line: f })}">${esc(fname)}</a><span>›</span><span>${o ? esc(new Date(o.date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })) : 'job'}</span></div>`;
  if (!o) { main.innerHTML = `<div class="cust mv2">${crumb}<div class="pending">${esc(J.error || 'This order is not among the account\'s last six months.')}</div></div>`; return; }
  const items = famItems(o, f, J.meta).length ? famItems(o, f, J.meta) : o.items, x = J.C.cost(o, items), pl = jobPlace(x.ctx);
  main.innerHTML = `<div class="cust mv2">${crumb}
    <h2 class="t">${esc(fname)} for ${esc(name)}, order ${esc(o.woid)}</h2>
    <p class="lede">${pl ? `At ${esc(pl.postcode || 'an unplaced address')}${pl.miles != null ? `, ${Fmt.fixed(pl.miles, 0)} miles from the yard` : ''}, on route ${esc(/\d/.test(pl.route) ? pl.route : titleCase(pl.route))} with ${pl.stops} stop${pl.stops === 1 ? '' : 's'} for ${pl.visits} customer${pl.visits === 1 ? '' : 's'} that day.` : 'Not on a Veri-Shred route that day.'}</p>
    <div class="card">${jobHtml({ o, items, c: x.cost, svcName: J.svcName, ctx: x.ctx, A: J.A })}</div></div>`;
  drawRouteBlock(main.querySelector('.jv-route'), x.ctx, { R, A: J.A, Z: J.Z });
}

// ── Overdue boxes: destruction once against the storage it ends ──────────────────────────────
// Boxes past their retention review (storage_retention status I, from calls.json). Destruction is
// priced at the book's median shredding fee per standard box (R3); the storage each destroyed box
// stops paying is the account's own latest rate per box, else the box-weighted median.

async function destructionView(main, C, params) {
  const [CA, PR, M] = await Promise.all([getJson('calls'), getJson('pricing'), getJson('margin')]);
  const ob = overdueBoxes(CA, PR), perBox = ob.perBox, st = { med: ob.med };
  const stored = new Map(M.accounts.map(a => [a.level1, a.boxes]));
  const rows = ob.rows.map(r => ({ ...r, total: stored.get(r.level1) || 0 }));
  const T = k => rows.reduce((t, r) => t + r[k], 0);
  const top = rows[0];
  const medMonths = perBox / st.med;
  const shown = params.n === 'all' ? rows.length : 50;

  main.innerHTML = `
  <div class="cust dv">
    <h1>Accounts</h1>
    ${tabsHtml('destruction')}
    <p class="lede">${Fmt.num(T('boxes'))} boxes across ${rows.length} accounts are past their retention review. Destroying them would bill about <b>${moneyK(T('once'))} once</b>, at the book's median ${Fmt.money(perBox, { dp: 2 })} a box, and end about <b>${moneyK(T('lost'))} a month</b> of storage. At the median storage rate one destruction equals ${Math.round(medMonths)} months of storage, so the strongest cases are the accounts paying least to store${top ? `, starting with ${esc(titleCase(top.customer))}: ${Fmt.num(top.boxes)} overdue boxes at ${Fmt.money(top.rate, { dp: 3 })} a box` : ''}.</p>
    <div class="card">
      <div class="hd"><span>Customer</span><span>Overdue boxes</span><span>Destruction, once</span><span>Storage it ends, a month</span><span>Months it equals</span><span></span></div>
      ${rows.slice(0, shown).map(r => `<a class="rw" href="#customer/${r.level1}">
        <span class="nm">${esc(titleCase(r.customer))}<small>${r.total ? `${Fmt.pct(r.boxes / Math.max(r.boxes, r.total))} of ${Fmt.num(r.total)} boxes stored, ` : ''}${Fmt.money(r.rate, { dp: 3 })} a box${r.own ? '' : ' (book median)'}</small>${r.total ? `<span class="share"><i style="width:${Math.min(100, r.boxes / r.total * 100)}%"></i></span>` : ''}</span>
        <span class="r bx">${Fmt.num(r.boxes)}</span>
        <span class="r once">${moneyK(r.once)}<span class="sub" style="display:none"> once</span></span>
        <span class="r lost">−${moneyK(r.lost)}</span>
        <span class="r mo">${r.months == null ? '—' : Math.round(r.months)}</span><span class="go">›</span></a>`).join('')}
      <div class="rw tot" style="cursor:default"><span class="nm">${rows.length} accounts</span><span class="r bx">${Fmt.num(T('boxes'))}</span><span class="r once">${moneyK(T('once'))}</span><span class="r lost">−${moneyK(T('lost'))}</span><span class="r mo">${Math.round(T('once') / T('lost'))}</span><span></span></div>
      ${rows.length > shown ? `<a style="display:inline-block;margin-top:var(--sp-3);color:var(--brand);font-weight:500;text-decoration:none" href="#customers?view=destruction&n=all">Show all ${rows.length}</a>` : ''}
    </div>
    <p class="foot">Overdue: boxes in storage with a review date passed, not on hold and not permanent. Destruction at the book's median fee per standard box; storage at the account's latest rate per box, else the box-weighted median. Destruction needs the client's sign-off on the retention list. Citadel apart.</p>
  </div>`;
}
