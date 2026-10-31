// Customers › Overview — the first thing Customers shows. A KPI band (last month's sales, its trend,
// the book by line), the largest, rising and slipping five, then every account in one table: sort by
// any column, filter to one line of business to see price and cost per unit. Every figure opens a
// pop-out that says why it is what it is, against similar accounts, and what to do about it.
// Figures from components/custbook.js and home2data.js, the same ones Home and Ask read.
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { pricePosition, sizePeers, FAMS } from '/components/custbook.js';
import { customerView } from '/components/home2data.js';
import { costParts, PARTS, marginAction, FAMILY_NAMES } from '/components/margin.js';
import { serviceMedians, slippingAccounts, CITADEL } from '/components/levers.js';
import { LINES } from '/components/whitespace.js';
import { openPop } from '/components/pop.js';
import { reveal } from '/components/motion.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const pct = v => `${Math.abs(Math.round(v * 100))}%`;
const chip = (v, quiet) => v == null ? '<span class="h2-d flat">—</span>' : `<span class="h2-d ${quiet ? 'quiet' : v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'}">${v > 0.005 ? '▲' : v < -0.005 ? '▼' : ''} ${v >= 2 ? Math.round(v + 1) + '×' : pct(v)}</span>`;
const signedK = v => v == null ? '—' : (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
const unitMoney = (v, unit) => v == null ? '—' : '$' + (unit === 'box a month' || unit === 'lb' ? v.toFixed(3) : v.toFixed(2));
const PAGE = 60;

// the table's columns: the whole account, or one line of business
const ALL_COLS = [
  { k: 'customer', l: 'Customer', sort: r => r.customer, text: true },
  { k: 'spark', l: '13 months', sort: null },
  { k: 'last', l: 'Last month', sort: r => r.last, x: 'sales' },
  { k: 'd', l: '3 months vs own run', sort: r => r.d, x: 'sales' },
  { k: 'ytdPct', l: 'Year to date', sort: r => r.ytdPct, x: 'sales' },
  { k: 'pc', l: 'Margin ◇', sort: r => r.pc, x: 'margin' },
  { k: 'opp', l: 'Cross-sell ◇', sort: r => r.opp, x: 'opp' },
  { k: 'gap', l: 'Under the book', sort: r => r.gap, x: 'gap' },
];
const famCols = key => [
  { k: 'customer', l: 'Customer', sort: r => r.customer, text: true },
  { k: 'frev', l: 'Revenue, 12 months', sort: r => r.fam[key].revenue, x: 'margin' },
  { k: 'units', l: 'Units', sort: r => r.fam[key].units },
  { k: 'price', l: 'Price a unit', sort: r => r.fam[key].price, x: 'price' },
  { k: 'costPer', l: 'Cost a unit ◇', sort: r => r.fam[key].costPer, x: 'price' },
  { k: 'fmargin', l: 'Margin ◇', sort: r => r.fam[key].revenue - r.fam[key].cost, x: 'margin' },
  { k: 'fpc', l: 'Margin %', sort: r => r.fam[key].revenue > 0 ? (r.fam[key].revenue - r.fam[key].cost) / r.fam[key].revenue : null, x: 'margin' },
];

export async function render(main, C, params, tabs) {
  // the customer book and the book by line, worked out on the server (server/views.js); pricing loads only
  // when a price pop-out opens
  const [P, VW, R] = await Promise.all([getJson('pulse'), getJson('view/customers'), loadRates()]);
  const B = { rows: VW.rows, book: VW.book, months: VW.months, ws: VW.ws }, seg = VW.seg, PR = null;
  const cust = customerView({ C });
  const last = P.monthly[P.monthly.length - 1], prev = P.monthly[P.monthly.length - 2], ly = P.monthly[P.monthly.length - 13];
  const active = B.rows.filter(r => r.last > 0 && !r.citadel).length, activePrev = C.accounts.filter(a => a.level1 !== CITADEL && (a.storage[a.storage.length - 2] + a.service[a.service.length - 2]) > 0).length;
  const slip = slippingAccounts(C), slipV = slip.reduce((t, s) => t - s.move.d, 0);
  const crossV = B.ws.total / 12;

  const kpis = `<section class="h2-kpis four" data-rv>
      <div class="h2-kpi lead"><span>${esc(mon(last.month))} billed, core</span><b>${moneyK(last.core)}</b><small>${chip(last.core / prev.core - 1)} on ${esc(mon(prev.month))}${ly ? ` · ${chip(last.core / ly.core - 1)} on a year ago` : ''}</small></div>
      <div class="h2-kpi"><span>Customers billing</span><b>${active}</b><small>${chip(active / activePrev - 1)} on the month before</small></div>
      <a class="h2-kpi" href="#customers?view=opportunities&kind=slip"><span>Slipping ›</span><b>${slip.length}</b><small>${moneyK(slipV)} a month below their own run</small></a>
      <a class="h2-kpi" href="#customers?view=whitespace"><span>Cross-sell ◇ ›</span><b>${moneyK(crossV)}</b><small>a month, if each bought like its peers</small></a>
    </section>`;

  // the book by line: one bar, each line's share of last month, with its change
  const segCard = seg ? `<section class="h2-card" data-rv><div class="h2-ch"><h2>${esc(mon(seg.month))} by line of business</h2><small>${moneyK(seg.total)} · tap a line to see its customers' prices and costs</small></div>
      <div class="c2-stack">${seg.rows.map((s, i) => `<i class="s${i}" style="--w:${(s.lm / seg.total * 100).toFixed(2)}%" title="${esc(s.name)} ${moneyK(s.lm)}"></i>`).join('')}</div>
      <div class="c2-legend">${seg.rows.map((s, i) => { const f = FAMS.find(x => x.key === s.key); return `<${f ? `a href="#customers?view=overview&line=${s.key}"` : 'span'} class="c2-li"><i class="k s${i}"></i><span>${esc(s.name)}</span><b>${moneyK(s.lm)}</b>${chip(s.lmPct)}</${f ? 'a' : 'span'}>`; }).join('')}</div></section>` : '';

  const custRow = (r, kind) => `<li><a href="#customer/${r.level1}"><span class="h2-cn">${esc(titleCase(r.customer))}</span>${sparkline(r.spark, { w: 72, h: 22, cls: 'service' })}
      <span class="h2-cv ${kind === 'top' ? '' : kind === 'rising' ? 'up' : 'down'}">${kind === 'top' ? moneyK(r.last3) : signedK(r.d)}<small>a month</small></span></a></li>`;
  const fives = `<section class="h2-card" data-rv><div class="h2-ch"><h2>Who moved</h2><small>last three months against each account's own year before</small></div>
      <div class="seg h2-tabs"><button data-k="top" class="on">Largest</button><button data-k="rising">Rising</button><button data-k="falling">Slipping</button></div>
      <div class="h2-cols">
        <div class="h2-col" data-k="top"><h3>Largest</h3><ul class="h2-cl">${cust.top.map(r => custRow(r, 'top')).join('')}</ul></div>
        <div class="h2-col" data-k="rising"><h3>Rising</h3><ul class="h2-cl">${cust.rising.map(r => custRow(r, 'rising')).join('')}</ul></div>
        <div class="h2-col" data-k="falling"><h3>Slipping <a href="#customers?view=slipping">all ${cust.slipping} ›</a></h3><ul class="h2-cl">${cust.falling.map(r => custRow(r, 'falling')).join('')}</ul></div>
      </div></section>`;

  let line = FAMS.some(f => f.key === params.line) ? params.line : 'all';
  let sort = params.sort || null, dir = params.dir === 'up' ? 1 : -1, shown = PAGE, q = '';
  main.innerHTML = `<div class="cust c2">
    <h1>Customers</h1>
    ${tabs}
    ${kpis}
    <div class="h2-row">${segCard}${fives}</div>
    <section class="h2-card c2-tablecard" data-rv>
      <div class="c2-tools">
        <div class="seg c2-lines">${[{ key: 'all', name: 'All lines' }, ...FAMS].map(f => `<button data-line="${f.key}">${esc(f.name)}</button>`).join('')}</div>
        <input class="c2-find" type="search" placeholder="Find a customer" aria-label="Find a customer">
      </div>
      <p class="c2-say" id="c2-say"></p>
      <div class="c2-scroll"><table class="c2-t" id="c2-t"></table></div>
      <div class="c2-more" id="c2-more"></div>
      <div class="src">Sales as invoiced, Citadel held apart from totals · margin and cost a unit ◇ are modelled from model/rates.js; route-based costs are under review · price a unit is the line's revenue over the units that drive it · tap any figure for why</div>
    </section>
  </div>`;

  const tabsEl = main.querySelectorAll('.h2-tabs button'), cols = main.querySelectorAll('.h2-col');
  const pick = k => { tabsEl.forEach(b => b.classList.toggle('on', b.dataset.k === k)); cols.forEach(c => c.classList.toggle('on', c.dataset.k === k)); };
  tabsEl.forEach(b => b.addEventListener('click', () => pick(b.dataset.k))); pick('top');

  const table = main.querySelector('#c2-t');
  const draw = () => {
    const C2 = line === 'all' ? ALL_COLS : famCols(line);
    let rows = B.rows.filter(r => line === 'all' || r.fam[line]);
    if (q) rows = rows.filter(r => r.customer.toLowerCase().includes(q));
    const col = C2.find(c => c.k === sort && c.sort) || (line === 'all' ? C2[2] : C2[1]);
    const val = r => col.sort(r);
    rows.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; const c = col.text ? String(x).localeCompare(String(y)) : x - y; return dir === 1 ? c : -c; });
    const fname = line === 'all' ? '' : FAMS.find(f => f.key === line).name;
    const say = main.querySelector('#c2-say');
    if (line === 'all') say.textContent = `${rows.length} accounts with more than $1,000 in the last twelve months. Sorted by ${col.l.replace(' ◇', '').toLowerCase()}.`;
    else {
      const units = rows[0] ? rows[0].fam[line].unit : '', withPrice = rows.filter(r => r.fam[line].price > 0);
      const below = withPrice.filter(r => r.fam[line].costPer > r.fam[line].price).length;
      say.textContent = `${rows.length} accounts buy ${fname.toLowerCase()}, priced a ${units}. ${below ? `${below} pay less than it costs to serve them ◇.` : ''} Tap a price to see it against similar accounts.`;
    }
    const head = `<thead><tr>${C2.map(c => `<th class="${c.text ? 'tl' : ''}${c.k === col.k ? ' on' : ''}${c.k === 'spark' ? ' sp' : ''}" ${c.sort ? `data-sort="${c.k}" tabindex="0"` : ''}>${esc(c.l)}${c.k === col.k ? (dir === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>`;
    const cell = (r, c) => {
      const btn = (inner, x) => `<button class="c2-x" data-x="${x}" data-id="${r.level1}">${inner}</button>`;
      const f = line === 'all' ? null : r.fam[line];
      switch (c.k) {
        case 'customer': return `<td class="tl"><a href="#customer/${r.level1}">${esc(titleCase(r.customer))}</a>${r.citadel ? ' <small>held apart</small>' : ''}</td>`;
        case 'spark': return `<td class="sp">${r.spark ? sparkline(r.spark, { w: 84, h: 22, cls: 'service' }) : ''}</td>`;
        case 'last': return `<td>${r.last == null ? '—' : btn(`${moneyK(r.last)} ${chip(r.lastPct, true)}`, 'sales')}</td>`;
        case 'd': return `<td>${r.d == null ? '—' : btn(`<span class="h2-cv ${r.d > 0 ? 'up' : r.d < 0 ? 'down' : ''}">${signedK(r.d)}</span> ${chip(r.movePct)}`, 'sales')}</td>`;
        case 'ytdPct': return `<td>${r.ytdPct == null ? '—' : btn(chip(r.ytdPct, true), 'sales')}</td>`;
        case 'pc': return `<td>${r.pc == null ? '—' : btn(`<span class="${r.margin < 0 ? 'is-bad' : r.pc < .15 ? 'is-warn' : ''}">${Math.round(r.pc * 100)}%</span>${r.review ? '<small> review</small>' : ''}`, 'margin')}</td>`;
        case 'opp': return `<td>${r.opp > 0 ? btn(moneyK(r.opp), 'opp') : '—'}</td>`;
        case 'gap': return `<td>${r.gap > 0 ? btn(moneyK(r.gap), 'gap') : '—'}</td>`;
        case 'frev': return `<td>${btn(moneyK(f.revenue), 'margin')}</td>`;
        case 'units': return `<td>${Math.round(f.units).toLocaleString('en-US')}</td>`;
        case 'price': { const p = pricePosition(B, r, line); return `<td>${f.price ? btn(`${unitMoney(f.price, f.unit)}${p && !p.widened ? ` <span class="c2-pct ${p.pct < .25 ? 'lo' : p.pct > .75 ? 'hi' : ''}">${p.pct < .25 ? 'low' : p.pct > .75 ? 'high' : 'mid'}</span>` : ''}`, 'price') : '—'}</td>`; }
        case 'costPer': return `<td>${f.costPer ? btn(unitMoney(f.costPer, f.unit), 'price') : '—'}</td>`;
        case 'fmargin': { const v = f.revenue - f.cost; return `<td>${btn(`<span class="${v < 0 ? 'is-bad' : ''}">${signedK(v)}</span>`, 'margin')}</td>`; }
        case 'fpc': { const v = f.revenue > 0 ? (f.revenue - f.cost) / f.revenue : null; return `<td>${v == null ? '—' : `<span class="${v < 0 ? 'is-bad' : v < .15 ? 'is-warn' : ''}">${Math.round(v * 100)}%</span>`}</td>`; }
      }
      return '<td></td>';
    };
    table.innerHTML = head + `<tbody>${rows.slice(0, shown).map(r => `<tr>${C2.map(c => cell(r, c)).join('')}</tr>`).join('')}</tbody>`;
    main.querySelector('#c2-more').innerHTML = rows.length > shown ? `<button class="linkbtn" id="c2-all">Show all ${rows.length} ›</button>` : '';
    const all = main.querySelector('#c2-all'); if (all) all.addEventListener('click', () => { shown = Infinity; draw(); });
    main.querySelectorAll('.c2-lines button').forEach(b => b.classList.toggle('on', b.dataset.line === line));
    table.querySelectorAll('th[data-sort]').forEach(th => {
      const go = () => { const k = th.dataset.sort; dir = sort === k ? -dir : -1; sort = k; keep(); draw(); };
      th.addEventListener('click', go); th.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  };
  const keep = () => history.replaceState(null, '', `#customers?view=overview${line !== 'all' ? '&line=' + line : ''}${sort ? `&sort=${sort}${dir === 1 ? '&dir=up' : ''}` : ''}`);
  main.querySelectorAll('.c2-lines button').forEach(b => b.addEventListener('click', () => { line = b.dataset.line; sort = null; dir = -1; shown = PAGE; keep(); draw(); }));
  main.querySelector('.c2-find').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); shown = PAGE; draw(); });
  table.addEventListener('click', e => {
    const b = e.target.closest('.c2-x'); if (!b) return;
    const r = B.rows.find(x => x.level1 === Number(b.dataset.id));
    explain(b.dataset.x, r, { B, PR, line, R });
  });
  draw();
  reveal(main.querySelector('.c2'));
}

