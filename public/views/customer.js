// One customer: the page every list and every number opens. Desktop first, restacks on a phone.
// Header figures · 24-month storage and service on one axis · margin by line of business, each line
// opening to its priced lines · prices against the book's median and what moving is worth · signals.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { buildMargins, accountCosts, jobCost, FAMILY_NAMES } from '/components/margin.js';
import { buildWhitespace, LINES } from '/components/whitespace.js';
import { openExplainer } from '/components/explain.js';
import { ledgerTable } from '/components/table.js';
import { getJson, loadRates, titleCase, esc, getLog, postLog } from '/components/data.js';
import { seriesOf, deltaText, moveReason } from '/components/series.js';
import { slippingAccounts, unitSuspect } from '/components/levers.js';

const CITADEL = 6714;
const UNDER_REVIEW = new Set(['bin', 'handling', 'movement']);

const CSS = `
.cp .crumb { margin-bottom: 10px; }
.cp h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0; line-height: 1.1; }
.cp .cp-lede { font-size: 17px; line-height: 1.5; color: var(--ink-2); margin: 0 0 16px; max-width: 920px; }
.cp .tags { margin: 8px 0 12px; display: flex; gap: 6px; flex-wrap: wrap; }
.cp .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
.cp .stat .lab { margin-bottom: 4px; }
.cp .grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; margin-top: 14px; align-items: start; }
.cp .fam { display: grid; grid-template-columns: minmax(0, 1fr) 96px 96px 64px 12px; gap: 12px; align-items: center; padding: 11px 0; border-top: 1px solid var(--rule); cursor: pointer; }
.cp .fam:first-of-type { border-top: 0; }
.cp .fam .r { text-align: right; font-variant-numeric: tabular-nums; }
.cp .fam .go { color: var(--ink-5); }
.cp .fam.open { background: var(--well); }
.cp .famhead { display: grid; grid-template-columns: minmax(0, 1fr) 96px 96px 64px 12px; gap: 12px; font-size: 12px; color: var(--ink-3); padding-bottom: 6px; }
.cp .famhead span:nth-child(n+2) { text-align: right; }
.cp .lines { padding: 4px 0 12px; }
.cp .price { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 11px 0; border-top: 1px solid var(--rule); }
.cp .price:first-of-type { border-top: 0; }
.cp .price .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
.cp .price .pos { grid-column: 1 / -1; height: 6px; background: var(--well-2); border-radius: 3px; position: relative; margin-top: 4px; }
.cp .price .pos i { position: absolute; top: -3px; width: 4px; height: 12px; border-radius: 2px; background: var(--ink); transform: translateX(-2px); }
.cp .price .pos b { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--ink-4); }
.cp .sig { padding: 11px 0; border-top: 1px solid var(--rule); }
.cp .sig:first-of-type { border-top: 0; }
.cp .sig .acts { margin-top: 6px; display: flex; gap: 8px; }
.cp .sig .acts { align-items: center; flex-wrap: wrap; }
.cp .sig .acts button { border: 1px solid var(--rule-3); background: var(--surface); border-radius: 8px; padding: 4px 12px; font-size: 13px; color: var(--ink-2); cursor: pointer; }
.cp .sig .acts button.on { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.cp .ws1 { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0 2px; border-top: 1px solid var(--rule); }
.cp .ws1:first-of-type { border-top: 0; }
.cp .ws1 .opp { border: 1.5px dashed var(--ink-5); border-radius: 6px; padding: 1px 8px; font-weight: 600; background: none; font: inherit; color: inherit; cursor: pointer; }
.cp .ws1 .opp:hover { border-color: var(--brand); color: var(--brand); }
.cp .ws1b { padding: 0 0 8px; }
.cp .ob { padding: 6px 4px 10px; }
.cp .lp-crumb { font-size: 12px; color: var(--ink-3); padding: 4px 0 2px; }
.cp .lines { padding: 4px 8px 14px; }
.cp .ob-bars { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 6px 12px; align-items: center; }
.cp .ob-bar { height: 14px; display: flex; gap: 2px; }
.cp .ob-bar i { display: block; height: 100%; border-radius: 3px; }
.cp .ob-bar i.rev, .cp i.dot.rev { background: var(--ink); }
.cp .c0 { background: var(--s-storage); } .cp .c1 { background: var(--s-service); } .cp .c2 { background: var(--ink-4); } .cp .c3 { background: var(--s-citadel); }
.cp i.dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
.cp .ob-say { margin: 12px 0; font-size: 14px; line-height: 1.45; color: var(--ink-2); }
.cp .ob-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.cp .ob-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13.5px; }
.cp details.ob-row { display: block; }
.cp details.ob-row summary { display: flex; justify-content: space-between; gap: 12px; cursor: pointer; list-style: none; }
.cp details.ob-row summary::-webkit-details-marker { display: none; }
.cp details.ob-row p { margin: 2px 0 6px 14px; }
@media (max-width: 860px) {
  .cp .ob-cols { grid-template-columns: 1fr; }
  .cp h1 { font-size: 26px; }
  .cp .stats { grid-template-columns: 1fr 1fr; }
  .cp .grid { grid-template-columns: 1fr; }
  .cp .fam, .cp .famhead { grid-template-columns: minmax(0, 1fr) 84px 52px 12px; }
  .cp .fam .cost, .cp .famhead .cost { display: none; }
}`;

