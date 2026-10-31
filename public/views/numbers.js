// Numbers (#numbers): the company's figures on one page, for Trisha and Theran.
//   1. core (storage plus service, Citadel apart) by month against $1.0M, from the posted invoices
//   2. the EBITDA bridge from the QuickBooks P&L (model.gl_month, scripts/load_gl.js): revenue, cost to
//      serve, contribution, sales, management, overheads, EBITDA before and after the owner-related
//      and discretionary lines; an honest empty state until the first month is loaded
//   3. gross margin by line of business ◇ from the cost model (components/margin.js)
// Worked out on the server (/api/view/numbers); the customer-level margin stays at contribution:
// overheads are never spread by revenue.
import { esc } from '/components/data.js';
import { money0, moneyK } from '/components/chart.js';
import { reveal } from '/components/motion.js';

const mon = (d, o = { month: 'short' }) => new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const monY = d => mon(d, { month: 'long', year: 'numeric' });
const pc = v => Math.round(v * 100) + '%';
const ROUTE_FAMILIES = ['handling', 'movement'];

export async function render(main, V) {
  if (!main) return;
  const M = V.monthly, last = M[M.length - 1], l12 = M.slice(-12), avg12 = l12.reduce((t, m) => t + m.core, 0) / l12.length;
  const ly = M.find(m => m.month.slice(5, 7) === last.month.slice(5, 7) && +m.month.slice(0, 4) === +last.month.slice(0, 4) - 1);
  const best = l12.reduce((a, m) => m.core > a.core ? m : a, l12[0]);
  const G = V.gl;

  const kpis = `<section class="h2-kpis four" data-rv>
    <div class="h2-kpi lead"><span>${esc(monY(last.month))}, core</span><b>${moneyK(last.core)}</b><small>${ly ? `${last.core >= ly.core ? '▲' : '▼'} ${pc(Math.abs(last.core / ly.core - 1))} on a year ago` : 'posted invoices'}</small></div>
    <div class="h2-kpi"><span>Twelve-month average</span><b>${moneyK(avg12)}</b><small>a month, ${esc(mon(l12[0].month))} to ${esc(mon(last.month))}</small></div>
    <a class="h2-kpi" href="#customers?view=opportunities"><span>Gap to $1.0M ›</span><b>${moneyK(V.gap.gap)}</b><small>${V.gap.next ? `on ${esc(mon(V.gap.next, { month: 'long' }))}'s bill building ◇, as on Home` : 'on the latest bill, as on Home'}</small></a>
    <div class="h2-kpi"><span>${G ? 'EBITDA, twelve months' : 'Best month of the twelve'}</span><b>${G ? moneyK(G.last12.ebitda_after) : moneyK(best.core)}</b><small>${G ? `${G.last12.revenue > 0 ? pc(G.last12.ebitda_after / G.last12.revenue) : '—'} of revenue, after discretionary` : esc(monY(best.month))}</small></div>
  </section>`;

  main.innerHTML = `<div class="nb">
    <h1>Numbers</h1>
    ${kpis}
    <section class="h2-card" data-rv>
      <div class="h2-ch"><h2>${esc(coreTitle(l12, V.target))}</h2><small>core by month, storage and service, against $1.0M</small></div>
      <div id="nb-core"></div>
      <div class="src">Posted invoices on invoice date, storage plus service, Citadel held apart (kpi.monthly from VCK) · storage bills a month ahead, service a month behind</div>
    </section>
    <section class="h2-card" data-rv id="nb-ebitda"></section>
    <section class="h2-card" data-rv id="nb-margin"></section>
  </div>`;

  coreChart(main.querySelector('#nb-core'), M.slice(-13), V.target);
  main.querySelector('#nb-ebitda').innerHTML = G ? ebitdaHtml(G) : `<div class="h2-ch"><h2>The EBITDA bridge</h2><small>revenue to EBITDA, by month</small></div>
    <div class="pending">Not loaded yet: it comes from the monthly QuickBooks Profit and Loss by Month export. Run <code>node scripts/load_gl.js &lt;the CSV&gt;</code> on the PC once a month after the books close; this panel fills from <code>model.gl_month</code>.</div>`;
  main.querySelector('#nb-margin').innerHTML = marginHtml(V.margin);
  if (G) monthBars(main.querySelector('#nb-ebitda-months'), G.months.slice(-13));
  reveal(main.querySelector('.nb'));
}

function coreTitle(l12, target) {
  const under = l12.filter(m => m.core < target).length, avg = l12.reduce((t, m) => t + m.core, 0) / l12.length;
  return under === l12.length ? `Every month of the last ${l12.length} closed under $1.0M; the average ran ${moneyK(target - avg)} short` : `${l12.length - under} of the last ${l12.length} months reached $1.0M`;
}

// stacked bars, storage under service, the target as a dashed line; one axis, hairline grid
function coreChart(el, M, target) {
  if (!el) return;
  const W = Math.max(320, Math.round(el.getBoundingClientRect().width || 640)), H = 220, L = 44, R = 8, T = 16, B = 24;
  const max = Math.max(target * 1.08, ...M.map(m => m.storage + m.service));
  const fy = v => T + (1 - v / max) * (H - T - B), slot = (W - L - R) / M.length, bw = Math.min(24, slot * 0.6);
  let g = '';
  for (const v of [0, 250e3, 500e3, 750e3, 1e6].filter(v => v <= max)) g += `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${fy(v)}" y2="${fy(v)}"/><text class="c-axis" x="${L - 6}" y="${fy(v) + 4}" text-anchor="end">${v >= 1e6 ? '$1.0M' : v ? '$' + v / 1e3 + 'K' : '0'}</text>`;
  M.forEach((m, i) => {
    const x = L + slot * (i + 0.5) - bw / 2, ys = fy(m.storage), yt = fy(m.storage + m.service);
    g += `<rect class="nb-sto" x="${x}" y="${ys}" width="${bw}" height="${H - B - ys}"><title>${mon(m.month)}: storage ${money0(m.storage)}</title></rect>`;
    g += `<path class="nb-svc" d="M${x},${ys} V${yt + 4} Q${x},${yt} ${x + 4},${yt} H${x + bw - 4} Q${x + bw},${yt} ${x + bw},${yt + 4} V${ys} Z"><title>${mon(m.month)}: service ${money0(m.service)}, core ${money0(m.core)}</title></path>`;
    if (slot >= 36 || i % 2 === (M.length - 1) % 2) g += `<text class="c-axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${mon(m.month)}</text>`;
  });
  g += `<line class="nb-target" x1="${L}" x2="${W - R}" y1="${fy(target)}" y2="${fy(target)}"/><text class="c-axis" x="${W - R}" y="${fy(target) - 6}" text-anchor="end">$1.0M a month</text>`;
  el.innerHTML = `<div class="nb-legend"><span><i class="nb-k sto"></i>Storage</span><span><i class="nb-k svc"></i>Service</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Core revenue by month against $1.0M">${g}</svg>`;
}