// ── the pop-outs: why a figure is what it is, against similar accounts, and what to do ──
const bars = (items, max) => `<ul class="p2-bars">${items.map(i => `<li><span>${esc(i.name)}</span><i style="--w:${Math.max(1, i.v / max * 100).toFixed(1)}%" class="${i.cls || ''}"></i><b>${i.label}</b></li>`).join('')}</ul>`;

export async function explain(kind, r, { B, PR, line, R }) {
  if (kind === 'gap' && !PR) PR = await getJson('pricing');
  const name = titleCase(r.customer);
  const peers = sizePeers(B, r);
  if (kind === 'sales') {
    const fam = Object.entries(r.mfam).filter(([, v]) => v.revenue > 0).sort((a, b) => b[1].revenue - a[1].revenue);
    const max = Math.max(...fam.map(([, v]) => v.revenue), 1);
    const m = r.move;
    const missing = r.oppRow ? LINES.filter(x => !r.oppRow.cells[x.key].have && r.oppRow.cells[x.key].opp > 0) : [];
    return openPop({
      title: name, sub: `${moneyK(r.ltm)} in the last twelve months`, ask: `Why has ${name} moved the way it has, and what should we do?`,
      html: `${r.spark ? `<div class="p2-spark">${sparkline(r.spark, { w: 320, h: 70, cls: 'service' })}<small>13 months, storage and service</small></div>` : ''}
        ${m ? `<p class="p2-lede">The last three months averaged <b>${moneyK(m.last3)}</b> a month against its own <b>${moneyK(m.run)}</b> the year before: <b class="${m.d < 0 ? 'is-bad' : 'is-good'}">${signedK(m.d)}</b> a month${m.pct != null ? ` (${m.pct > 0 ? 'up' : 'down'} ${pct(m.pct)})` : ''}. Storage moved ${signedK(m.dStorage)}, service ${signedK(m.dService)}.</p>` : ''}
        ${peers.n && peers.move != null && m && m.pct != null ? `<p>Accounts of a similar size (${peers.n}) moved a median <b>${peers.move > 0 ? '+' : '−'}${pct(peers.move)}</b> over the same months, so this one is ${Math.abs(m.pct - peers.move) < .05 ? 'moving with the book' : m.pct < peers.move ? 'doing worse than its peers' : 'doing better than its peers'}.</p>` : ''}
        <h3>What it buys, last twelve months</h3>${bars(fam.map(([k, v]) => ({ name: FAMILY_NAMES[k] || k, v: v.revenue, label: moneyK(v.revenue) })), max)}
        ${missing.length ? `<h3>Not bought yet ◇</h3><ul class="p2-list">${missing.map(x => `<li><b>${esc(x.name)}</b>: about ${moneyK(r.oppRow.cells[x.key].opp)} a year at ${esc(r.oppRow.cells[x.key].basis)}.</li>`).join('')}</ul>` : ''}
        <p class="p2-go"><a href="#customer/${r.level1}">Open ${esc(name)} ›</a></p>`,
    });
  }
  if (kind === 'margin') {
    const fam = Object.entries(r.mfam).filter(([, v]) => v.revenue > 0 || v.cost > 0).sort((a, b) => b[1].revenue - a[1].revenue);
    const lines = Object.values(r.fam).flatMap(f => f.lines || []);
    const parts = costParts(lines), travel = lines.filter(l => l[0] === 'Travel to site').reduce((t, l) => t + l[1], 0);
    const act = marginAction({ pc: r.pc, review: r.review, revenue: r.revenue, cost: r.cost }, travel);
    const pmax = Math.max(...Object.values(parts), 1);
    // what would move it: prices under similar accounts, route cost, size
    const todo = [];
    for (const f of FAMS) {
      const p = pricePosition(B, r, f.key);
      if (p && p.toMedian > 250 && p.pct < .4) todo.push(`<li><b>${esc(f.name)}</b>: pays ${unitMoney(r.fam[f.key].price, p.unit)} a ${esc(p.unit)} where ${p.n} similar accounts pay a median ${unitMoney(p.med, p.unit)}. At the median: <b>+${moneyK(p.toMedian)} a year</b>.</li>`);
    }
    if (r.cost > 0 && travel / r.cost > .35) todo.push(`<li><b>Getting there</b> is ${pct(travel / r.cost)} of its cost ◇ (${r.visits} visits a year). Fewer, fuller visits, or a day when a route is already nearby, cuts it more than any price.</li>`);
    if (r.revenue < 5000 && r.pc < .15) todo.push('<li><b>Small</b>: under $5,000 a year. A minimum charge is the usual fix.</li>');
    return openPop({
      title: name, sub: `Margin ◇ ${Math.round((r.pc || 0) * 100)}%: ${money0(r.revenue)} of revenue, ${money0(r.cost)} to serve`, ask: `Why is ${name}'s margin ${Math.round((r.pc || 0) * 100)}%, and how do we improve it?`,
      html: `<p class="p2-verdict ${act.cls}"><b>${esc(act.tag)}</b> ${esc(act.why)}</p>
        ${peers.pc != null ? `<p>Similar-sized accounts keep a median <b>${Math.round(peers.pc * 100)}%</b> ◇.</p>` : ''}
        <h3>By line, last twelve months ◇</h3>
        <table class="p2-t"><thead><tr><th class="tl">Line</th><th>Revenue</th><th>Cost</th><th>Margin</th></tr></thead><tbody>${fam.map(([k, v]) => `<tr><td class="tl">${esc(FAMILY_NAMES[k] || k)}</td><td>${money0(v.revenue)}</td><td>${money0(v.cost)}</td><td class="${v.revenue - v.cost < 0 ? 'is-bad' : ''}">${signedK(v.revenue - v.cost)}</td></tr>`).join('')}</tbody></table>
        <h3>Where the cost goes ◇</h3>${bars(PARTS.filter(p => parts[p[0]] > 0).map(p => ({ name: p[1], v: parts[p[0]], label: moneyK(parts[p[0]]), cls: p[0] === 'route' ? 'warn' : '' })), pmax)}
        ${todo.length ? `<h3>What would move it</h3><ul class="p2-list">${todo.join('')}</ul>` : ''}
        <p class="src">◇ Costs from model/rates.js: GL pools over twelve months of volumes, provisional; route costs under review until delivery routes are in the data.</p>
        <p class="p2-go"><a href="#customer/${r.level1}">Open ${esc(name)} ›</a></p>`,
    });
  }
  if (kind === 'price') {
    const f = r.fam[line], p = pricePosition(B, r, line), fname = FAMS.find(x => x.key === line).name;
    let strip = '';
    if (p) {
      // the middle nine-tenths of the peers and this account; the odd outlier sits on the edge
      const W = 320, H = 54, at = k => p.all[Math.round(k * (p.all.length - 1))];
      const lo = Math.min(at(.05), f.price), hi = Math.max(at(.95), f.price), x = v => 8 + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1) * (W - 16);
      const anchor = x(f.price) < 60 ? 'start' : x(f.price) > W - 60 ? 'end' : 'middle';
      strip = `<svg viewBox="0 0 ${W} ${H}" class="p2-strip" role="img" aria-label="Prices of similar accounts">
        <rect class="band" x="${x(p.p25)}" y="14" width="${Math.max(2, x(p.p75) - x(p.p25))}" height="18" rx="4"/>
        ${p.all.map(v => `<circle class="peer" cx="${x(v).toFixed(1)}" cy="23" r="2.5"/>`).join('')}
        <line class="med" x1="${x(p.med)}" x2="${x(p.med)}" y1="10" y2="36"/>
        <circle class="me" cx="${x(f.price)}" cy="23" r="6"/>
        <text x="${x(f.price)}" y="50" text-anchor="${anchor}">this account, ${unitMoney(f.price, f.unit)}</text></svg>`;
    }
    return openPop({
      title: `${name} · ${fname}`, sub: `${unitMoney(f.price, f.unit)} a ${f.unit}; costs ${unitMoney(f.costPer, f.unit)} to serve ◇`, ask: `Is ${name} priced right for ${fname.toLowerCase()} against similar accounts?`,
      html: `${p ? `<p class="p2-lede">${p.widened ? `Few accounts buy ${fname.toLowerCase()} at ${esc(name)}'s volume, so this is the whole book (${p.n}), mostly smaller accounts that pay more a unit.` : `Against ${p.n} accounts buying ${fname.toLowerCase()} at a similar volume, it pays more than <b>${pct(p.pct)}</b> of them. Their middle half pays ${unitMoney(p.p25, p.unit)} to ${unitMoney(p.p75, p.unit)}, median ${unitMoney(p.med, p.unit)}.`}</p>${strip}` : '<p>Too few accounts buy this line in the same unit to compare.</p>'}
        <p>${f.costPer ? `It costs about <b>${unitMoney(f.costPer, f.unit)}</b> a ${esc(f.unit)} to serve ◇, so each one ${f.price >= f.costPer ? `leaves <b>${unitMoney(f.price - f.costPer, f.unit)}</b>` : `<b class="is-bad">loses ${unitMoney(f.costPer - f.price, f.unit)}</b>`}.` : ''}
        ${p && p.toMedian > 0 ? ` At its peers' median it would bill <b>+${moneyK(p.toMedian)} a year</b>.` : ''}</p>
        ${f.lines && f.lines.length ? `<h3>The cost working ◇</h3><table class="p2-t"><tbody>${f.lines.map(l => `<tr><td class="tl">${esc(l[0])}<small>${esc(String(l[2] || '').split(/(?<=\.)\s/)[0])}</small></td><td>${money0(l[1])}</td></tr>`).join('')}</tbody></table>` : ''}
        ${p && !p.widened ? `<h3>Closest in volume</h3><ul class="p2-list">${p.names.map(n => `<li><a href="#customer/${n.level1}">${esc(titleCase(n.customer))}</a>: ${unitMoney(n.price, p.unit)} on ${Math.round(n.units).toLocaleString('en-US')}</li>`).join('')}</ul>` : ''}`,
    });
  }
  if (kind === 'opp') {
    const row = r.oppRow, missing = LINES.filter(x => !row.cells[x.key].have && row.cells[x.key].opp > 0);
    return openPop({
      title: name, sub: `Could add about ${moneyK(row.opp)} a year ◇`, ask: `What should we sell ${name} next, and how?`,
      html: `<p class="p2-lede">${esc(name)} buys ${LINES.filter(x => row.cells[x.key].have).map(x => x.name.toLowerCase()).join(', ') || 'little'} today. Accounts like it also buy:</p>
        ${bars(missing.map(x => ({ name: x.name, v: row.cells[x.key].opp, label: moneyK(row.cells[x.key].opp), cls: 'opp' })), Math.max(...missing.map(x => row.cells[x.key].opp)))}
        <ul class="p2-list">${missing.map(x => `<li><b>${esc(x.name)}</b>: ${esc(row.cells[x.key].basis)}.</li>`).join('')}</ul>
        <p class="src">◇ A ceiling at what the median comparable spends, not a forecast. <a href="#customers?view=whitespace">Every gap on the Cross-sell grid ›</a></p>`,
    });
  }
  if (kind === 'gap') {
    const meds = serviceMedians(PR);
    const svc = PR.rates.filter(x => x.level1 === r.level1 && meds[x.servcode] && x.modal_rate > 0 && x.modal_rate < meds[x.servcode]);
    const st = PR.storage.find(x => x.level1 === r.level1);
    return openPop({
      title: name, sub: `About ${moneyK(r.gap)} a year under the book's median`, ask: `Which of ${name}'s prices should we raise first?`,
      html: `<p class="p2-lede">Where ${esc(name)} pays under the median account for the same service, and what the median would bill on its own volume.</p>
        <table class="p2-t"><thead><tr><th class="tl">Service</th><th>Pays</th><th>Median</th><th>A year</th></tr></thead><tbody>
        ${st ? `<tr><td class="tl">Storage, a box a month</td><td>$${st.rate_per_box.toFixed(3)}</td><td colspan="2"><small>see Price gaps</small></td></tr>` : ''}
        ${svc.map(x => `<tr><td class="tl">${esc(titleCase(String(x.service).trim()))}<small>last moved ${esc(x.last_changed || '—')}</small></td><td>$${x.modal_rate.toFixed(2)}</td><td>$${meds[x.servcode].toFixed(2)}</td><td>${moneyK((meds[x.servcode] - x.modal_rate) * x.units)}</td></tr>`).join('')}</tbody></table>
        <p class="src">The median across accounts, not lines; a rate under a fifth of the median is left out as a likely unit mismatch. <a href="#pricing">Pricing ›</a></p>`,
    });
  }
}