function injectCss() {
  if (document.getElementById('cp-css')) return;
  const s = document.createElement('style'); s.id = 'cp-css'; s.textContent = CSS; document.head.appendChild(s);
}

export async function render(main, C, params) {
  if (!main) return;
  injectCss();
  const id = Number(params.id);
  const [R, M, PR, CA, log] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing'), getJson('calls'), getLog(Number(params.id)).catch(() => [])]);
  const s = seriesOf(C).get(id);
  const book = buildMargins(R, M, {});
  const m = book.accounts.find(a => a.level1 === id);
  const acct = M.accounts.find(a => a.level1 === id);
  const name = titleCase((s && s.customer) || (m && m.customer) || `Account ${id}`);
  const signals = CA.find(c => c.level1 === id);
  const wsRow = buildWhitespace(M, { exclude: [CITADEL], top: 100000 }).rows.find(x => x.level1 === id);

  // an account with nothing billed in twelve months gets one honest line, not a page of blanks
  const billed = (s ? s.total.some(v => v !== 0) : false) || (m ? m.revenue !== 0 || m.cost !== 0 : false);
  if (!billed) { main.innerHTML = `<div class="crumb"><a href="#customers">Customers</a><span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div><div class="empty"><h2>${esc(name)}: nothing billed recently</h2>No storage, service or priced lines on its account in the last twelve months. If it is a live customer, its work is billed under another account number.</div>`; return; }

  const ltm = s ? s.ltm : m.revenue;
  const pc = m && m.revenue > 0 ? m.margin / m.revenue : null;
  const routeHeavy = m && [...UNDER_REVIEW].some(f => m.fam[f] && m.fam[f].cost > 0.25 * m.cost);
  const slipping = s && s.move && slippingAccounts(C).some(x => x.level1 === id);

  // the account in a few sentences, in place of a row of figure tiles
  const share = k => s ? Math.round(s[k].slice(-12).reduce((t, v) => t + v, 0) / Math.max(1, s.ltm) * 100) : null;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const lede = [];
  lede.push(`<b>${moneyK(ltm)}</b> billed in the last twelve months${s ? `, ${share('storage')}% storage and ${share('service')}% service` : ''}.`);
  if (s && s.move) lede.push(`Over the last three months it ran at ${moneyK(s.move.last3)} a month against its own ${moneyK(s.move.run)} before${Math.abs(s.move.pct || 0) >= 0.05 ? `: ${moveReason(s.move, moneyK)}` : ', about level'}.`);
  if (m && m.cost > 0) lede.push(`About ${moneyK(m.cost)} a year to serve ◇ ${m.margin >= 0 ? `leaves ${moneyK(m.margin)}${pc != null ? ` (${Math.round(pc * 100)}%)` : ''}` : `is ${moneyK(-m.margin)} more than it pays`}${routeHeavy ? ', with route costs under review' : ''}.`);
  if (acct && (acct.boxes >= 1 || acct.bins)) lede.push([acct.boxes >= 1 ? `It stores ${n0(acct.boxes)} boxes` : '', acct.bins ? `${acct.boxes >= 1 ? 'and had' : 'It had'} ${n0(acct.bins)} bin services on ${n0(acct.visits)} visits` : ''].filter(Boolean).join(' ') + '.');
  if (id === CITADEL) lede.push('Citadel\'s settlements land in lumps, so it is held apart from core.');
  const summary = lede.join(' ');

  // prices: this account's rates against the book's median for each service, and what moving is worth
  const byCode = new Map();
  for (const r of PR.rates) { if (r.modal_rate > 0 && r.units > 0) { (byCode.get(r.servcode) || byCode.set(r.servcode, []).get(r.servcode)).push(r.modal_rate); } }
  for (const v of byCode.values()) v.sort((a, b) => a - b);
  const mine = PR.rates.filter(r => r.level1 === id && r.modal_rate > 0 && r.units > 0 && (byCode.get(r.servcode) || []).length >= 10)
    .map(r => {
      const all = byCode.get(r.servcode), med = all[Math.floor(all.length / 2)];
      const p10 = all[Math.floor(all.length * .05)], p90 = all[Math.floor(all.length * .95)];
      const below = all.filter(v => v < r.modal_rate).length / all.length;
      return { ...r, med, p10, p90, below, suspect: unitSuspect(r.modal_rate, med), worth: (med - r.modal_rate) * r.units };
    })
    .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const sigs = [];
  if (signals) {
    if (slipping) sigs.push({ key: 'slipping', text: `Slipping: ${moneyK(s.move.last3)} a month over the last three months against its own ${moneyK(s.move.run)} before (${moveReason(s.move, moneyK)}).` });
    if (signals.up_20pct) sigs.push({ key: 'up', text: `Up ${Math.round(signals.deviation_pct)}% on its own six-month level last month.` });
    if (signals.not_raised_2y) sigs.push({ key: 'rounds', text: `No rate has moved in two years across ${signals.codes} services.` });
    if (signals.storage_no_destruction) sigs.push({ key: 'nodestroy', text: 'Stores with R4 but buys no destruction: shredding is a natural next conversation.' });
    if (signals.destruction_no_storage) sigs.push({ key: 'nostorage', text: 'Buys destruction but stores nothing with R4.' });
    if (signals.boxes_review_overdue > 0) sigs.push({ key: 'overdue', text: `${Math.round(signals.boxes_review_overdue).toLocaleString('en-US')} boxes are past their retention review: a destruction conversation.` });
  }
  const said = new Map(log.filter(l => l.kind === 'signal').map(l => [l.signal, l]));
  const VERB = { right: 'right', not_right: 'not right', called: 'called', emailed: 'emailed', not_this_week: 'not this week' };
  const when = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const fams = m ? Object.entries(m.fam).map(([f, v]) => ({ f, ...v })).filter(x => x.revenue !== 0 || x.cost !== 0).sort((a, b) => b.revenue - a.revenue) : [];
  const svcName = new Map(PR.rates.map(r => [r.servcode, r.service]));

  main.innerHTML = `
  <div class="cp">
    <div class="crumb">${params.from === 'margin' ? '<a href="#customers?view=margin">Margin</a>' : '<a href="#customers">Customers</a>'}<span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div>
    <h1>${esc(name)}</h1>
    <div class="tags">
      ${id === CITADEL ? '<span class="chip">Held apart from core · settlements land in lumps</span>' : ''}
      ${slipping ? `<span class="chip bad">Slipping: ${deltaText(s.move.pct)} on its own run</span>` : ''}
      ${signals && signals.not_raised_2y ? '<span class="chip warn">Missed every rate round</span>' : ''}
      ${routeHeavy ? '<span class="chip review">Route costs under review</span>' : ''}
    </div>
    <p class="cp-lede">${summary}</p>
    <div class="card" id="cp-chart"></div>
    <div class="grid">
      <div class="card">
        <div class="card-head"><h3>Margin by line of business</h3><small>tap a line for its detail</small></div>
        ${fams.length ? `<div class="famhead"><span>Line</span><span>Revenue</span><span class="cost">Cost ◇</span><span>Margin</span><span></span></div>` : ''}
        <div id="cp-fams">${fams.map(x => {
          const p = x.revenue > 0 ? 1 - x.cost / x.revenue : null, rev = UNDER_REVIEW.has(x.f);
          return `<div class="fam" data-f="${x.f}"><span>${esc(FAMILY_NAMES[x.f] || x.f)}${rev ? ' <span class="chip review">under review</span>' : ''}</span><span class="r">${money0(x.revenue)}</span><span class="r cost">${x.f === 'other' ? '—' : money0(x.cost)}</span><span class="r ${p != null && p < 0 && !rev ? 'is-bad' : ''}">${x.f === 'other' || p == null ? '—' : rev ? '◇' : Math.round(p * 100) + '%'}</span><span class="go">›</span></div><div class="lines" data-for="${x.f}" hidden></div>`;
        }).join('') || '<p class="sub">No priced lines in the last twelve months.</p>'}</div>
      </div>
      <div class="stack">
        ${wsCard(wsRow)}
        <div class="card">
          <div class="card-head"><h3>Prices against the book</h3><a href="#pricing?level1=${id}">Price it ›</a></div>
          ${mine.map(r => `<div class="price">
            <span><a href="#pricing?level1=${id}&code=${encodeURIComponent(r.servcode)}" style="color:inherit;text-decoration:none"><b>${esc(titleCase(r.service))}</b> <span style="color:var(--brand)">›</span></a><span class="sub" style="display:block">$${r.modal_rate.toFixed(2)} · book median $${r.med.toFixed(2)} · ${r.suspect ? 'so far apart it is probably billed in another unit: check before quoting' : r.modal_rate < r.med ? `cheaper than ${Math.round((1 - r.below) * 100)}% of accounts` : `dearer than ${Math.round(r.below * 100)}% of accounts`}</span></span>
            <span class="v">${r.suspect ? '<span class="chip warn">check the unit</span>' : r.worth > 0 ? `+${moneyK(r.worth)} a year<span class="sub" style="display:block;font-weight:400">at the median</span>` : '<span class="sub">at or above</span>'}</span>
            <div class="pos"><b style="left:${pos(r.med, r)}%"></b><i style="left:${pos(r.modal_rate, r)}%"></i></div>
          </div>`).join('') || '<p class="sub">No service rates in the last thirteen months.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h3>Signals</h3><small>right or not? say so</small></div>
          <div id="cp-sigs">${sigs.map(g => { const l = said.get(g.key); return `<div class="sig" data-sig="${g.key}">${esc(g.text)}<div class="acts"><button data-v="right" class="${l && l.verdict === 'right' ? 'on' : ''}">Right</button><button data-v="not_right" class="${l && l.verdict === 'not_right' ? 'on' : ''}">Not right</button><span class="sub said">${l ? `${esc(l.who)} said ${VERB[l.verdict]}, ${when(l.logged_at)}` : ''}</span></div></div>`; }).join('') || '<p class="sub">Nothing flagged this week.</p>'}</div>
          ${log.length ? `<div class="aside" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--rule)"><div class="lab" style="margin-bottom:4px">Logged</div>${log.slice(0, 5).map(l => `<div class="sub">${when(l.logged_at)} · ${esc(l.who)} · ${VERB[l.verdict]} (${esc(l.signal)})</div>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="grid drill" id="cp-drill"><div class="card"><div class="card-head"><h3>Work orders</h3><small>last six months</small></div><p class="sub">Loading…</p></div><div class="card"><div class="card-head"><h3>Visits</h3><small>last six months</small></div><p class="sub">Loading…</p></div></div>
  </div>`;

  if (s) {
    const pts = k => s.months.map((x, i) => ({ x, y: s[k][i] }));
    lineChart(main.querySelector('#cp-chart'), {
      title: 'Revenue by month', sub: `${s.months.length} months to the latest posted month · invoice month · one axis`,
      series: [{ name: 'Storage', cls: 'storage', points: pts('storage') }, { name: 'Service', cls: 'service', points: pts('service') }],
      source: 'VCK invoices, posted runs · storage ret_tot, service ser_tot',
    });
  } else main.querySelector('#cp-chart').remove();

  const wsBox = main.querySelector('.ws1') && main.querySelector('.ws1').closest('.card');
  if (wsBox && wsRow) wsBox.addEventListener('click', ev => { const b = ev.target.closest('button.opp'); if (b) openExplainer({ row: wsRow, key: b.dataset.key, call: signals, H: M.history, names: new Map(M.accounts.map(a => [a.level1, a.customer])) }); });
  const drillP = loadDrill(id, R, M);
  drawDrill(main.querySelector('#cp-drill'), drillP, svcName);

  // right or not right on a signal: logged, and the buttons show what was said
  const sigBox = main.querySelector('#cp-sigs');
  if (sigBox) sigBox.addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-v]'); if (!b) return;
    const row = b.closest('.sig');
    row.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      const saved = await postLog({ level1: id, kind: 'signal', signal: row.dataset.sig, verdict: b.dataset.v });
      row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      row.querySelector('.said').textContent = `${saved.who} said ${VERB[saved.verdict]}, just now`;
    } catch (e) { row.querySelector('.said').textContent = e.message; }
    row.querySelectorAll('button').forEach(x => x.disabled = false);
  });

  // a line of business opens in place to its priced lines
  main.querySelector('#cp-fams').addEventListener('click', async ev => {
    const row = ev.target.closest('.fam'); if (!row) return;
    const box = main.querySelector(`.lines[data-for="${row.dataset.f}"]`);
    const open = !box.hidden;
    main.querySelectorAll('.lines').forEach(b => { b.hidden = true; b.innerHTML = ''; });
    main.querySelectorAll('.fam').forEach(f => f.classList.remove('open'));
    if (open) return;
    row.classList.add('open'); box.hidden = false;
    const fam = row.dataset.f, famName = FAMILY_NAMES[fam] || fam;
    const ls = M.lines.filter(l => l.level1 === id && ((l.family && l.family !== 'none' ? l.family : 'other') === fam))
      .sort((a, b) => b.revenue - a.revenue);
    // 1. how this line's cost is worked out, from the same results the margin is built from
    const costs = acct ? (accountCosts(R, acct, M.lines.filter(l => l.level1 === id))[fam] || []) : [];
    const working = costs.flatMap(c => c.lines);
    box.innerHTML = `
      <div class="lp-crumb">${esc(name)} › ${esc(famName)}</div>
      <div class="lab" style="margin:8px 0 4px">How the cost is worked out ◇</div>
      <div class="lp-cost">${working.length ? working.map(l => `<details class="ob-row"><summary><span>${esc(l[0])}${l[3] ? ' ◇' : ''}</span><span class="num">${money0(l[1])}</span></summary><p class="sub">${esc(l[2])}</p></details>`).join('') + `<div class="ob-row" style="border-top:1px solid var(--rule-ink);margin-top:4px;padding-top:6px;font-weight:600"><span>A year</span><span class="num">${money0(working.reduce((t, l) => t + l[1], 0))}</span></div>` : '<p class="sub">No modelled cost on this line: fees and charges with no volume behind them.</p>'}</div>
      ${fam === 'storage' ? '' : '<div class="lab" style="margin:14px 0 4px">On the invoices, twelve months</div><div class="lp-lines"></div>'}
      ${fam === 'storage' ? '' : '<div class="lab" style="margin:14px 0 4px">Its orders, last six months</div><div class="lp-orders"><p class="sub">Loading…</p></div>'}`;
    if (fam === 'storage') return;
    ledgerTable(box.querySelector('.lp-lines'), { columns: [
      { key: 'servcode', label: 'Service', fmt: (v) => esc(titleCase(svcName.get(v.replace(/^S5[BPT]$/, 'S5')) || v)) + ` <span class="sub" style="display:inline">${esc(v)}</span>` },
      { key: 'units', label: 'Units', num: true, fmt: (v, r) => Math.round(v).toLocaleString('en-US') + ' ' + (r.unit || '') },
      { key: 'revenue', label: 'Revenue', num: true, fmt: v => money0(v) },
    ], rows: ls });
    // 3. this line's own work orders, each opening to its cost build
    const { d, error, meta } = await drillP;
    const ob = box.querySelector('.lp-orders');
    if (!ob || !ob.isConnected) return;
    if (error) { ob.innerHTML = `<div class="pending">${esc(error)}</div>`; return; }
    const mine = d.orders.filter(o => o.items.some(i => { const f = (meta.get(i.code) || {}).family; return (f && f !== 'none' ? f : 'other') === fam || (fam === 'bin' && /^B\d$/.test(i.code)); }));
    if (!mine.length) { ob.innerHTML = '<p class="sub">No orders on this line in the last six months.</p>'; return; }
    const lost = mine.filter(o => o.cost.total && o.margin < 0).length;
    ob.insertAdjacentHTML('beforebegin', `<p class="sub" style="margin:0 0 6px">${mine.length}${mine.length >= 200 ? '+' : ''} orders; ${lost} cost more to serve than they billed ◇.</p>`);
    ordersTable(ob, mine.slice(0, 12), svcName, name, famName);
    if (mine.length > 12) {
      const b = document.createElement('button');
      b.className = 'linkbtn'; b.textContent = `Show ${Math.min(mine.length, 60)} orders`;
      b.style.cssText = 'margin-top:8px;border:0;background:none;color:var(--brand);font:inherit;font-size:13px;font-weight:500;cursor:pointer;padding:4px 0';
      b.onclick = () => { ordersTable(ob, mine.slice(0, 60), svcName, name, famName); b.remove(); };
      ob.after(b);
    }
  });
}

// One fetch per customer page: the orders and visits, with each order's cost worked out once.
async function loadDrill(id, R, M) {
  const meta = new Map();
  for (const l of M.lines) if (l.level1 === id || !meta.has(l.servcode)) meta.set(l.servcode, { family: l.family, unit: l.unit, drives_cost: l.drives_cost });
  try {
    const r = await fetch(`/api/customer/${id}`, { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    const d = j.data;
    // a visit shared between the account's route orders on the same day
    const routeish = o => o.items.some(i => ['bin', 'movement', 'itad'].includes((meta.get(i.code) || {}).family));
    const perDay = new Map();
    for (const o of d.orders) if (routeish(o)) perDay.set(o.date, (perDay.get(o.date) || 0) + 1);
    for (const o of d.orders) { o.cost = jobCost(R, o.items, meta, perDay.get(o.date) || 1); o.margin = o.revenue - o.cost.total; }
    return { d, meta };
  } catch (e) { return { error: e.message, meta }; }
}

const dayFmt = t => new Date(t + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
const n0 = v => Math.round(v || 0).toLocaleString('en-US');
function ordersTable(el, rows, svcName, name, famName) {
  ledgerTable(el, {
    columns: [
      { key: 'date', label: 'Date', fmt: v => dayFmt(v) },
      { key: 'woid', label: 'Order', fmt: v => `<span class="sub" style="display:inline">${esc(v)}</span>` },
      { key: 'revenue', label: 'Value', num: true, fmt: v => money0(v) },
      { key: 'cost', label: 'Cost ◇', num: true, fmt: v => v.total ? money0(v.total) : '—' },
      { key: 'margin', label: 'Left', num: true, fmt: (v, r) => r.cost.total ? `<span class="${v < 0 ? (r.cost.route ? 'is-warn' : 'is-bad') : ''}">${money0(v)}</span>` : '—' },
    ],
    rows,
    detail: (o, td) => { td.innerHTML = `${famName ? `<div class="lp-crumb">${esc(name)} › ${esc(famName)} › order ${esc(o.woid)}, ${dayFmt(o.date)}</div>` : ''}${orderBuild(o, svcName, n0)}`; },
  });
}

// Below the page: the account's work orders (what was billed, order by order) and its Veri-Shred
// visits (one row per day and route). Per account, so fetched here rather than in the snapshot.
async function drawDrill(el, drillP, svcName) {
  if (!el) return;
  const { d, error } = await drillP;
  if (error) {
    el.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-head"><h3>Work orders and visits</h3></div><div class="pending">${esc(error)}</div></div>`;
    return;
  }
  if (!el.isConnected) return;
  const day = t => new Date(t + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const ordRev = d.orders.reduce((t, o) => t + o.revenue, 0);
  const lbs = d.visits.reduce((t, v) => t + (v.pounds || 0), 0);
  el.innerHTML = `
    <div class="card"><div class="card-head"><h3>Work orders</h3><small>${d.orders.length ? `${n0(d.orders.length)}${d.orders.length >= 200 ? '+' : ''} in six months · ${money0(ordRev)}` : 'last six months'}</small></div><div id="cp-orders"></div><div class="pending" style="margin-top:12px">Box by box: not in the database yet. Lines carry a count of boxes; the barcodes are in VCK's work-order detail, which is not in the daily push.</div><div class="src">VCK priced lines by work order · cost ◇ from the cost model, one visit shared between the day's orders · tap an order for its cost build</div></div>
    <div class="card"><div class="card-head"><h3>Visits</h3><small>${d.visits.length ? `${n0(d.visits.length)} route-days · ${n0(lbs)} lb weighed` : 'last six months'}</small></div><div id="cp-visits"></div><div class="src">Veri-Shred done orders · one row per day and route · executive-bin pounds are a default, not a weigh</div></div>`;
  const oBox = el.querySelector('#cp-orders'), vBox = el.querySelector('#cp-visits');
  // the latest twelve of each, with the rest one tap away
  const more = (box, total, draw) => {
    if (total <= 12) return draw(total);
    draw(12);
    const b = document.createElement('button');
    b.className = 'linkbtn'; b.textContent = total > 60 ? "Show the latest 60" : `Show all ${total}`;
    b.style.cssText = 'margin-top:8px;border:0;background:none;color:var(--brand);font:inherit;font-size:13px;font-weight:500;cursor:pointer;padding:4px 0';
    b.onclick = () => { draw(Math.min(total, 60)); b.remove(); };
    box.after(b);
  };
  if (d.orders.length) more(oBox, d.orders.length, n => ordersTable(oBox, d.orders.slice(0, n), svcName));
  else oBox.innerHTML = '<p class="sub">No billed work orders in the last six months.</p>';
  if (d.visits.length) more(vBox, d.visits.length, n => ledgerTable(vBox, {
    columns: [
      { key: 'date', label: 'Date', fmt: v => v ? day(v) : '—' },
      { key: 'route', label: 'Route', fmt: (v, r) => `${esc(v || '—')}${r.driver ? ` <span class="sub" style="display:inline">${esc(r.driver)}</span>` : ''}` },
      { key: 'services', label: 'Services', num: true, fmt: (v, r) => `${n0(v)}${r.stops > 1 ? ` <span class="sub" style="display:inline">${r.stops} stops</span>` : ''}` },
      { key: 'pounds', label: 'Pounds', num: true, fmt: v => v ? n0(v) : '—' },
    ],
    rows: d.visits.slice(0, n),
  }));
  else vBox.innerHTML = '<p class="sub">No done Veri-Shred orders in the last six months: this account\'s work is storage or warehouse handling.</p>';
}

