// One customer: the page every list and every number opens. Desktop first, restacks on a phone.
// Header figures · 24-month storage and service on one axis · margin by line of business, each line
// opening to its priced lines · prices against the book's median and what moving is worth · signals.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { buildMargins, FAMILY_NAMES } from '/components/margin.js';
import { ledgerTable } from '/components/table.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
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
.cp .sig .acts button { border: 1px solid var(--rule-3); background: var(--surface); border-radius: 8px; padding: 3px 10px; font-size: 13px; color: var(--ink-3); }
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
  const [R, M, PR, CA] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing'), getJson('calls')]);
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
    if (signals.down_two_months) sigs.push(`Below its own six-month level for a second month: ${money0(signals.month_revenue)} against ${money0(signals.trailing6_mean)}.`);
    if (signals.up_20pct) sigs.push(`Up ${Math.round(signals.deviation_pct)}% on its own six-month level last month.`);
    if (signals.not_raised_2y) sigs.push(`No rate has moved in two years across ${signals.codes} services.`);
    if (signals.storage_no_destruction) sigs.push('Stores with R4 but buys no destruction: shredding is a natural next conversation.');
    if (signals.destruction_no_storage) sigs.push('Buys destruction but stores nothing with R4.');
    if (signals.boxes_review_overdue > 0) sigs.push(`${Math.round(signals.boxes_review_overdue).toLocaleString('en-US')} boxes are past their retention review: a destruction conversation.`);
  }

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
          ${sigs.map(t => `<div class="sig">${esc(t)}<div class="acts"><button disabled title="Recording starts with the calls log">Right</button><button disabled title="Recording starts with the calls log">Not right</button></div></div>`).join('') || '<p class="sub">Nothing flagged this week.</p>'}
        </div>
      </div>
    </div>
  </div>`;

  if (s) {
    const pts = k => s.months.map((x, i) => ({ x, y: s[k][i] }));
    lineChart(main.querySelector('#cp-chart'), {
      title: 'Revenue by month', sub: `${s.months.length} months to the latest posted month · invoice month · one axis`,
      series: [{ name: 'Storage', cls: 'storage', points: pts('storage') }, { name: 'Service', cls: 'service', points: pts('service') }],
      source: 'VCK invoices, posted runs · storage ret_tot, service ser_tot',
    });
  } else main.querySelector('#cp-chart').remove();

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

function pos(v, r) {
  const lo = Math.min(r.p10, r.modal_rate), hi = Math.max(r.p90, r.modal_rate, r.med * 1.01);
  return Math.max(1, Math.min(99, (v - lo) / (hi - lo) * 100));
}
