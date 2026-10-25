// One customer: the page every list and every number opens. Desktop first, restacks on a phone.
// Header figures · 24-month storage and service on one axis · margin by line of business, each line
// opening to its priced lines · prices against the book's median and what moving is worth · signals.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { buildMargins, FAMILY_NAMES } from '/components/margin.js';
import { ledgerTable } from '/components/table.js';
import { getJson, loadRates, titleCase, esc, getLog, postLog } from '/components/data.js';
import { seriesOf, deltaText } from '/views/customers.js';

const CITADEL = 6714;
const UNDER_REVIEW = new Set(['bin', 'handling', 'movement']);

const CSS = `
.cp .crumb { margin-bottom: 10px; }
.cp h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0; line-height: 1.1; }
.cp .tags { margin: 8px 0 18px; display: flex; gap: 6px; flex-wrap: wrap; }
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
@media (max-width: 860px) {
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

  if (!s && !m) { main.innerHTML = `<div class="empty"><h2>No figures for this account</h2>It has no revenue or lines in the last twelve months.</div>`; return; }

  const ltm = s ? s.ltm : m.revenue;
  const pc = m && m.revenue > 0 ? m.margin / m.revenue : null;
  const routeHeavy = m && [...UNDER_REVIEW].some(f => m.fam[f] && m.fam[f].cost > 0.25 * m.cost);

  // prices: this account's rates against the book's median for each service, and what moving is worth
  const byCode = new Map();
  for (const r of PR.rates) { if (r.modal_rate > 0 && r.units > 0) { (byCode.get(r.servcode) || byCode.set(r.servcode, []).get(r.servcode)).push(r.modal_rate); } }
  for (const v of byCode.values()) v.sort((a, b) => a - b);
  const mine = PR.rates.filter(r => r.level1 === id && r.modal_rate > 0 && r.units > 0 && (byCode.get(r.servcode) || []).length >= 10)
    .map(r => {
      const all = byCode.get(r.servcode), med = all[Math.floor(all.length / 2)];
      const p10 = all[Math.floor(all.length * .05)], p90 = all[Math.floor(all.length * .95)];
      const below = all.filter(v => v < r.modal_rate).length / all.length;
      return { ...r, med, p10, p90, below, worth: (med - r.modal_rate) * r.units / 12 };
    })
    .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const sigs = [];
  if (signals) {
    if (signals.down_two_months) sigs.push({ key: 'slipping', text: `Below its own six-month level for a second month: ${money0(signals.month_revenue)} against ${money0(signals.trailing6_mean)}.` });
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
    <div class="crumb"><a href="#customers">Customers</a><span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div>
    <h1>${esc(name)}</h1>
    <div class="tags">
      ${id === CITADEL ? '<span class="chip">Held apart from core · settlements land in lumps</span>' : ''}
      ${s && s.change != null && s.change < -0.1 ? `<span class="chip bad">Down ${Math.abs(Math.round(s.change * 100))}% on the year before</span>` : ''}
      ${signals && signals.not_raised_2y ? '<span class="chip warn">Missed every rate round</span>' : ''}
      ${routeHeavy ? '<span class="chip review">Route costs under review</span>' : ''}
    </div>
    <div class="stats">
      <div class="card stat"><div class="lab">Last 12 months</div><div class="big">${moneyK(ltm)}</div><div class="sub">${s ? `<span class="delta ${s.change > .02 ? 'up' : s.change < -.02 ? 'down' : 'flat'}">${deltaText(s.change)}</span> on the year before` : ''}</div></div>
      <div class="card stat"><div class="lab">Gross margin</div><div class="big ${pc != null && pc < 0 ? 'is-bad' : ''}">${pc == null ? '—' : Math.round(pc * 100) + '%'}<span style="font-size:15px;color:var(--ink-5)"> ◇</span></div><div class="sub">${m ? `${moneyK(m.margin)} after ${moneyK(m.cost)} to serve` : ''}</div></div>
      <div class="card stat"><div class="lab">Storage · service</div><div class="big">${s ? Math.round(s.storage.slice(12).reduce((t, v) => t + v, 0) / Math.max(1, ltm) * 100) : '—'}<span style="font-size:15px;color:var(--ink-3)">% · </span>${s ? Math.round(s.service.slice(12).reduce((t, v) => t + v, 0) / Math.max(1, ltm) * 100) : '—'}<span style="font-size:15px;color:var(--ink-3)">%</span></div><div class="sub">share of the last twelve months</div></div>
      <div class="card stat"><div class="lab">Boxes · bin services</div><div class="big">${acct ? Math.round(acct.boxes).toLocaleString('en-US') : '—'}</div><div class="sub">${acct && acct.bins ? `${acct.bins.toLocaleString('en-US')} bin services on ${acct.visits} visits` : 'no bin work'}</div></div>
    </div>
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
        <div class="card">
          <div class="card-head"><h3>Prices against the book</h3><a href="#pricing?level1=${id}">Price it ›</a></div>
          ${mine.map(r => `<div class="price">
            <span><a href="#pricing?level1=${id}&code=${encodeURIComponent(r.servcode)}" style="color:inherit;text-decoration:none"><b>${esc(titleCase(r.service))}</b> <span style="color:var(--brand)">›</span></a><span class="sub" style="display:block">$${r.modal_rate.toFixed(2)} · book median $${r.med.toFixed(2)} · cheaper than ${Math.round((1 - r.below) * 100)}% of accounts</span></span>
            <span class="v">${r.worth > 0 ? `+${moneyK(r.worth)}/mo<span class="sub" style="display:block;font-weight:400">at the median</span>` : '<span class="sub">at or above</span>'}</span>
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

  drawDrill(main.querySelector('#cp-drill'), id, svcName);

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
  main.querySelector('#cp-fams').addEventListener('click', ev => {
    const row = ev.target.closest('.fam'); if (!row) return;
    const box = main.querySelector(`.lines[data-for="${row.dataset.f}"]`);
    const open = !box.hidden;
    main.querySelectorAll('.lines').forEach(b => { b.hidden = true; b.innerHTML = ''; });
    main.querySelectorAll('.fam').forEach(f => f.classList.remove('open'));
    if (open) return;
    row.classList.add('open'); box.hidden = false;
    const fam = row.dataset.f;
    const ls = M.lines.filter(l => l.level1 === id && ((l.family && l.family !== 'none' ? l.family : 'other') === fam))
      .sort((a, b) => b.revenue - a.revenue);
    if (fam === 'storage') { box.innerHTML = `<p class="sub">${acct ? Math.round(acct.boxes).toLocaleString('en-US') : '—'} boxes on average, at $${R.RATES.facilities.v.toFixed(4)} a box a month to house ◇.</p>`; return; }
    ledgerTable(box, { columns: [
      { key: 'servcode', label: 'Service', fmt: (v) => esc(titleCase(svcName.get(v.replace(/^S5[BPT]$/, 'S5')) || v)) + ` <span class="sub" style="display:inline">${esc(v)}</span>` },
      { key: 'units', label: 'Units', num: true, fmt: (v, r) => Math.round(v).toLocaleString('en-US') + ' ' + (r.unit || '') },
      { key: 'revenue', label: 'Revenue', num: true, fmt: v => money0(v) },
    ], rows: ls });
  });
}