// One order opened: what was billed, what it cost to serve and how each cost is worked out.
function orderBuild(o, svcName, n0) {
  const c = o.cost, rev = Math.max(o.revenue, 0), total = Math.max(rev, c.total, 1);
  const seg = (v, cls, label) => v > 0 ? `<i class="${cls}" style="width:${v / total * 100}%" title="${esc(label)} ${money0(v)}"></i>` : '';
  const items = o.items.map(i => `<div class="ob-row"><span>${esc(titleCase(svcName.get(String(i.code).replace(/^S5[BPT]$/, 'S5')) || i.code))} <span class="sub" style="display:inline">${esc(i.code)} · ${n0(i.units)}</span></span><span class="num">${money0(i.revenue)}</span></div>`).join('');
  const verdict = !c.total ? 'Nothing on this order carries a modelled cost: fees and charges with no volume behind them.'
    : o.margin >= 0 ? `Billed ${money0(o.revenue)} against about ${money0(c.total)} to serve, leaving ${money0(o.margin)}.`
    : `Billed ${money0(o.revenue)} against about ${money0(c.total)} to serve, ${money0(-o.margin)} short.${c.route ? ' Most of the cost is the visit, and route costs are under review while delivery routes are missing from the route volumes, so read this as a flag, not a verdict.' : ''}`;
  return `<div class="ob">
    <div class="ob-bars"><div class="lab">Billed</div><div class="ob-bar">${seg(rev, 'rev', 'billed')}</div>
      <div class="lab">Cost to serve ◇</div><div class="ob-bar">${c.lines.map((l, k) => seg(l[1], 'c' + (k % 4), l[0])).join('')}</div></div>
    <p class="ob-say">${esc(verdict)}</p>
    <div class="ob-cols"><div><div class="lab">On the invoice</div>${items}</div>
      <div><div class="lab">How the cost is worked out ◇</div>${c.lines.map((l, k) => `<details class="ob-row"><summary><span><i class="dot c${k % 4}"></i>${esc(l[0])}${l[3] ? ' ◇' : ''}</span><span class="num">${money0(l[1])}</span></summary><p class="sub">${esc(l[2])}</p></details>`).join('') || '<p class="sub">No modelled cost.</p>'}</div></div>
  </div>`;
}

