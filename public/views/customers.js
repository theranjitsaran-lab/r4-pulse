// Customers — one list, several views. Every number on Home opens one of these; every row opens
// the customer page. Each row: name and why it is listed, a 24-month sparkline, twelve-month
// revenue, change on the twelve months before, and gross margin (◇ modelled).
import { sparkline, money0, moneyK } from '/components/chart.js';
import { buildMargins, marginSummary } from '/components/margin.js';
import { getJson, loadRates, titleCase, esc, getLog, postLog } from '/components/data.js';
import { serviceGaps, storageGaps, overdueBoxes, crossSellPace, slippingAccounts, stoppedAccounts, risingAccounts, CROSS_SELL_DEPTH } from '/components/levers.js';
import { buildWhitespace, LINES } from '/components/whitespace.js';
import { openExplainer } from '/components/explain.js';

const CITADEL = 6714;
const ROUTE_FAMILIES = ['bin', 'handling', 'movement'];   // route costs under review: delivery days not yet in the volumes

export const VIEWS = {
  conversations: { label: 'This week', blurb: 'Ten conversations worth having, ranked by what is at stake. Log what you did; the list learns.' },
  main:          { label: 'Main customers', blurb: 'The 30 largest accounts, month by month, each against its own run.' },
  whitespace:    { label: 'Cross-sell', blurb: 'What each large account buys, and what it doesn\'t buy yet, sized at what comparable accounts spend.' },
  slipping:      { label: 'Slipping', blurb: 'Down 10% or more on their own run over the last three months. Still-billing accounts first; then those that have stopped or nearly, often one-off projects, which Home leaves out of the win-back.' },
  gaps:          { label: 'Price gaps', blurb: 'Paying under the book\'s median for storage or a service, sized by their volume. Home counts half of each gap.' },
  rounds:        { label: 'Missed rate rounds', blurb: 'No rate has moved in two years.' },
  destruction:   { label: 'Overdue boxes', blurb: 'Boxes past their retention review, by account: what destruction bills once, and the storage it ends.' },
  margin:        { label: 'Margin', blurb: 'Every account: revenue less what it costs to serve, worst first.' },
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
    for (const a of sg.values()) by.set(a.level1, { level1: a.level1, customer: a.customer, worth: a.worth, why: `${titleCase(a.top.service)}: $${a.top.rate.toFixed(2)} against a $${a.top.med.toFixed(2)} median` });
    for (const r of st.rows) {
      const a = by.get(r.level1) || { level1: r.level1, customer: r.customer, worth: 0, why: null };
      a.worth += r.worth;
      const sw = `Storage $${r.rate.toFixed(3)} a box against $${r.med.toFixed(3)} on ${Math.round(r.boxes).toLocaleString('en-US')} boxes`;
      a.why = a.why ? `${sw}; ${a.why}` : sw;
      by.set(r.level1, a);
    }
    return [...by.values()].sort((a, b) => b.worth - a.worth).slice(0, 60)
      .map(g => base(g.level1, `${g.why} · ${moneyK(g.worth * 12)} a year at the median`, { worth: g.worth, customer: g.customer }));
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
  if (view === 'conversations') return conversations(main, C);
  if (view === 'whitespace') return whitespace(main, C, params);
  if (view === 'main') return monthGrid(main, C, params);
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
    <h1>Customers</h1>
    <p class="blurb">${esc(VIEWS[view].blurb)}</p>
    <div class="bar">
      <div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="${link(k)}" class="${k === view ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div>
      <div class="seg">${[['size', 'Size'], ['change', 'Change'], ['margin', 'Margin']].map(([k, l]) => `<a href="${link(view, k)}" class="${k === sort ? 'on' : ''}">${l}</a>`).join('')}</div>
    </div>
    <div class="card">
      <div class="head"><span>Customer</span><span>24 months</span><span>Last 12 months</span><span>Last 3 months</span><span>Margin</span><span></span></div>
      <ul class="list">${rows.map(row).join('') || '<li style="padding:16px;color:var(--ink-3)">No accounts in this view.</li>'}</ul>
    </div>
    <p class="foot">${rows.length} accounts · last 3 months is each account against its own twelve months before them, the same measure as Home and Slipping · margin ◇ is revenue less modelled cost to serve; route-based costs are under review.</p>
  </div>`;
}

const mvPc = s => s && s.move ? s.move.pct : null;
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
    <span class="r mg">${pc == null ? '—' : `${Math.round(pc * 100)}%${routeHeavy ? '<span class="rvm" title="route costs under review">◇</span>' : ''}`}</span>
    <span class="go">›</span></a></li>`;
}

