// Pricing — Anne, desktop first, mid-task. Pick a customer (or a new one) and a service; enter a
// price. The verdict, where that price sits among every account, the cost to serve with its
// arithmetic, and what the change is worth a year. Opens prefilled from #pricing?level1=&code=.
// Every cost comes from model/rates.js; every rate and volume from the fixtures.
import { money0, moneyK } from '/components/chart.js';
import { strip, stripStats } from '/components/strip.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';

const CITADEL = 6714;
const UNDER_REVIEW = new Set(['bin', 'handling', 'movement']);
// The services Pricing can cost, with what one unit is and how it is costed.
const SERVICES = {
  B2: { fam: 'bin', unit: 'bin service', size: 'B2' }, B3: { fam: 'bin', unit: 'bin service', size: 'B3' },
  B4: { fam: 'bin', unit: 'bin service', size: 'B4' }, B5: { fam: 'bin', unit: 'bin service', size: null },
  B6: { fam: 'bin', unit: 'bin service', size: 'B6' },
  R3: { fam: 'shredbox', unit: 'box' }, R4: { fam: 'shredbox', unit: 'box' }, R5: { fam: 'shredbox', unit: 'box' },
  S3: { fam: 'shredlb', unit: 'lb' },
  S4: { fam: 'itad', unit: 'device' }, S6: { fam: 'itad', unit: 'device' }, SR: { fam: 'itad', unit: 'device' },
  '01': { fam: 'trip', unit: 'trip' }, '02': { fam: 'handling', unit: 'box' }, '90': { fam: 'handling', unit: 'box' },
  '20': { fam: 'handling', unit: 'box' }, '25': { fam: 'handling', unit: 'box' }, '30': { fam: 'handling', unit: 'box' }, '33': { fam: 'handling', unit: 'box' },
  '55': { fam: 'driver', unit: 'hour' }, S0: { fam: 'driver', unit: 'hour' }, '54': { fam: 'centre', unit: 'hour' },
  STO: { fam: 'storage', unit: 'box a month' },
};
const REVIEW_OF = { bin: 'bin', trip: 'movement', handling: 'handling' };

const CSS = `
.pr { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 16px; align-items: start; }
.pr h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0 0 14px; grid-column: 1 / -1; }
.pr .rail { position: sticky; top: 72px; }
.pr label { display: block; font-size: 12px; font-weight: 500; color: var(--ink-3); margin: 14px 0 5px; }
.pr label:first-child { margin-top: 0; }
.pr input, .pr select { width: 100%; font: inherit; font-size: 15px; padding: 9px 11px; border: 1px solid var(--rule-4); border-radius: 10px; background: var(--surface); color: var(--ink); }
.pr input:focus, .pr select:focus { outline: 2px solid color-mix(in srgb, var(--brand) 40%, transparent); border-color: var(--brand); }
.pr .price input { font-size: 30px; font-weight: 700; padding: 8px 12px; letter-spacing: -.01em; }
.pr .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pr .hint { font-size: 12px; color: var(--ink-4); margin-top: 5px; }
.pr .main > * + * { margin-top: 14px; }
.pr .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
.pr .line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; padding: 11px 0; border-top: 1px solid var(--rule); }
.pr .line:first-of-type { border-top: 0; }
.pr .line .v { font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
.pr .line .d { grid-column: 1 / -1; font-size: 12.5px; color: var(--ink-3); }
.pr .line.total { border-top: 1px solid var(--rule-ink); font-weight: 700; }
.pr .worth { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 4px 16px; align-items: baseline; padding: 11px 0; border-top: 1px solid var(--rule); }
.pr .worth:first-of-type { border-top: 0; }
.pr .worth .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pr .worth .s { grid-column: 1 / -1; font-size: 12.5px; color: var(--ink-3); }
.pr .worth.you { background: var(--well); margin: 0 -10px; padding: 11px 10px; border-radius: 10px; border-top-color: transparent; }
.pr .nocost { color: var(--ink-3); }
@media (max-width: 900px) {
  .pr { grid-template-columns: 1fr; }
  .pr h1 { font-size: 28px; }
  .pr .rail { position: static; }
  .pr .grid { grid-template-columns: 1fr; }
}`;

function injectCss() {
  if (document.getElementById('pr-css')) return;
  const s = document.createElement('style'); s.id = 'pr-css'; s.textContent = CSS; document.head.appendChild(s);
}

const median = v => v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;