// What the account doesn't buy yet, sized at what comparable accounts spend (components/whitespace.js).
function wsCard(r) {
  if (!r) return '';
  const lines = LINES.map(x => ({ x, c: r.cells[x.key] }));
  const missing = lines.filter(o => !o.c.have && o.c.opp > 0).sort((a, b) => b.c.opp - a.c.opp);
  return `<div class="card">
    <div class="card-head"><h3>${missing.length ? `Not bought yet: about ${moneyK(r.opp)} a year ◇` : lines.every(o => o.c.have) ? 'Buys every line we sell' : 'Not bought yet: too small to size'}</h3><a href="#customers?view=whitespace">Cross-sell ›</a></div>
    ${!missing.length && !lines.every(o => o.c.have) ? '<p class="sub" style="margin:0 0 6px">It doesn\'t buy every line, but it has too few boxes or too little other spend to size what comparable accounts would spend.</p>' : ''}
    ${lines.map(({ x, c }) => `<div class="ws1"><span>${esc(x.name)}</span>${c.have ? `<span class="num">${moneyK(c.spend)} <span class="sub" style="display:inline">a year</span></span>` : c.opp > 0 ? `<button class="num opp" data-key="${x.key}" title="How this was worked out">+${moneyK(c.opp)} ◇</button>` : '<span class="sub">—</span>'}</div>${!c.have && c.opp > 0 ? `<div class="sub ws1b">${esc(c.basis)}</div>` : ''}`).join('')}
  </div>`;
}

function pos(v, r) {
  const lo = Math.min(r.p10, r.modal_rate), hi = Math.max(r.p90, r.modal_rate, r.med * 1.01);
  return Math.max(1, Math.min(99, (v - lo) / (hi - lo) * 100));
}