// the bridge as a waterfall: each step a bar from where the last ended
function ebitdaHtml(G) {
  const S = G.last12, steps = [
    ['Revenue', S.revenue, 'total'], ['Cost to serve', -S.cost_to_serve], ['Contribution', S.contribution, 'total'],
    ['Sales team', -S.sales], ['Management', -S.management], ['Overheads', -S.overhead], ['EBITDA before discretionary', S.ebitda, 'total'],
    ['Owner-related and discretionary', -S.discretionary], ['EBITDA', S.ebitda_after, 'total'],
  ];
  const max = Math.max(S.revenue, 1);
  let run = 0;
  const rows = steps.map(([name, v, kind]) => {
    let a, b;
    if (kind === 'total') { a = Math.min(0, v); b = Math.max(0, v); run = v; } else { a = Math.min(run, run + v); b = Math.max(run, run + v); run += v; }
    const left = Math.max(0, a) / max * 100, w = Math.max(0.4, (b - Math.max(0, a)) / max * 100);
    return `<li class="${kind === 'total' ? 'tot' : 'step'} ${v < 0 && kind === 'total' ? 'neg' : ''}"><span>${esc(name)}</span><i style="--l:${left.toFixed(2)}%;--w:${w.toFixed(2)}%"></i><b>${v < 0 ? '−' : ''}${money0(Math.abs(v))}</b><em>${S.revenue > 0 ? pc(v / S.revenue) : ''}</em></li>`;
  }).join('');
  return `<div class="h2-ch"><h2>EBITDA ${S.ebitda_after >= 0 ? 'was' : 'lost'} ${moneyK(Math.abs(S.ebitda_after))} over the ${S.n} months to ${esc(monY(S.to))}, ${moneyK(S.discretionary)} of discretionary spend taken out</h2><small>revenue to EBITDA, ${esc(mon(S.from))} to ${esc(mon(S.to))}</small></div>
    <ul class="nb-wf">${rows}</ul>
    <h3 class="nb-h3">EBITDA by month</h3><div id="nb-ebitda-months"></div>
    ${G.overheadLines.length ? `<details class="fold"><summary><h3>The largest overhead lines</h3><span class="sub">check none belongs in cost to serve · open</span></summary><ul class="nb-oh">${G.overheadLines.map(o => `<li><span>${esc(o.account)}</span><b>${money0(o.amount)}</b></li>`).join('')}</ul></details>` : ''}
    <div class="src">QuickBooks Profit and Loss by Month (${esc(G.source || 'export')}), loaded ${esc(String(G.loadedAt || '').slice(0, 10))} · lines sorted by account (public/components/gl.js): cost to serve is the pools the cost model allocates; owner-related and discretionary per the GL review; interest, depreciation, the Illinois PTE tax and Citadel pass-through sit below EBITDA</div>`;
}