export async function render(main, PR, params) {
  if (!main) return;
  injectCss();
  const [R, M] = await Promise.all([loadRates(), getJson('margin')]);

  // the book: each service's account rates; storage from storage_rate_hist's latest month
  const book = {};
  for (const r of PR.rates) {
    if (!(r.modal_rate > 0) || !(r.units > 0)) continue;
    (book[r.servcode] = book[r.servcode] || { name: r.service, rows: [] }).rows.push({ level1: r.level1, name: titleCase(r.customer), v: r.modal_rate, units: r.units, revenue: r.revenue });
  }
  book.STO = { name: 'Carton storage, per box a month', rows: PR.storage.map(s => ({ level1: s.level1, name: titleCase(s.customer), v: s.rate_per_box, units: s.boxes * 12, revenue: s.storage_billed * 12 })) };
  const codes = Object.keys(book).filter(c => book[c].rows.length >= 10)
    .sort((a, b) => (SERVICES[b] ? 1 : 0) - (SERVICES[a] ? 1 : 0) || book[b].rows.length - book[a].rows.length);
  const customers = [...new Map(PR.rates.map(r => [r.level1, titleCase(r.customer)])).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const acctOf = new Map(M.accounts.map(a => [a.level1, a]));
  const linesOf = id => M.lines.filter(l => l.level1 === id);

  const st = { level1: params.level1 ? Number(params.level1) : null, code: codes.includes(params.code) ? params.code : 'B2', price: null, units: null, visits: null, miles: R.RATES.avgMiles.v };

  main.innerHTML = `
  <div class="pr">
    <h1>Pricing</h1>
    <div class="rail card">
      <label>Customer</label>
      <select id="p-cust"><option value="">New customer or a quote</option>${customers.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select>
      <label>Service</label>
      <select id="p-code">${codes.map(c => `<option value="${c}">${esc(titleCase(book[c].name))}${SERVICES[c] ? '' : ' · no cost to serve'}</option>`).join('')}</select>
      <div class="two"><div><label id="p-units-lab">A year</label><input id="p-units" inputmode="decimal"></div><div><label>Visits a year</label><input id="p-visits" inputmode="decimal"></div></div>
      <label>Miles from the yard</label><input id="p-miles" inputmode="decimal">
      <div class="price"><label>Price</label><input id="p-price" inputmode="decimal"></div>
      <div class="hint" id="p-hint"></div>
    </div>
    <div class="main">
      <div id="p-verdict"></div>
      <div class="card"><div class="card-head"><h3 id="p-strip-title"></h3><small id="p-strip-sub"></small></div><div id="p-strip"></div><div class="src" id="p-strip-src"></div></div>
      <div class="grid">
        <div class="card"><div class="card-head"><h3 id="p-cost-title">Cost to serve</h3><small>◇ cost model</small></div><div id="p-cost"></div></div>
        <div class="card"><div class="card-head"><h3>What it is worth a year</h3><small>gross margin</small></div><div id="p-worth"></div></div>
      </div>
    </div>
  </div>`;

  const $ = id => main.querySelector('#' + id);
  $('p-cust').value = st.level1 || '';
  $('p-code').value = st.code;

  // defaults from the account's own data, or the book's median account for a quote
  function prefill() {
    const svc = SERVICES[st.code], rows = book[st.code].rows;
    const mine = rows.find(r => r.level1 === st.level1);
    const a = acctOf.get(st.level1);
    st.units = mine ? Math.round(mine.units) : Math.round(median(rows.map(r => r.units)));
    st.price = mine ? mine.v : null;
    st.visits = null;
    if (svc && svc.fam === 'bin') st.visits = a && a.visits && mine ? Math.round(a.visits * Math.min(1, mine.units / Math.max(1, a.bins || mine.units))) : Math.max(1, Math.ceil(st.units / R.RATES.unitsVisit.v));
    if (svc && svc.fam === 'itad') { const l = st.level1 && linesOf(st.level1).find(x => x.servcode === st.code); st.visits = l ? l.days : Math.max(1, Math.ceil(st.units / 4000)); }
    if (svc && svc.fam === 'trip') st.visits = st.units;
    $('p-units').value = st.units; $('p-visits').value = st.visits ?? ''; $('p-visits').disabled = st.visits == null;
    $('p-miles').value = st.miles;
    $('p-price').value = st.price != null ? (st.code === 'STO' ? st.price.toFixed(3) : st.price.toFixed(2)) : '';
    $('p-units-lab').textContent = !svc ? 'Units a year' : svc.fam === 'storage' ? 'Box-months a year' : svc.unit[0].toUpperCase() + svc.unit.slice(1) + 's a year';
    $('p-hint').textContent = mine ? `Pays $${mine.v.toFixed(st.code === 'STO' ? 3 : 2)} today, pre-filled. ${a && a.bins && svc && svc.fam === 'bin' ? `${a.bins.toLocaleString('en-US')} bin services on ${a.visits} visits in 12 months.` : ''}` : (st.level1 ? 'No rate on this service yet: a quote.' : 'A quote at the median account’s volume.');
    if (st.price == null) { st.price = median(rows.map(r => r.v)); $('p-price').value = st.price.toFixed(st.code === 'STO' ? 3 : 2); }
  }

  // cost per unit with its lines, from the cost model
  function cost() {
    const svc = SERVICES[st.code];
    if (!svc) return null;
    const u = Math.max(1, st.units || 1), v = st.visits || null, mi = st.miles || R.RATES.avgMiles.v;
    let c;
    if (svc.fam === 'bin') {
      const a = acctOf.get(st.level1);
      const lb = a && a.main_bin === st.code ? linesOf(st.level1).filter(l => l.servcode === 'S5B').reduce((t, l) => t + l.units, 0) : 0;
      const share = a && a.bins ? Math.min(1, u / a.bins) : 1;
      c = R.costToServe('bin', u, Object.assign({ visits: v, miles: mi }, lb > 0 ? { pounds: lb * share } : { binCode: svc.size }));
    } else if (svc.fam === 'handling') c = R.costToServe('handling', u);
    else if (svc.fam === 'trip') c = R.costToServe('movement', 0, { visits: v || u, miles: mi });
    else if (svc.fam === 'itad') c = R.costToServe('itad', u, { visits: v, miles: mi });
    else if (svc.fam === 'shredlb') c = R.costToServe('shred', u);
    else if (svc.fam === 'shredbox') c = R.costToServe('shred', u, { unit: 'box' });
    else if (svc.fam === 'driver') c = R.costToServe('labour', u);
    else if (svc.fam === 'centre') c = R.costToServe('labour', u, { isCentre: true });
    else if (svc.fam === 'storage') c = R.costToServe('storage', u / 12);
    if (svc.fam === 'trip') c.perUnit = c.total / u;
    if (svc.fam === 'storage') c.perUnit = c.total / u;
    return c;
  }

  function draw() {
    const rows = book[st.code].rows, svc = SERVICES[st.code];
    const dec = st.code === 'STO' ? 3 : 2, f = v => '$' + v.toFixed(dec);
    const c = cost(), unitCost = c ? c.perUnit : null;
    // storage compares box-weighted: monthly minimums make small accounts look dear per box
    const vals = rows.map(r => ({ v: r.v, name: r.name, w: st.code === 'STO' ? r.units : undefined }));
    const s = stripStats(vals), price = st.price || 0;
    const of = s.weighted ? 'boxes' : 'accounts', medName = s.weighted ? 'box-weighted median' : 'median';
    const review = svc && REVIEW_OF[svc.fam];
    const mine = rows.find(r => r.level1 === st.level1);
    const who = st.level1 ? (customers.find(x => x[0] === st.level1) || [0, ''])[1] : 'A new customer';

    // verdict
    let cls = '', lab = 'Sound', text;
    if (unitCost != null && price < unitCost) { cls = 'is-bad'; lab = 'Below cost'; text = `${f(price)} is below what this costs to serve. Cost to serve is ${f(unitCost)} a ${svc.unit}. Every one loses ${f(unitCost - price)}, and more volume makes it worse.`; }
    else if (price < s.median) { cls = 'is-warn'; lab = 'Below the median'; text = `${f(price)} earns${unitCost != null ? ` ${f(price - unitCost)} a ${svc.unit} over cost` : ''}, but sits below the ${f(s.median)} ${medName}: cheaper than ${Math.round((1 - s.below(price)) * 100)}% of ${of}.`; }
    else text = `${f(price)} is a sound price: above the ${f(s.median)} ${medName}${unitCost != null ? ` and ${f(price - unitCost)} a ${svc.unit} over cost` : ''}.`;
    $('p-verdict').innerHTML = `<div class="verdict ${cls}"><div class="lab">${lab}${review ? ' · route costs under review ◇' : ''}</div><p>${esc(text)}</p></div>`;

    // strip
    const named = rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(r => r.name);
    $('p-strip-title').textContent = `Where ${f(price)} sits among ${s.n} accounts`;
    $('p-strip-sub').textContent = `${medName} ${f(s.median)} · middle half of ${of} ${f(s.p25)}–${f(s.p75)}`;
    strip($('p-strip'), { values: vals, cost: unitCost, price, named, fmt: f });
    $('p-strip-src').textContent = st.code === 'STO' ? 'storage_rate_hist, billed ÷ boxes, latest month · one dot per account' : 'priced_lines, modal invoiced rate per account, 13 months · one dot per account';

    // cost to serve
    if (c) {
      $('p-cost-title').textContent = `Cost to serve: ${f(unitCost)} a ${svc.unit}`;
      // the first sentence says what the line is; the rate's full working is one tap away
      const split = t => { const i = t.indexOf('. '); return i > 0 ? [t.slice(0, i + 1), t.slice(i + 2)] : [t, '']; };
      $('p-cost').innerHTML = c.lines.map(l => { const [head, rest] = split(l[2]); return `<div class="line"><span>${esc(l[0])}${l[3] ? ' ◇' : ''}</span><span class="v">${money0(l[1])}</span><span class="d">${esc(head)}${rest ? ` <details style="display:inline"><summary style="display:inline;cursor:pointer;color:var(--brand)">How it is worked out</summary><span style="display:block;margin-top:4px">${esc(rest)}</span></details>` : ''}</span></div>`; }).join('')
        + `<div class="line total"><span>A year, ${Math.round(st.units).toLocaleString('en-US')} ${svc.fam === 'storage' ? 'box-months' : svc.unit + 's'}</span><span class="v">${money0(c.total)}</span></div>`
        + (review ? `<p class="hint">Route costs are under review: delivery routes are not yet in the route volumes, so visit costs run high.</p>` : '');
    } else {
      $('p-cost-title').textContent = 'Cost to serve';
      $('p-cost').innerHTML = `<p class="nocost">This is a product or a fee, not work the cost model prices. The strip shows where the price sits; margin is not computed.</p>`;
    }

    // what it is worth a year
    const units = Math.max(0, st.units || 0);
    const at = (p) => ({ rev: p * units, gm: c ? (p - unitCost) * units : null });
    const opts = [];
    opts.push({ k: 'you', label: `At ${f(price)}`, sub: 'the price entered', p: price });
    if (mine && Math.abs(mine.v - price) > 1e-9) opts.push({ k: 'now', label: `Today, ${f(mine.v)}`, sub: `what ${who} pays now`, p: mine.v });
    opts.push({ k: 'med', label: `At the ${medName}, ${f(s.median)}`, sub: s.weighted ? 'what the typical box pays' : `cheaper than half of ${s.n} accounts`, p: s.median });
    if (c) opts.push({ k: 'be', label: `Break-even, ${f(unitCost)}`, sub: 'where gross margin is zero', p: unitCost });
    const base = mine ? at(mine.v) : null;
    $('p-worth').innerHTML = opts.map(o => {
      const w = at(o.p), d = base ? w.rev - base.rev : null;
      return `<div class="worth ${o.k === 'you' ? 'you' : ''}"><span><b>${esc(o.label)}</b></span>
        <span class="v">${moneyK(w.rev)}<span class="sub" style="display:block;font-weight:400">revenue</span></span>
        <span class="v ${w.gm != null && w.gm < 0 ? 'is-bad' : ''}">${w.gm == null ? '—' : moneyK(w.gm)}<span class="sub" style="display:block;font-weight:400">margin</span></span>
        <span class="s">${esc(o.sub)}${d != null && Math.abs(d) >= 1 ? ` · ${d > 0 ? '+' : '−'}${moneyK(Math.abs(d))} a year against today` : ''}</span></div>`;
    }).join('');
  }

  const num = el => { const v = parseFloat(String(el.value).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? v : null; };
  $('p-cust').addEventListener('change', () => { st.level1 = $('p-cust').value ? Number($('p-cust').value) : null; prefill(); draw(); history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}`); });
  $('p-code').addEventListener('change', () => { st.code = $('p-code').value; prefill(); draw(); history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}`); });
  for (const [id, key] of [['p-units', 'units'], ['p-visits', 'visits'], ['p-miles', 'miles'], ['p-price', 'price']]) {
    $(id).addEventListener('input', () => { const v = num($(id)); if (v != null) { st[key] = v; draw(); } });
  }
  prefill();
  draw();
}