// Below the page: the account's work orders (what was billed, order by order) and its Veri-Shred
// visits (one row per day and route). Per account, so fetched here rather than in the snapshot.
async function drawDrill(el, id, svcName) {
  if (!el) return;
  let d;
  try {
    const r = await fetch(`/api/customer/${id}`, { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    d = j.data;
  } catch (e) {
    el.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-head"><h3>Work orders and visits</h3></div><div class="pending">${esc(e.message)}</div></div>`;
    return;
  }
  if (!el.isConnected) return;
  const day = t => new Date(t + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const ordRev = d.orders.reduce((t, o) => t + o.revenue, 0);
  const lbs = d.visits.reduce((t, v) => t + (v.pounds || 0), 0);
  el.innerHTML = `
    <div class="card"><div class="card-head"><h3>Work orders</h3><small>${d.orders.length ? `${n0(d.orders.length)}${d.orders.length >= 200 ? '+' : ''} in six months · ${money0(ordRev)}` : 'last six months'}</small></div><div id="cp-orders"></div><div class="src">VCK priced lines by work order · tap an order for its lines</div></div>
    <div class="card"><div class="card-head"><h3>Visits</h3><small>${d.visits.length ? `${n0(d.visits.length)} route-days · ${n0(lbs)} lb weighed` : 'last six months'}</small></div><div id="cp-visits"></div><div class="src">Veri-Shred done orders · one row per day and route · executive-bin pounds are a default, not a weigh</div></div>`;
  const oBox = el.querySelector('#cp-orders'), vBox = el.querySelector('#cp-visits');
  if (d.orders.length) ledgerTable(oBox, {
    columns: [
      { key: 'date', label: 'Date', fmt: v => day(v) },
      { key: 'woid', label: 'Order', fmt: v => `<span class="sub" style="display:inline">${esc(v)}</span>` },
      { key: 'lines', label: 'Lines', num: true },
      { key: 'revenue', label: 'Value', num: true, fmt: v => money0(v) },
    ],
    rows: d.orders.slice(0, 60),
    detail: (o, td) => {
      td.innerHTML = o.items.map(i => `<div style="display:flex;justify-content:space-between;gap:12px;padding:3px 0"><span>${esc(titleCase(svcName.get(String(i.code).replace(/^S5[BPT]$/, 'S5')) || i.code))} <span class="sub" style="display:inline">${esc(i.code)} · ${n0(i.units)}</span></span><span class="num">${money0(i.revenue)}</span></div>`).join('');
    },
  });
  else oBox.innerHTML = '<p class="sub">No billed work orders in the last six months.</p>';
  if (d.visits.length) ledgerTable(vBox, {
    columns: [
      { key: 'date', label: 'Date', fmt: v => v ? day(v) : '—' },
      { key: 'route', label: 'Route', fmt: (v, r) => `${esc(v || '—')}${r.driver ? ` <span class="sub" style="display:inline">${esc(r.driver)}</span>` : ''}` },
      { key: 'services', label: 'Services', num: true, fmt: (v, r) => `${n0(v)}${r.stops > 1 ? ` <span class="sub" style="display:inline">${r.stops} stops</span>` : ''}` },
      { key: 'pounds', label: 'Pounds', num: true, fmt: v => v ? n0(v) : '—' },
    ],
    rows: d.visits.slice(0, 60),
  });
  else vBox.innerHTML = '<p class="sub">No done Veri-Shred orders in the last six months: this account\'s work is storage or warehouse handling.</p>';
}

function pos(v, r) {
  const lo = Math.min(r.p10, r.modal_rate), hi = Math.max(r.p90, r.modal_rate, r.med * 1.01);
  return Math.max(1, Math.min(99, (v - lo) / (hi - lo) * 100));
}