function monthBars(el, months) {
  if (!el) return;
  const W = Math.max(320, Math.round(el.getBoundingClientRect().width || 640)), H = 150, L = 44, R = 8, T = 12, B = 22;
  const vals = months.map(m => m.ebitda_after), hi = Math.max(0, ...vals), lo = Math.min(0, ...vals), span = hi - lo || 1;
  const fy = v => T + (hi - v) / span * (H - T - B), slot = (W - L - R) / months.length, bw = Math.min(24, slot * 0.6);
  let g = `<line class="c-zero" x1="${L}" x2="${W - R}" y1="${fy(0)}" y2="${fy(0)}"/><text class="c-axis" x="${L - 6}" y="${fy(0) + 4}" text-anchor="end">0</text>`;
  months.forEach((m, i) => {
    const v = m.ebitda_after, x = L + slot * (i + 0.5) - bw / 2, y = Math.min(fy(v), fy(0)), h = Math.max(1, Math.abs(fy(v) - fy(0)));
    g += `<rect class="nb-eb ${v < 0 ? 'neg' : ''}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="3"><title>${mon(m.month)}: EBITDA ${v < 0 ? '−' : ''}${money0(Math.abs(v))} on revenue ${money0(m.revenue)}</title></rect>`;
    if (slot >= 36 || i % 2 === (months.length - 1) % 2) g += `<text class="c-axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${mon(m.month)}</text>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="EBITDA by month">${g}</svg>`;
}

function marginHtml(Mg) {
  // the total is the lines costed with confidence: route-cost lines under review and uncosted fees left out
  const sure = Mg.lines.filter(l => l.cost > 0 && !ROUTE_FAMILIES.includes(l.family));
  const tot = sure.reduce((a, l) => ({ revenue: a.revenue + l.revenue, cost: a.cost + l.cost }), { revenue: 0, cost: 0 });
  const rows = Mg.lines.map(l => {
    const costed = l.cost > 0, review = ROUTE_FAMILIES.includes(l.family), m = l.revenue - l.cost;
    return `<tr><td>${esc(l.name)}${l.family === 'bin' ? `<small>${Mg.binReal.accounts} accounts from real route days</small>` : review ? '<small>route cost under review</small>' : !costed ? '<small>not costed</small>' : ''}</td>
      <td class="v">${money0(l.revenue)}</td><td class="v">${costed ? money0(l.cost) : '—'}</td>
      <td class="v ${costed && m < 0 && !review ? 'is-bad' : ''}">${costed ? (m < 0 ? '−' : '') + money0(Math.abs(m)) : '—'}</td><td class="v">${costed && l.revenue > 0 ? pc(m / l.revenue) : '—'}</td></tr>`;
  }).join('');
  return `<div class="h2-ch"><h2>Gross margin by line of business ◇</h2><small>the last twelve months, revenue less the cost to serve, ${Mg.accounts} accounts, Citadel apart</small></div>
    <div class="c2-scroll"><table class="q-t nb-t"><thead><tr><th>Line</th><th class="v">Revenue</th><th class="v">Cost to serve ◇</th><th class="v">Margin ◇</th><th class="v">Kept</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td>The costed lines<small>leaving out the two under review and the fees</small></td><td class="v">${money0(tot.revenue)}</td><td class="v">${money0(tot.cost)}</td><td class="v">${money0(tot.revenue - tot.cost)}</td><td class="v">${pc((tot.revenue - tot.cost) / tot.revenue)}</td></tr></tfoot></table></div>
    <div class="src">Cost to serve from model/rates.js (GL pools over the database's volumes, provisional) ◇ · bins from ${Mg.binReal.routeDays} real route days, ${esc(String(Mg.binReal.from))} to ${esc(String(Mg.binReal.to))}, shared by minutes, where the account has them; elsewhere the average visit · sales, management and overheads sit above this line, in the bridge, never spread across customers</div>`;
}
