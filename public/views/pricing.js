// Pricing — Anne, desktop first, mid-task. Redesigned 30 October 2026: a compact bar with a price
// slider, the verdict as a headline, the price's own P&L, and the levers that would improve it.
// Pick a customer (or a new one) and a service; enter a
// price. The verdict, where that price sits among every account, the cost to serve with its
// arithmetic, and what the change is worth a year. Opens prefilled from #pricing?level1=&code=.
// Every cost comes from model/rates.js; every rate and volume from the fixtures.
import { money0, moneyK } from '/components/chart.js';
import { strip, stripStats } from '/components/strip.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { unitSuspect } from '/components/levers.js';
import { reveal } from '/components/motion.js';

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


const median = v => v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;

export async function render(main, PR, params) {
  if (!main) return;
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
  <div class="pr pr2">
    <h1>Pricing</h1>
    <section class="h2-card pr2-bar" data-rv>
      <div class="pr2-pick">
        <label>Customer<select id="p-cust"><option value="">New customer or a quote</option>${customers.map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join('')}</select></label>
        <label>Service<select id="p-code">${codes.map(c => `<option value="${c}">${esc(c === 'STO' ? book[c].name : titleCase(book[c].name))}${SERVICES[c] ? '' : ' · no cost to serve'}</option>`).join('')}</select></label>
      </div>
      <div class="pr2-price"><label for="p-price">Price</label><input id="p-price" inputmode="decimal"><input id="p-slide" type="range" aria-label="Price" step="any"><small id="p-slide-lab"></small></div>
      <details class="pr2-vol"><summary id="p-vol-sum">Volume</summary>
        <div class="pr2-volin">
          <div id="p-freq-row"><label for="p-freq">How often we visit</label>
          <select id="p-freq"><option value="52">Weekly</option><option value="26">Every two weeks</option><option value="13">Every four weeks</option><option value="12">Monthly</option><option value="4">Quarterly</option><option value="">Other: enter visits a year</option></select></div>
          <div><label for="p-units" id="p-units-lab">A year</label><input id="p-units" inputmode="decimal"></div>
          <div><label for="p-visits">Visits a year</label><input id="p-visits" inputmode="decimal"></div>
          <div><label for="p-miles">Miles from the yard</label><input id="p-miles" inputmode="decimal"></div>
        </div><div class="hint" id="p-hint"></div></details>
    </section>
    <div id="p-verdict"></div>
    <div class="pr2-grid">
      <section class="h2-card" data-rv><div class="h2-ch"><h2 id="p-pl-title">A year at this price</h2><small>the price's own P&amp;L ◇</small></div><div id="p-pl"></div></section>
      <section class="h2-card" data-rv><div class="h2-ch"><h2>How to improve the margin</h2><small>each lever on its own, a year ◇</small></div><div id="p-levers"></div><button class="pop-ask pr2-ask" type="button" id="p-ask">Ask Claude about this price ›</button></section>
    </div>
    <section class="h2-card" data-rv><div class="h2-ch"><h2 id="p-track-title"></h2><small id="p-track-sub"></small></div><div id="p-track"></div><div class="src" id="p-strip-src"></div>
      <details class="fold"><summary><h3 id="p-strip-title">Every account on this service</h3><span class="sub" id="p-strip-sub"></span></summary><div id="p-strip" style="margin-top:var(--sp-3)"></div></details>
      <details class="fold"><summary><h3 id="p-cost-title">How the cost is worked out</h3><span class="sub">◇ cost model · open</span></summary><div id="p-cost" style="margin-top:var(--sp-3)"></div></details>
      <div id="p-worth" hidden></div>
    </section>
    <section class="h2-card book" data-rv>
      <div class="h2-ch"><h2 id="b-title">Invoiced against the book</h2><small>for each service, the share of its volume billed under the book's median, and what the median would add a year · tap to price it</small></div>
      <div id="b-rows"></div>
      <div class="src">Each account's usual invoiced rate over the last 13 months, from VCK · storage weighted by boxes · list prices are not in the database, so the book's own median is the comparison</div>
    </section>
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
    if (svc && svc.fam === 'bin') {
      if (a && a.visits && mine) st.visits = Math.round(a.visits * Math.min(1, mine.units / Math.max(1, a.bins || mine.units)));
      else { st.visits = 52; st.units = 52; }   // a new bin customer: one bin, emptied weekly
    }
    if (svc && svc.fam === 'itad') { const l = st.level1 && linesOf(st.level1).find(x => x.servcode === st.code); st.visits = l ? l.days : Math.max(1, Math.ceil(st.units / 4000)); }
    if (svc && svc.fam === 'trip') st.visits = st.units;
    $('p-units').value = st.units; $('p-visits').value = st.visits ?? ''; $('p-visits').disabled = st.visits == null;
    $('p-freq-row').hidden = st.visits == null;
    syncFreq();
    $('p-miles').value = st.miles;
    $('p-price').value = st.price != null ? (st.code === 'STO' ? st.price.toFixed(3) : st.price.toFixed(2)) : '';
    $('p-units-lab').textContent = !svc ? 'Units a year' : svc.fam === 'storage' ? 'Box-months a year' : svc.unit[0].toUpperCase() + svc.unit.slice(1) + 's a year';
    $('p-hint').textContent = mine ? `Pays $${mine.v.toFixed(st.code === 'STO' ? 3 : 2)} today, pre-filled. ${a && a.bins && svc && svc.fam === 'bin' ? `${a.bins.toLocaleString('en-US')} bin services on ${a.visits} visits in 12 months.` : ''}` : (st.level1 ? 'No rate on this service yet: a quote.' : svc && svc.fam === 'bin' ? 'A quote for one bin emptied weekly. Change the bins or how often.' : 'A quote at the typical account\'s volume.');
    if (st.price == null) { st.price = median(rows.map(r => r.v)); $('p-price').value = st.price.toFixed(st.code === 'STO' ? 3 : 2); }
  }

  // the frequency picker shows the visits a year when they match a schedule, else "Other"
  function syncFreq() {
    const v = String(Math.round(st.visits || 0));
    $('p-freq').value = [...$('p-freq').options].some(o => o.value === v) ? v : '';
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

    // verdict. Where route costs are under review, the price is judged against the book only: a
    // "below cost" built on a cost the screen itself calls provisional would cost the tool its trust.
    const sure = review ? null : unitCost;
    let cls = '', lab = 'Sound', text;
    if (sure != null && price < sure) { cls = 'is-bad'; lab = 'Below cost'; text = `${f(price)} is below what this costs to serve. Cost to serve is ${f(unitCost)} a ${svc.unit}. Every one loses ${f(unitCost - price)}, and more volume makes it worse.`; }
    else if (price < s.median) { cls = 'is-warn'; lab = 'Below the median'; text = `${f(price)} ${sure != null ? `earns ${f(price - sure)} a ${svc.unit} over cost, but ` : ''}sits below the ${f(s.median)} ${medName}: cheaper than ${Math.round((1 - s.below(price)) * 100)}% of ${of}.`; }
    else text = `${f(price)} is ${price > s.median ? 'above' : 'at'} the ${f(s.median)} ${medName}${sure != null ? ` and ${f(price - sure)} a ${svc.unit} over cost` : ''}.`;
    $('p-verdict').innerHTML = `<section class="h2-card pr2-verdict ${cls}"><span class="pr2-tag">${lab}</span><p class="pr2-head">${esc(text)}</p>${review ? `<p class="hint">Judged against the book only: the cost of a visit is under review until delivery routes are in the data, so the margin below is provisional.</p>` : ''}</section>`;

    // the track: cost to serve, the middle half of the book, its median, and the price
    $('p-track-title').textContent = `${who === 'A new customer' ? 'A quote' : who} at ${f(price)} a ${svc ? svc.unit : 'unit'}`;
    $('p-track-sub').textContent = `${s.n} accounts on this service`;
    track($('p-track'), { price, cost: sure, s, f, cls, medName, of });
    // every account, one tap away
    const named = rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(r => r.name);
    $('p-strip-title').textContent = `Every account on this service`;
    $('p-strip-sub').textContent = `${s.n} accounts · ${medName} ${f(s.median)} · open`;
    strip($('p-strip'), { values: vals, cost: sure, price, named, fmt: f });
    $('p-strip-src').textContent = st.code === 'STO' ? 'Storage billed ÷ boxes in the latest month, weighted by boxes, from VCK · cost to serve from the cost model ◇' : 'Each account\'s usual invoiced rate over the last 13 months, from VCK · cost to serve from the cost model ◇';

    // cost to serve
    if (c) {
      $('p-cost-title').textContent = review ? `The provisional cost working: ${f(unitCost)} a ${svc.unit}, under review` : `How the cost is worked out: ${f(unitCost)} a ${svc.unit}`;
      // the first sentence says what the line is; the rate's full working is one tap away
      const split = t => { const i = t.indexOf('. '); return i > 0 ? [t.slice(0, i + 1), t.slice(i + 2)] : [t, '']; };
      $('p-cost').innerHTML = c.lines.map(l => { const [head, rest] = split(l[2]); return `<div class="line"><span>${esc(l[0])}${l[3] ? ' ◇' : ''}</span><span class="v">${money0(l[1])}</span><span class="d">${esc(head)}${rest ? ` <details style="display:inline"><summary style="display:inline;cursor:pointer;color:var(--brand)">How it is worked out</summary><span style="display:block;margin-top:var(--sp-1)">${esc(rest)}</span></details>` : ''}</span></div>`; }).join('')
        + `<div class="line total"><span>A year, ${Math.round(st.units).toLocaleString('en-US')} ${svc.fam === 'storage' ? 'box-months' : svc.unit + 's'}</span><span class="v">${money0(c.total)}</span></div>`
        + (review ? `<p class="hint">Route costs are under review: delivery routes are not yet in the route volumes, so visit costs run high.</p>` : '');
    } else {
      $('p-cost-title').textContent = 'How the cost is worked out';
      $('p-cost').innerHTML = `<p class="nocost">This is a product or a fee, not work the cost model prices. The strip shows where the price sits; margin is not computed.</p>`;
    }

    // what it is worth a year
    const units = Math.max(0, st.units || 0);
    const at = (p) => ({ rev: p * units, gm: sure != null ? (p - sure) * units : null });
    const opts = [];
    opts.push({ k: 'you', label: `At ${f(price)}`, sub: 'the price entered', p: price });
    if (mine && Math.abs(mine.v - price) > 1e-9) opts.push({ k: 'now', label: `Today, ${f(mine.v)}`, sub: `what ${who} pays now`, p: mine.v });
    opts.push({ k: 'med', label: `At the ${medName}, ${f(s.median)}`, sub: s.weighted ? 'what the typical box pays' : `cheaper than half of ${s.n} accounts`, p: s.median });
    if (sure != null) opts.push({ k: 'be', label: `Break-even, ${f(sure)}`, sub: 'where gross margin is zero', p: sure });
    const base = mine ? at(mine.v) : null;
    // the column names once, at the top; each row's caption sits under its name, on the left
    $('p-worth').innerHTML = '<div class="worth head"><span></span><span class="v">Revenue</span><span class="v">Margin ◇</span></div>' + opts.map(o => {
      const w = at(o.p), d = base ? w.rev - base.rev : null;
      return `<div class="worth ${o.k === 'you' ? 'you' : ''}"><span><b>${esc(o.label)}</b><span class="s">${esc(o.sub)}${d != null && Math.abs(d) >= 1 ? ` · ${d > 0 ? '+' : '−'}${moneyK(Math.abs(d))} a year against today` : ''}</span></span>
        <span class="v">${moneyK(w.rev)}</span>
        <span class="v ${w.gm != null && w.gm < 0 ? (review ? 'is-warn' : 'is-bad') : ''}">${w.gm == null ? '—' : moneyK(w.gm)}</span></div>`;
    }).join('');

    // the mini P&L: revenue, each cost line, what is left. The cost lines are for the volume entered.
    const units2 = Math.max(0, st.units || 0), rev = price * units2;
    $('p-pl-title').textContent = `${moneyK(rev)} a year at ${f(price)}`;
    if (c) {
      const lines = c.lines.map(l => ({ name: l[0], v: l[1] })), costT = lines.reduce((t, l) => t + l.v, 0), left = rev - costT;
      const max = Math.max(rev, costT, 1);
      $('p-pl').innerHTML = `<ul class="pr2-pl">
        <li class="rev"><span>Revenue</span><i style="--w:${(rev / max * 100).toFixed(1)}%"></i><b>${money0(rev)}</b></li>
        ${lines.map(l => `<li class="cost"><span>${esc(l.name)}</span><i style="--w:${(l.v / max * 100).toFixed(1)}%"></i><b>−${money0(l.v)}</b></li>`).join('')}
        <li class="left ${review ? 'review' : left < 0 ? 'neg' : ''}"><span>${review ? 'Left, provisional' : 'Gross margin'}</span><i style="--w:${(Math.abs(left) / max * 100).toFixed(1)}%"></i><b>${left < 0 ? '−' : ''}${money0(Math.abs(left))}</b></li></ul>
        <p class="pr2-pc">${rev > 0 ? `<b class="${left < 0 && !review ? 'is-bad' : ''}">${Math.round(left / rev * 100)}%</b> of revenue kept ◇` : ''}${review ? ' · route costs under review' : ''}</p>`;
      // the levers, each on its own
      const lv = [];
      if (price < s.median) lv.push({ t: `Move to the ${medName}, ${f(s.median)}`, v: (s.median - price) * units2, s: `${Math.round((1 - s.below(price)) * 100)}% of ${of} pay more` });
      if (sure != null && rev > 0 && left / rev < .4) { const p40 = sure / .6; if (p40 > price) lv.push({ t: `Price for a 40% margin, ${f(p40)}`, v: (p40 - price) * units2, s: p40 > s.p75 ? 'above three-quarters of the book: a hard conversation' : 'still inside the book' }); }
      if (st.visits && st.visits >= 24 && svc && ['bin', 'trip', 'itad'].includes(svc.fam)) {
        const keep = { ...st }; st.visits = Math.round(st.visits / 2); const c2 = cost(); Object.assign(st, keep);
        if (c2 && c.total - c2.total > 0) lv.push({ t: `Visit half as often, ${Math.round(st.visits / 2)} a year`, v: c.total - c2.total, s: 'the same bins or units, fewer trips' + (review ? ' · route cost under review' : '') });
      }
      if (st.miles > 12 && svc && ['bin', 'trip', 'itad'].includes(svc.fam)) {
        const keep = { ...st }; st.miles = 8; const c3 = cost(); Object.assign(st, keep);
        if (c3 && c.total - c3.total > 0) lv.push({ t: 'Serve it on a day a route is already nearby', v: c.total - c3.total, s: `as if ${Math.round(st.miles)} miles out were 8${review ? ' · route cost under review' : ''}` });
      }
      lv.sort((x, y) => y.v - x.v);
      $('p-levers').innerHTML = lv.length ? `<ul class="pr2-lv">${lv.map(l => `<li><span><b>${esc(l.t)}</b><small>${esc(l.s)}</small></span><em>+${moneyK(l.v)}</em></li>`).join('')}</ul>` : '<p class="hint">Nothing obvious: the price is at or above the book and keeps a healthy margin.</p>';
    } else {
      $('p-pl').innerHTML = `<p class="nocost">A product or fee the cost model does not price: ${moneyK(rev)} of revenue a year, no cost shown.</p>`;
      $('p-levers').innerHTML = price < s.median ? `<ul class="pr2-lv"><li><span><b>Move to the ${medName}, ${f(s.median)}</b></span><em>+${moneyK((s.median - price) * units2)}</em></li></ul>` : '<p class="hint">At or above the book.</p>';
    }
    $('p-ask').dataset.q = `${who === 'A new customer' ? 'For a new customer' : who}: is ${f(price)} a ${svc ? svc.unit : 'unit'} right for ${st.code === 'STO' ? 'storage' : titleCase(book[st.code].name)}, and how do we improve the margin?`;
    // the slider follows the book: from half the bottom quarter to well past the top
    const sl = $('p-slide'), lo = Math.max(0, Math.min(s.p25 * .5, unitCost || Infinity, price)), hi = Math.max(s.p75 * 1.6, (unitCost || 0) * 1.3, price);
    sl.min = lo; sl.max = hi; if (document.activeElement !== sl) sl.value = price;
    $('p-slide-lab').textContent = `${f(lo)} to ${f(hi)} · median ${f(s.median)}`;
    $('p-vol-sum').textContent = `Volume: ${Math.round(st.units || 0).toLocaleString('en-US')} ${svc ? (svc.fam === 'storage' ? 'box-months' : svc.unit + 's') : 'units'} a year${st.visits ? ` on ${Math.round(st.visits)} visits` : ''} · change`;
  }

  const num = el => { const v = parseFloat(String(el.value).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? v : null; };
  $('p-cust').addEventListener('change', () => { st.level1 = $('p-cust').value ? Number($('p-cust').value) : null; prefill(); draw(); history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}`); });
  $('p-code').addEventListener('change', () => { st.code = $('p-code').value; prefill(); draw(); history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}`); });
  for (const [id, key] of [['p-units', 'units'], ['p-visits', 'visits'], ['p-miles', 'miles'], ['p-price', 'price']]) {
    $(id).addEventListener('input', () => {
      const v = num($(id)); if (v == null) return;
      st[key] = v; if (key === 'visits') syncFreq();
      $('p-hint').textContent = 'Your own figures.';
      draw();
    });
  }
  $('p-slide').addEventListener('input', () => { st.price = Number($('p-slide').value); $('p-price').value = st.price.toFixed(st.code === 'STO' ? 3 : 2); draw(); });
  $('p-ask').addEventListener('click', e => dispatchEvent(new CustomEvent('open-ask', { detail: { ask: e.currentTarget.dataset.q } })));
  // a schedule sets the visits; the bins (or units) each visit stay the same
  $('p-freq').addEventListener('change', () => {
    const f = Number($('p-freq').value); if (!f) { $('p-visits').focus(); return; }
    const per = st.visits ? st.units / st.visits : 1;
    st.visits = f; st.units = Math.max(1, Math.round(per * f));
    $('p-visits').value = st.visits; $('p-units').value = st.units;
    $('p-hint').textContent = 'Your own figures.';
    draw();
  });
  // invoiced against the book: each priced service, the share of its volume under the median and
  // what the median would add a year
  const bookRows = codes.map(code => {
    const rs = book[code].rows, weighted = code === 'STO';
    const st2 = stripStats(rs.map(r => ({ v: r.v, w: weighted ? r.units : undefined })));
    const under = rs.filter(r => r.v < st2.median && r.level1 !== CITADEL && !unitSuspect(r.v, st2.median));
    const vol = rs.reduce((t, r) => t + r.units, 0), uvol = under.reduce((t, r) => t + r.units, 0);
    const gap = under.reduce((t, r) => t + (st2.median - r.v) * r.units, 0);
    return { code, name: code === 'STO' ? book[code].name : titleCase(book[code].name), n: rs.length, med: st2.median, share: vol ? uvol / vol : 0, gap, under: under.length };
  }).filter(r => r.n >= 20 && r.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 14);
  $('b-title').textContent = bookRows.length ? `${bookRows[0].name} carries the biggest gap to the book: ${moneyK(bookRows[0].gap)} a year` : 'Invoiced against the book';
  $('b-rows').innerHTML = bookRows.map(r => `<div class="brow" data-code="${r.code}">
    <span class="nm">${esc(r.name)}<small>${r.under} of ${r.n} accounts under the $${r.med.toFixed(r.code === 'STO' ? 3 : 2)} median</small></span>
    <span class="bar" title="${Math.round(r.share * 100)}% of the volume billed under the median"><i style="width:${r.share * 100}%"></i></span>
    <span class="v">+${moneyK(r.gap)}<small>${Math.round(r.share * 100)}% of volume under</small></span><span class="go">›</span></div>`).join('');
  $('b-rows').addEventListener('click', ev => {
    const row = ev.target.closest('.brow'); if (!row) return;
    st.code = row.dataset.code; $('p-code').value = st.code; prefill(); draw();
    history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  prefill();
  draw();
  reveal(main.querySelector('.pr2'));
}

// One line from zero to the top of the book: the loss zone below cost to serve, the middle half of
// accounts, the median, and the price as a pin in its verdict colour.
function track(el, { price, cost, s, f, cls, medName, of }) {
  if (!el) return;
  const hi = Math.max(s.p90 || s.max, price, cost || 0, s.median) * 1.12;
  const x = v => Math.max(0, Math.min(100, v / hi * 100));
  const ticks = [{ v: s.median, t: `${medName} ${f(s.median)}`, c: '' }];
  if (cost != null) ticks.push({ v: cost, t: `cost to serve ${f(cost)}`, c: 'cost' });
  // labels above and below, so two close ticks never collide
  ticks.sort((a, b) => a.v - b.v);
  el.innerHTML = `<div class="trk">
    <div class="base"></div>
    ${cost != null ? `<div class="loss" style="width:${x(cost)}%"></div>` : ''}
    <div class="mid" style="left:${x(s.p25)}%;width:${Math.max(.5, x(s.p75) - x(s.p25))}%" title="middle half of ${of}: ${f(s.p25)} to ${f(s.p75)}"></div>
    ${ticks.map((t, i) => `<div class="tk ${t.c}" style="left:${x(t.v)}%"></div><div class="tl ${t.c} ${i % 2 ? 'up' : 'dn'}" style="left:${x(t.v)}%">${esc(t.t)}</div>`).join('')}
    <div class="pin ${cls}" style="left:${x(price)}%"><b>${f(price)}</b><i></i></div>
  </div>
  <div class="sub" style="margin-top:var(--sp-1)">The grey band is where the middle half of ${of} sit, ${f(s.p25)} to ${f(s.p75)}.${cost != null ? ' The striped red stretch is below the cost to serve ◇.' : ''} ${price < s.median ? `Cheaper than ${Math.round((1 - s.below(price)) * 100)}% of ${of}.` : price > s.median ? `Dearer than ${Math.round(s.below(price) * 100)}% of ${of}.` : `At the ${medName}.`}</div>`;
}