// ── This week: ten conversations, each from a signal, ranked by what is at stake a year ─────
const OPENERS = {
  slipping: n => `We've seen less work from ${n} over the last two months. Is anything changing on your side we should know about?`,
  gap: (n, x) => `Your ${x.service} rate hasn't kept pace with what similar clients pay. Could we talk about bringing it in line?`,
  rounds: n => `Your rates haven't moved in two years. We're reviewing them for the new year and wanted to talk with you first.`,
  overdue: (n, x) => `${x.boxes.toLocaleString('en-US')} of your boxes are past their retention date. Shall we arrange secure destruction?`,
  nodestroy: n => `You store your records with us but shred elsewhere. We can collect and destroy on the same visit.`,
};

async function conversations(main, C) {
  const [P, PR, CA, log] = await Promise.all([getJson('pulse'), getJson('pricing'), getJson('calls'), getLog().catch(() => [])]);
  const ser = seriesOf(C);
  const cands = new Map();
  const add = (id, sig) => { if (id === CITADEL) return; const c = cands.get(id) || { level1: id, sigs: [] }; c.sigs.push(sig); cands.set(id, c); };
  for (const d of slippingAccounts(C)) add(d.level1, { key: 'slipping', stake: -d.move.d * 12, ev: `${moveReason(d.move, moneyK)} over the last three months, against its own run`, name: d.customer });
  const meds = {};
  for (const code of ['B2', 'B3', 'B6', '01', '20', '25', '30', 'S3', 'S4', 'S6']) {
    const v = PR.rates.filter(r => r.servcode === code && r.modal_rate > 0 && r.units > 0).map(r => r.modal_rate).sort((a, b) => a - b);
    if (v.length >= 20) meds[code] = v[Math.floor(v.length / 2)];
  }
  for (const r of PR.rates) if (meds[r.servcode] && r.modal_rate > 0 && r.modal_rate < meds[r.servcode] && r.units > 0)
    add(r.level1, { key: 'gap', stake: (meds[r.servcode] - r.modal_rate) * r.units, ev: `${titleCase(r.service)}: $${r.modal_rate.toFixed(2)} against a $${meds[r.servcode].toFixed(2)} median`, service: titleCase(r.service).toLowerCase(), name: r.customer });
  for (const c of CA) {
    if (c.not_raised_2y) add(c.level1, { key: 'rounds', stake: c.service * 0.08, ev: `no rate moved in two years on ${moneyK(c.service)} of service`, name: c.customer });
    if (c.boxes_review_overdue >= 50) add(c.level1, { key: 'overdue', stake: 0, boxes: Math.round(c.boxes_review_overdue), ev: `${Math.round(c.boxes_review_overdue).toLocaleString('en-US')} boxes past their retention review`, name: c.customer });
    if (c.storage_no_destruction && c.storage > 20000) add(c.level1, { key: 'nodestroy', stake: 0, ev: `${moneyK(c.storage)} of storage a year and no destruction`, name: c.customer });
  }
  // handled in the last seven days drops out: called, emailed or not this week
  const week = Date.now() - 7 * 864e5;
  const handled = new Set(log.filter(l => l.kind === 'call' && Date.parse(l.logged_at) > week).map(l => l.level1));
  const list = [...cands.values()].filter(c => !handled.has(c.level1)).map(c => {
    c.sigs.sort((a, b) => b.stake - a.stake || (b.boxes || 0) - (a.boxes || 0));
    c.stake = c.sigs.reduce((t, s) => t + s.stake, 0);
    c.name = titleCase((ser.get(c.level1) || {}).customer || c.sigs[0].name);
    return c;
  }).sort((a, b) => b.stake - a.stake || (b.sigs[0].boxes || 0) - (a.sigs[0].boxes || 0)).slice(0, 10);

  main.innerHTML = `
  <div class="cust">
    <h1>Customers</h1>
    <p class="blurb">${esc(VIEWS.conversations.blurb)}</p>
    <div class="bar"><div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="#customers?view=${k}" class="${k === 'conversations' ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div></div>
    <div class="convs">${list.map((c, i) => `
      <div class="card conv" data-id="${c.level1}" data-sig="${c.sigs[0].key}">
        <div class="card-head"><h3><a href="#customer/${c.level1}" style="color:inherit;text-decoration:none">${i + 1}. ${esc(c.name)} <span style="color:var(--ink-5)">›</span></a></h3><small>${c.stake ? moneyK(c.stake) + ' a year at stake' : ''}</small></div>
        <div class="sub">${c.sigs.slice(0, 2).map(s => esc(s.ev)).join(' · ')}</div>
        <p class="open-line">“${esc(OPENERS[c.sigs[0].key](c.name, c.sigs[0]))}”</p>
        <div class="acts"><button data-v="called">Called</button><button data-v="emailed">Emailed</button><button data-v="not_this_week">Not this week</button><span class="done-note"></span></div>
      </div>`).join('') || '<div class="card">Nothing to call about this week.</div>'}</div>
    <p class="foot">At stake: a year of the slipping shortfall, the gap to the median, or the typical 8% rise. Logged accounts drop out for seven days.</p>
  </div>`;
  if (!document.getElementById('conv-css')) {
    const st = document.createElement('style'); st.id = 'conv-css';
    st.textContent = `.convs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .conv .open-line { font-size: 15px; line-height: 1.45; margin: 10px 0 12px; color: var(--ink-2); }
      .conv .acts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .conv .acts button { border: 1px solid var(--rule-3); background: var(--surface); border-radius: 9px; padding: 6px 12px; font-size: 14px; color: var(--ink); cursor: pointer; }
      .conv .acts button:hover { border-color: var(--brand); color: var(--brand); }
      .conv.logged { opacity: .55; }
      .conv .done-note { font-size: 13px; color: var(--good); }
      @media (max-width: 760px) { .convs { grid-template-columns: 1fr; } }`;
    document.head.appendChild(st);
  }
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
const WS_CSS = `
.ws .lede { font-size: 17px; line-height: 1.45; color: var(--ink-2); margin: 0 0 6px; max-width: 900px; }
.ws .grid { display: grid; grid-template-columns: minmax(170px, 1.4fr) repeat(6, minmax(0, 1fr)) 92px; gap: 0 6px; align-items: center; }
.ws .gh { font-size: 12px; color: var(--ink-3); padding: 0 0 8px; text-align: center; }
.ws .gh:first-child { text-align: left; } .ws .gh:last-child { text-align: right; }
.ws .wr { display: contents; }
.ws .wr > * { border-top: 1px solid var(--rule); padding: 7px 0; min-height: 44px; display: flex; align-items: center; }
.ws .wr .nm { font-weight: 600; font-size: 14px; line-height: 1.25; color: inherit; text-decoration: none; display: block; padding-top: 10px; }
.ws .wr .nm small { display: block; font-weight: 400; font-size: 12px; color: var(--ink-3); }
.ws .wr .nm:hover { color: var(--brand); }
.ws .c { justify-content: center; }
.ws .c span { display: inline-block; min-width: 64px; text-align: center; font-size: 12.5px; font-variant-numeric: tabular-nums; border-radius: 6px; padding: 4px 6px; white-space: nowrap; }
.ws .c .have { background: color-mix(in srgb, var(--ink) var(--a), var(--surface)); color: var(--ink); }
.ws .c .have.dark { color: var(--surface); }
.ws .c .opp { border: 1.5px dashed var(--ink-5); color: var(--ink-2); font-weight: 600; background: none; font: inherit; font-size: 12.5px; font-variant-numeric: tabular-nums; border-radius: 6px; padding: 4px 6px; min-width: 64px; cursor: pointer; }
.ws .c .opp:hover { border-color: var(--brand); color: var(--brand); }
.ws .c .none { color: var(--ink-5); }
.ws .tot { justify-content: flex-end; font-weight: 700; font-variant-numeric: tabular-nums; }
.ws .key { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--ink-3); margin: 10px 0 14px; align-items: center; }
.ws .key span span { display: inline-block; width: 26px; height: 14px; border-radius: 4px; vertical-align: -3px; margin-right: 6px; }
.ws .more { margin-top: 10px; border: 0; background: none; color: var(--brand); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; padding: 6px 0; }
@media (max-width: 760px) {
  .ws .grid { grid-template-columns: 1fr 1fr; gap: 0 8px; }
  .ws .gh { display: none; }
  .ws .wr .nm { grid-column: 1 / -1; padding-top: 14px; border-top: 1px solid var(--rule-3); min-height: 0; }
  .ws .wr .tot { grid-column: 1 / -1; justify-content: flex-start; border-top: 0; min-height: 0; padding: 2px 0 10px; }
  .ws .wr .tot::before { content: "Not bought yet: "; font-weight: 400; color: var(--ink-3); margin-right: 4px; }
  .ws .c { justify-content: space-between; border-top: 0; min-height: 0; padding: 3px 0; font-size: 12.5px; }
  .ws .c::before { content: attr(data-l); color: var(--ink-3); }
  .ws .c.nobuy { display: none; }
}`;

const lc = n => n === 'ITAD' ? n : n.toLowerCase();

async function whitespace(main, C, params) {
  if (!document.getElementById('ws-css')) { const st = document.createElement('style'); st.id = 'ws-css'; st.textContent = WS_CSS; document.head.appendChild(st); }
  const [M, CA] = await Promise.all([getJson('margin'), getJson('calls')]);
  const W = buildWhitespace(M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
  const rows = W.rows.filter(r => r.opp > 0).sort((a, b) => b.opp - a.opp);
  const maxHave = Math.max(...W.rows.flatMap(r => LINES.map(x => r.cells[x.key].have ? r.cells[x.key].spend : 0)));
  const top3 = rows.slice(0, 3).map(r => {
    const best = LINES.map(x => ({ x, c: r.cells[x.key] })).filter(o => !o.c.have && o.c.opp > 0).sort((a, b) => b.c.opp - a.c.opp)[0];
    return `${titleCase(r.customer)} (${lc(best.x.name)}, about ${moneyK(best.c.opp)} a year)`;
  });
  const byLine = LINES.map(x => ({ x, v: rows.reduce((t, r) => t + (r.cells[x.key].have ? 0 : r.cells[x.key].opp), 0) })).sort((a, b) => b.v - a.v);
  const shown = params.all ? rows.length : 40;
  const pace = crossSellPace(M.history), names = new Map(M.accounts.map(a => [a.level1, a.customer]));
  const paceLine = pace ? ` <span style="display:block;margin-top:8px">That is the ceiling. R4's own record: in the last twelve months ${pace.count} existing accounts added a line (${pace.prevCount} the year before), worth about ${moneyK(pace.value)} in their first year so far. The biggest: ${pace.best.map(f => `${esc(titleCase(names.get(f.level1) || 'Account ' + f.level1))} (${lc((LINES.find(x => x.key === f.family) || { name: f.family }).name)}, ${moneyK(f.first_year)})`).join(', ')}.</span>` : '';

  const cell = (r, x) => {
    const c = r.cells[x.key];
    if (c.have) { const a = Math.round(8 + 72 * Math.sqrt(c.spend / maxHave)); return `<div class="c" data-l="${esc(x.short || x.name)}"><span class="have ${a > 55 ? 'dark' : ''}" style="--a:${a}%" title="${esc(x.name)}: ${money0(c.spend)} in the last twelve months">${moneyK(c.spend)}</span></div>`; }
    if (c.opp > 0) return `<div class="c" data-l="${esc(x.short || x.name)}"><button class="opp" data-id="${r.level1}" data-key="${x.key}" title="How this was worked out">+${moneyK(c.opp)}</button></div>`;
    return `<div class="c nobuy" data-l="${esc(x.short || x.name)}"><span class="none">—</span></div>`;
  };

  main.innerHTML = `
  <div class="cust ws">
    <h1>Customers</h1>
    <div class="bar"><div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="#customers?view=${k}" class="${k === 'whitespace' ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div></div>
    <p class="lede">If the largest ${CROSS_SELL_DEPTH} accounts bought each line the way comparable accounts do, they would spend about <b>${moneyK(W.total)} a year more</b> (${moneyK(W.total / 12)} a month ◇). Most of it is ${lc(byLine[0].x.name)} and ${lc(byLine[1].x.name)}. Start with ${top3.join(', ')}.${paceLine}</p>
    <div class="key"><span><span style="background:color-mix(in srgb, var(--ink) 30%, var(--surface))"></span>buys it: twelve-month spend, darker is more</span><span><span style="border:1.5px dashed var(--ink-5)"></span>doesn't buy it yet: what comparable accounts spend ◇</span><span>— not sized</span></div>
    <div class="card">
      <div class="grid">
        <div class="gh">Customer</div>${LINES.map(x => `<div class="gh">${esc(x.short || x.name)}</div>`).join('')}<div class="gh">Not bought yet</div>
        ${rows.slice(0, shown).map(r => `<div class="wr">
          <a class="nm" href="#customer/${r.level1}">${esc(titleCase(r.customer))}<small>${moneyK(r.total)} a year${r.boxes >= 500 ? ` · ${Math.round(r.boxes).toLocaleString('en-US')} boxes` : ''}</small></a>
          ${LINES.map(x => cell(r, x)).join('')}
          <div class="tot">+${moneyK(r.opp)}</div></div>`).join('')}
      </div>
      ${rows.length > shown ? `<a class="more" href="#customers?view=whitespace&all=1">Show all ${rows.length} accounts</a>` : ''}
    </div>
    <p class="foot">Tap a dashed figure to see how it was worked out, the comparable accounts behind it, and how it is usually sold. Sized from the last twelve months. Retrieval, delivery and destruction for a storer: the median spend per 1,000 boxes among storers that buy the line. Storage, bins and ITAD: the median share of spend among similar-sized accounts that buy the line as an add-on. Never more than the account spends today. Citadel apart.</p>
  </div>`;
  const calls = new Map(CA.map(c => [c.level1, c]));
  main.querySelector('.ws .grid').addEventListener('click', ev => {
    const b = ev.target.closest('button.opp'); if (!b) return;
    const row = W.rows.find(r => r.level1 === Number(b.dataset.id));
    if (row) openExplainer({ row, key: b.dataset.key, call: calls.get(row.level1), H: M.history, names: new Map(M.accounts.map(a => [a.level1, a.customer])) });
  });
}

// ── Main customers: the 30 largest, month by month ───────────────────────────────────────────
// Each cell is the month's billing; its shade is the change against the account's own average of
// the six months before it. Red is down, green is up, ink is within 10%. Storage, service or both.
const MG_CSS = `
.mg .lede { font-size: 17px; line-height: 1.45; color: var(--ink-2); margin: 0 0 12px; max-width: 900px; }
.mg .tools { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.mg table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.mg th { font-size: 12px; font-weight: 500; color: var(--ink-3); padding: 0 2px 8px; text-align: center; }
.mg th.nmh { text-align: left; width: 210px; }
.mg th.tt { width: 78px; text-align: right; }
.mg td { padding: 2px; border-top: 1px solid var(--rule); height: 38px; }
.mg td.nm a { color: inherit; text-decoration: none; font-weight: 600; font-size: 14px; line-height: 1.2; display: block; }
.mg td.nm a:hover { color: var(--brand); }
.mg td.nm small { display: block; font-weight: 400; font-size: 12px; color: var(--ink-3); }
.mg td.cl span { display: block; text-align: center; font-size: 12px; font-variant-numeric: tabular-nums; border-radius: 5px; padding: 6px 0; white-space: nowrap;
  background: color-mix(in srgb, var(--tone) var(--a), var(--surface)); }
.mg td.cl span.strong { color: var(--surface); font-weight: 600; }
.mg td.tt { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; font-size: 14px; }
.mg .key { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--ink-3); }
.mg .key i { display: inline-block; width: 22px; height: 12px; border-radius: 3px; }
@media (max-width: 760px) {
  .mg th.nmh { width: 120px; }
  .mg th.tt, .mg td.tt { display: none; }
  .mg .old { display: none; }
  .mg td.nm a { font-size: 13px; }
  .mg td { padding: 2px 1px; }
  .mg td.cl span { font-size: 10.5px; letter-spacing: -.02em; padding: 5px 0; }
  .mg .card { padding: 14px 12px; }
}`;

async function monthGrid(main, C, params) {
  if (!document.getElementById('mg-css')) { const st = document.createElement('style'); st.id = 'mg-css'; st.textContent = MG_CSS; document.head.appendChild(st); }
  const which = ['storage', 'service'].includes(params.series) ? params.series : 'total';
  const ser = [...seriesOf(C).values()].filter(s => s.ltm > 0 && s.level1 !== CITADEL).sort((a, b) => b.ltm - a.ltm).slice(0, 30);
  const months = ser.length ? ser[0].months : [];
  const N = Math.min(13, months.length - 6), first = months.length - N;
  const mlab = (m, i) => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + (i === 0 || m.slice(5, 7) === '01' ? " '" + m.slice(2, 4) : '');
  const cells = s => {
    const v = s[which];
    return months.slice(first).map((m, j) => {
      const i = first + j, run = v.slice(i - 6, i).reduce((t, x) => t + x, 0) / 6;
      return { m, v: v[i], run, d: run > 0 ? v[i] / run - 1 : null };
    });
  };
  const grid = ser.map(s => ({ s, c: cells(s) }));
  // the biggest move in the latest month, in dollars against the account's own run
  // the sentence uses the app's one measure of movement (last three months against the twelve before)
  const slipIds = new Set(slippingAccounts(C).map(x => x.level1)), riseIds = new Set(risingAccounts(C).map(x => x.level1));
  const lastMoves = grid.filter(g => g.s.move).map(g => ({ s: g.s, d: g.s.move.d })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const down = grid.filter(g => (g.c[g.c.length - 1].d ?? 0) < -0.1).length, up = grid.filter(g => (g.c[g.c.length - 1].d ?? 0) > 0.1).length;
  const lastM = months[months.length - 1], lastName = new Date(lastM + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const top = lastMoves[0];

  const shade = d => {
    if (d == null) return { tone: 'var(--ink)', a: 4, strong: false };
    const mag = Math.min(1, Math.abs(d) / 0.6);
    if (Math.abs(d) < 0.1) return { tone: 'var(--ink)', a: 5, strong: false };
    return { tone: d < 0 ? 'var(--bad)' : 'var(--good)', a: Math.round(14 + 66 * mag), strong: mag > 0.62 };
  };
  const link = sv => `#customers?view=main${sv !== 'total' ? '&series=' + sv : ''}`;
  main.innerHTML = `
  <div class="cust mg">
    <h1>Customers</h1>
    <div class="bar"><div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="#customers?view=${k}" class="${k === 'main' ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div></div>
    <p class="lede">Over the last three months, ${grid.filter(g => slipIds.has(g.s.level1)).length} of the 30 largest accounts are slipping (10% or more below their own run) and ${grid.filter(g => riseIds.has(g.s.level1)).length} are rising.${top ? ` The biggest move is ${esc(titleCase(top.s.customer))}, ${top.d < 0 ? '−' : '+'}${moneyK(Math.abs(top.d))} a month: ${esc(moveReason(top.s.move, moneyK))}.` : ''} Each cell below is one month against the six before it.</p>
    <div class="tools">
      <div class="seg">${[['total', 'Storage and service'], ['storage', 'Storage'], ['service', 'Service']].map(([k, l]) => `<a href="${link(k)}" class="${k === which ? 'on' : ''}">${l}</a>`).join('')}</div>
      <div class="key"><i style="background:color-mix(in srgb, var(--bad) 70%, var(--surface))"></i>down<i style="background:color-mix(in srgb, var(--bad) 25%, var(--surface));margin-left:6px"></i><i style="background:color-mix(in srgb, var(--ink) 5%, var(--surface))"></i>within 10%<i style="background:color-mix(in srgb, var(--good) 25%, var(--surface))"></i><i style="background:color-mix(in srgb, var(--good) 70%, var(--surface));margin-left:6px"></i>up · against its own last six months</div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th class="nmh">Customer</th>${months.slice(first).map((m, j) => `<th class="${j < N - 5 ? 'old' : ''}">${mlab(m, j)}</th>`).join('')}<th class="tt">12 months</th></tr></thead>
        <tbody>${grid.map(g => `<tr>
          <td class="nm"><a href="#customer/${g.s.level1}">${esc(titleCase(g.s.customer))}</a></td>
          ${g.c.map((c, j) => { const sh = shade(c.d); return `<td class="cl ${j < N - 5 ? 'old' : ''}"><span class="${sh.strong ? 'strong' : ''}" style="--tone:${sh.tone};--a:${sh.a}%" title="${esc(titleCase(g.s.customer))}, ${mlab(c.m, 1)}: ${money0(c.v)} against its own ${money0(c.run)}">${moneyK(c.v)}</span></td>`; }).join('')}
          <td class="tt">${moneyK(g.s[which].slice(-12).reduce((t, x) => t + x, 0))}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <p class="foot">Invoice month, posted runs. Storage bills in advance, so a month's storage is that month's boxes; service is the month before's work. Citadel apart. Tap a name for the customer.</p>
  </div>`;
}

// ── Margin: every account, revenue less what it costs to serve, worst first ──────────────────
// The top of the margin drill: account → line of business → its orders → one order's cost build.
// Filters as in v10: thin is 15–50% left, below cost is under 15%. Route-heavy accounts carry
// "under review" while delivery routes are missing from the route volumes.
const MV_CSS = `
.mv2 .lede { font-size: 17px; line-height: 1.45; color: var(--ink-2); margin: 0 0 12px; max-width: 900px; }
.mv2 .tools { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.mv2 .hd, .mv2 .rw { display: grid; grid-template-columns: minmax(0, 1fr) 96px 96px 104px 64px 14px; gap: 14px; align-items: center; }
.mv2 .hd { font-size: 12px; color: var(--ink-3); padding: 0 4px 8px; }
.mv2 .hd span:nth-child(n+2) { text-align: right; }
.mv2 .rw { padding: 10px 4px; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.mv2 .rw:hover { background: var(--well); }
.mv2 .rw .nm { font-weight: 600; line-height: 1.3; }
.mv2 .rw .nm small { display: block; font-weight: 400; font-size: var(--fs-label); color: var(--ink-3); margin-top: 2px; }
.mv2 .rw .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mv2 .rw .lf { font-weight: 600; }
.mv2 .rw .go { color: var(--ink-5); font-size: 20px; }
.mv2 .tot { border-top: 1px solid var(--rule-ink); font-weight: 700; }
@media (max-width: 760px) {
  .mv2 .hd { display: none; }
  .mv2 .rw { grid-template-columns: minmax(0, 1fr) 84px 14px; grid-template-areas: "nm lf go" "nm pc go"; gap: 2px 10px; }
  .mv2 .rw .nm { grid-area: nm; } .mv2 .rw .lf { grid-area: lf; } .mv2 .rw .pc { grid-area: pc; font-size: 12.5px; } .mv2 .rw .go { grid-area: go; }
  .mv2 .rw .rv, .mv2 .rw .cs { display: none; }
}`;

function marginReason(a, m) {
  const top = Object.entries(m.fam).filter(([f, v]) => v.cost > 0).sort((x, y) => y[1].cost - x[1].cost)[0];
  if (!top) return 'no modelled cost: fees and charges only';
  const [f] = top;
  if (f === 'bin') return `${(a.bins || 0).toLocaleString('en-US')} bin services on ${(a.visits || 0).toLocaleString('en-US')} visits`;
  if (f === 'storage') return `${Math.round(a.boxes).toLocaleString('en-US')} boxes stored`;
  if (f === 'movement') return 'deliveries and pickups carry most of the cost';
  if (f === 'handling') return 'retrievals and refiles carry most of the cost';
  if (f === 'itad') return 'ITAD collections carry most of the cost';
  if (f === 'shred') return 'shredding by weight or box carries most of the cost';
  return 'labour carries most of the cost';
}

async function marginView(main, C, params) {
  if (!document.getElementById('mv2-css')) { const st = document.createElement('style'); st.id = 'mv2-css'; st.textContent = MV_CSS; document.head.appendChild(st); }
  const filter = ['thin', 'below'].includes(params.f) ? params.f : 'all';
  const [R, M] = await Promise.all([loadRates(), getJson('margin')]);
  const MS = marginSummary(R, M, [CITADEL]);
  const acct = new Map(M.accounts.map(a => [a.level1, a]));
  const all = MS.accounts.map(m => ({ ...m, why: marginReason(acct.get(m.level1) || {}, m) }));
  const rows = all.filter(r => filter === 'all' || (filter === 'thin' ? r.pc >= 0.15 && r.pc < 0.5 : r.pc < 0.15)).sort((a, b) => a.margin - b.margin);
  const below = MS.below, belowLoss = MS.losers;
  const visitHeavy = below.filter(r => r.review).length;
  const sum = k => rows.reduce((t, r) => t + r[k], 0);
  const link = f => `#customers?view=margin${f !== 'all' ? '&f=' + f : ''}`;
  const shown = params.n === 'all' ? rows.length : 60;

  main.innerHTML = `
  <div class="cust mv2">
    <h1>Customers</h1>
    <div class="bar"><div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="#customers?view=${k}" class="${k === 'margin' ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div></div>
    <p class="lede">${below.length} accounts keep under 15% of what they pay after the cost to serve them ◇, and ${belowLoss.length} of them cost more than they pay, ${moneyK(MS.lossTotal)} a year between them. ${visitHeavy} of the ${below.length} are visit-heavy (bins, deliveries, retrievals), where route costs are still under review; the rest are priced too low for the work.</p>
    <div class="tools"><div class="seg">${[['all', 'All'], ['thin', 'Thin, 15–50%'], ['below', 'Below cost, under 15%']].map(([k, l]) => `<a href="${link(k)}" class="${k === filter ? 'on' : ''}">${l}</a>`).join('')}</div></div>
    <div class="card">
      <div class="hd"><span>Customer</span><span>Revenue</span><span>Cost ◇</span><span>Left</span><span>Margin</span><span></span></div>
      ${rows.slice(0, shown).map(r => `<a class="rw" href="#customer/${r.level1}?from=margin">
        <span class="nm">${esc(titleCase(r.customer))}${r.review ? ' <span class="chip review">under review</span>' : ''}<small>${esc(r.why)}</small></span>
        <span class="r rv">${money0(r.revenue)}</span><span class="r cs">${money0(r.cost)}</span>
        <span class="r lf ${r.margin < 0 && !r.review ? 'is-bad' : ''}">${money0(r.margin)}</span>
        <span class="r pc ${r.pc < 0.15 && !r.review ? 'is-bad' : r.pc < 0.5 && !r.review ? 'is-warn' : ''}">${r.pc == null ? '—' : Math.round(r.pc * 100) + '%'}</span><span class="go">›</span></a>`).join('')}
      <div class="rw tot" style="cursor:default"><span class="nm">${rows.length} accounts</span><span class="r rv">${money0(sum('revenue'))}</span><span class="r cs">${money0(sum('cost'))}</span><span class="r lf">${money0(sum('margin'))}</span><span class="r pc">${sum('revenue') > 0 ? Math.round(sum('margin') / sum('revenue') * 100) + '%' : '—'}</span><span></span></div>
      ${rows.length > shown ? `<a class="more" style="display:inline-block;margin-top:10px;color:var(--brand);font-weight:500;text-decoration:none" href="${link(filter)}&n=all">Show all ${rows.length}</a>` : ''}
    </div>
    <p class="foot">Twelve months. Cost to serve ◇ from the cost model: warehouse space, handling, route time and shred plant; sales, management and overhead sit above this line. Accounts over $1,000 a year. Citadel apart. Tap an account for its lines, then its orders.</p>
  </div>`;
}

// ── Overdue boxes: destruction once against the storage it ends ──────────────────────────────
// Boxes past their retention review (storage_retention status I, from calls.json). Destruction is
// priced at the book's median shredding fee per standard box (R3); the storage each destroyed box
// stops paying is the account's own latest rate per box, else the box-weighted median.
const DV_CSS = `
.dv .lede { font-size: 17px; line-height: 1.45; color: var(--ink-2); margin: 0 0 14px; max-width: 920px; }
.dv .hd, .dv .rw { display: grid; grid-template-columns: minmax(0, 1fr) 110px 120px 130px 100px 14px; gap: 14px; align-items: center; }
.dv .hd { font-size: 12px; color: var(--ink-3); padding: 0 4px 8px; }
.dv .hd span:nth-child(n+2) { text-align: right; }
.dv .rw { padding: 10px 4px; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.dv .rw:hover { background: var(--well); }
.dv .rw .nm { font-weight: 600; line-height: 1.3; }
.dv .rw .nm small { display: block; font-weight: 400; font-size: var(--fs-label); color: var(--ink-3); margin-top: 2px; }
.dv .rw .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dv .rw .go { color: var(--ink-5); font-size: 20px; }
.dv .share { display: block; height: 6px; background: var(--well-2); border-radius: 3px; margin-top: 6px; max-width: 220px; position: relative; overflow: hidden; }
.dv .share i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink-3); border-radius: 3px; }
.dv .tot { border-top: 1px solid var(--rule-ink); font-weight: 700; }
@media (max-width: 760px) {
  .dv .hd { display: none; }
  .dv .rw { grid-template-columns: minmax(0, 1fr) 92px 14px; grid-template-areas: "nm bx go" "nm once go"; gap: 2px 10px; }
  .dv .rw .nm { grid-area: nm; } .dv .rw .bx { grid-area: bx; } .dv .rw .once { grid-area: once; font-size: 12.5px; color: var(--ink-3); } .dv .rw .go { grid-area: go; }
  .dv .rw .lost, .dv .rw .mo { display: none; }
}`;

async function destructionView(main, C, params) {
  if (!document.getElementById('dv-css')) { const st = document.createElement('style'); st.id = 'dv-css'; st.textContent = DV_CSS; document.head.appendChild(st); }
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
    <h1>Customers</h1>
    <div class="bar"><div class="views"><div class="seg">${Object.entries(VIEWS).map(([k, v]) => `<a href="#customers?view=${k}" class="${k === 'destruction' ? 'on' : ''}">${esc(v.label)}</a>`).join('')}</div></div></div>
    <p class="lede">${Math.round(T('boxes')).toLocaleString('en-US')} boxes across ${rows.length} accounts are past their retention review. Destroying them would bill about <b>${moneyK(T('once'))} once</b>, at the book's median $${perBox.toFixed(2)} a box, and end about <b>${moneyK(T('lost'))} a month</b> of storage. At the median storage rate one destruction equals ${Math.round(medMonths)} months of storage, so the strongest cases are the accounts paying least to store${top ? `, starting with ${esc(titleCase(top.customer))}: ${Math.round(top.boxes).toLocaleString('en-US')} overdue boxes at $${top.rate.toFixed(3)} a box` : ''}.</p>
    <div class="card">
      <div class="hd"><span>Customer</span><span>Overdue boxes</span><span>Destruction, once</span><span>Storage it ends, a month</span><span>Months it equals</span><span></span></div>
      ${rows.slice(0, shown).map(r => `<a class="rw" href="#customer/${r.level1}">
        <span class="nm">${esc(titleCase(r.customer))}<small>${r.total ? `${Math.round(r.boxes / Math.max(r.boxes, r.total) * 100)}% of ${Math.round(r.total).toLocaleString('en-US')} boxes stored · ` : ''}$${r.rate.toFixed(3)} a box${r.own ? '' : ' (book median)'}</small>${r.total ? `<span class="share"><i style="width:${Math.min(100, r.boxes / r.total * 100)}%"></i></span>` : ''}</span>
        <span class="r bx">${Math.round(r.boxes).toLocaleString('en-US')}</span>
        <span class="r once">${moneyK(r.once)}<span class="sub" style="display:none"> once</span></span>
        <span class="r lost">−${moneyK(r.lost)}</span>
        <span class="r mo">${r.months == null ? '—' : Math.round(r.months)}</span><span class="go">›</span></a>`).join('')}
      <div class="rw tot" style="cursor:default"><span class="nm">${rows.length} accounts</span><span class="r bx">${Math.round(T('boxes')).toLocaleString('en-US')}</span><span class="r once">${moneyK(T('once'))}</span><span class="r lost">−${moneyK(T('lost'))}</span><span class="r mo">${Math.round(T('once') / T('lost'))}</span><span></span></div>
      ${rows.length > shown ? `<a style="display:inline-block;margin-top:10px;color:var(--brand);font-weight:500;text-decoration:none" href="#customers?view=destruction&n=all">Show all ${rows.length}</a>` : ''}
    </div>
    <p class="foot">Overdue: storage_retention status I with a review date passed. Destruction at the median R3 shredding fee per standard box; storage at the account's latest rate per box (storage_rate_hist), else the box-weighted median. Destruction needs the client's sign-off on the retention list. Citadel apart.</p>
  </div>`;
}
