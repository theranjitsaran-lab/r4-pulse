// Quote, Anne's screen (#pricing). Rebuilt 3 November 2026: four figures that stay in view, then one question at a
// time. What are we quoting, where is it, where does the price go, and is there a better way to price it. Under those:
// the lines of the deal, the working, and the book. Opens prefilled from #pricing?level1=&code=&postcode=.
// Every cost comes from components/quote.js (lineCost, quoteOptions), the same functions Ask reads; every rate and
// volume from the fixtures. Margins stay for whoever sees costs; the rest of the screen works without them.
import * as Fmt from '/components/format.js';
import { money0, moneyK } from '/components/chart.js';
import { strip, stripStats } from '/components/strip.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { unitSuspect } from '/components/levers.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { SERVICES, nearestRoute, marginLabel, quoteOptions, quoteFacts, routeLabel, dayLabel, RIDE_MILES } from '/components/quote.js';
import { costsVisible, NOT_READY, whoAmI } from '/components/access.js';
import { openPop, closePop } from '/components/pop.js';
import { dataTable } from '/components/datatable.js';
import { isInternal } from '/components/metrics.js';
import { YARD, dist, loadRoadnet, loadBasemap } from '/components/routemap.js';
import { loadZones, bookShading, zoneKey } from '/components/mapkit.js';
import { drawQuoteMap } from '/components/quotemap.js';
import { checkNumbers, parseQuote } from '/components/summary.js';

const CITADEL = 6714;
const FREQ = [['Weekly', 52], ['Every 2 weeks', 26], ['Monthly', 12], ['On call', 6]];
const median = v => v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : null;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const signed = (v, f) => (v < 0 ? '−' : '') + f(Math.abs(v));
const m2 = v => signed(v, x => Fmt.money(x, { dp: 2 })), mk = v => signed(v, moneyK), pc = v => signed(v, Fmt.pct);
// a figure runs to its new value when anything changes (Theran's brief for this screen); the end value is always set
const counts = new WeakMap();
function countTo(e, to, fmt) {
  if (!e) return;
  const was = counts.get(e); counts.set(e, to);
  if (reduced() || was == null || was === to) { e.textContent = fmt(to); return; }
  let t0 = null;
  const step = ts => { if (counts.get(e) !== to) return; if (t0 === null) t0 = ts; const t = Math.min(1, (ts - t0) / 500); e.textContent = fmt(was + (to - was) * (1 - Math.pow(1 - t, 3))); if (t < 1 && e.isConnected) requestAnimationFrame(step); else e.textContent = fmt(to); };
  requestAnimationFrame(step);
}

export async function render(main, PR, params) {
  if (!main) return;
  const json = u => fetch(u, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
  const [R, M, QR, Z, base, zones] = await Promise.all([loadRates(), getJson('margin'), getJson('view/quote-routes').catch(() => null), json('/data/zcta.json'), loadBasemap(), loadZones(), loadRoadnet().catch(() => null)]);
  const shading = bookShading(QR || { postcodes: [] }, Z);

  // the book: each service's account rates; storage from storage_rate_hist's latest month
  const book = {};
  for (const r of PR.rates) {
    if (!(r.modal_rate > 0) || !(r.units > 0)) continue;
    (book[r.servcode] = book[r.servcode] || { name: r.service, rows: [] }).rows.push({ level1: r.level1, name: titleCase(r.customer), v: r.modal_rate, units: r.units, revenue: r.revenue });
  }
  book.STO = { name: 'Carton storage, per box a month', rows: PR.storage.map(s => ({ level1: s.level1, name: titleCase(s.customer), v: s.rate_per_box, units: s.boxes * 12, revenue: s.storage_billed * 12 })) };
  const codes = Object.keys(book).filter(c => book[c].rows.length >= 10)
    .sort((a, b) => (SERVICES[b] ? 1 : 0) - (SERVICES[a] ? 1 : 0) || book[b].rows.length - book[a].rows.length);
  // who can be quoted: R4's own accounts and placeholders out, one entry per name (the account with the most on it)
  const spend = new Map();
  for (const r of PR.rates) spend.set(r.level1, (spend.get(r.level1) || 0) + (r.revenue || 0));
  const byName = new Map();
  for (const r of PR.rates) { const n = titleCase(r.customer); if (isInternal(n)) continue; const cur = byName.get(n); if (cur == null || spend.get(r.level1) > spend.get(cur)) byName.set(n, r.level1); }
  const customers = [...byName.entries()].map(([n, id]) => [id, n]).sort((a, b) => a[1].localeCompare(b[1]));
  // what can be quoted: services the cost model prices, one entry per name
  const svcName = c => c === 'STO' ? book[c].name : titleCase(book[c].name).replace(/\s+/g, ' ');
  const svcByName = new Map();
  for (const c of codes) { if (!SERVICES[c]) continue; const n = svcName(c), cur = svcByName.get(n); if (cur == null || book[c].rows.length > book[cur].rows.length) svcByName.set(n, c); }

  const acctOf = new Map(M.accounts.map(a => [a.level1, a]));
  const linesOf = id => M.lines.filter(l => l.level1 === id);
  const costs = costsVisible();

  const st = { level1: params.level1 ? Number(params.level1) : null, code: codes.includes(params.code) ? params.code : 'B2', price: null, units: null, visits: null, bins: 1, miles: R.RATES.avgMiles.v, postcode: /^\d{5}$/.test(params.postcode || '') ? params.postcode : null, opt: 'now', own: null };

  main.innerHTML = `
  <div class="pr pr2 pq h2">
    <h1>Quote</h1>
    <section class="pq-kpis" aria-label="This quote, est." aria-live="polite">
      <div class="h2-kpi"><span>Price</span><b id="k-price"></b><small id="k-price-s"></small></div>
      <div class="h2-kpi"><span>Revenue a year</span><b id="k-rev"></b><small id="k-rev-s"></small></div>
      ${costs ? `<div class="h2-kpi"><span>Margin a year est.</span><b id="k-mar"></b><small>after what it costs to serve</small></div>
      <div class="h2-kpi lead"><span>Margin est.</span><b id="k-pct"></b><small><span class="pq-tag" id="k-tag"></span></small></div>` : ''}
    </section>

    <section class="h2-card" data-in aria-labelledby="pq-what">
      <div class="h2-ch"><h2 id="pq-what">1. What are we quoting?</h2></div>
      <div class="pq-what">
        <label>Customer<input id="p-cust" list="p-cust-l" type="search" placeholder="A name, or leave blank for a new one" autocomplete="off"><datalist id="p-cust-l">${customers.map(([, n]) => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
        <label>Service<select id="p-code">${[...svcByName].map(([n, c]) => `<option value="${esc(c)}">${esc(n)}</option>`).join('')}</select></label>
        <div id="p-binbox"><span class="pq-lab">Bins each visit</span><div class="pq-step"><button type="button" id="p-minus" aria-label="Fewer bins">−</button><output id="p-bins"></output><button type="button" id="p-plus" aria-label="More bins">+</button></div></div>
        <div id="p-freqbox"><span class="pq-lab">How often</span><div class="pq-pills" id="p-freq" role="group" aria-label="How often"></div></div>
        <label id="p-unitbox" hidden><span id="p-units-lab">Units a year</span><input id="p-units" inputmode="decimal"></label>
      </div>
      <div class="pq-price">
        <label><span>Price<span id="p-price-unit"></span></span><input id="p-price" inputmode="decimal"></label>
        <div class="pq-band">
          <div class="pq-bt"></div><div class="pq-bm" id="p-bmid"></div><div class="pq-bx" id="p-bmed"></div>
          <div class="pq-note" id="p-note"></div>
          <input id="p-slide" type="range" aria-label="Price" step="any">
          <div class="pq-bl" id="p-bmedl"></div>
        </div>
      </div>
      <p class="hint" id="p-hint"></p>
    </section>

    <div class="pq-split">
      <section class="h2-card" data-in aria-labelledby="pq-where" id="p-where">
        <div class="pq-mh"><div class="h2-ch"><h2 id="pq-where">2. Where is it?</h2><small id="p-where-s">Tap the map or type a postcode</small></div>
          <form class="pq-pc" id="p-pcf"><label>Postcode<input id="p-pc" inputmode="numeric" maxlength="5" placeholder="e.g. 60617"></label><button type="submit" class="pq-btn">Find</button></form></div>
        <div id="p-map"></div>
        <p class="hint" id="p-map-msg" role="status"></p>
        ${zoneKey()}
        <div class="pq-mk"><span><i class="r"></i>The route day that passes nearby</span><span><i class="o"></i>On its own, from the yard</span></div>
        <p class="src">Routes join recorded stops in order along the main roads, from postcode centres. Not GPS, which was never captured.</p>
      </section>
      <section class="h2-card" data-in aria-labelledby="pq-goes" id="p-goes">
        <div class="h2-ch"><h2 id="pq-goes">3. Where the price goes</h2><small id="p-goes-s"></small></div>
        ${costs ? `<p class="pq-line" id="p-line"></p>
        <div class="pq-stack" id="p-stack" role="img"></div>
        <div class="pq-skey" id="p-skey"></div>
        <ul class="pq-why" id="p-why"></ul>
        <p class="src" id="p-by"></p>` : `<div class="pending">${esc(NOT_READY)}</div>`}
      </section>
    </div>

    <section class="h2-card" data-in aria-labelledby="pq-opt">
      <div class="h2-ch"><h2 id="pq-opt">4. Better ways to price it</h2><small>Same customer, same site. Tap one to try it.</small></div>
      <div class="pq-opts" id="p-opts"></div>
      <div class="pq-foot"><span class="hint" id="p-year"></span><span class="pq-acts"><button type="button" class="pq-btn" id="p-ask">Ask about this price</button><button type="button" class="q-add" id="q-add">Add this line to the quote</button></span></div>
    </section>

    <section class="h2-card pr2-quote" data-in id="q-card">
      <div class="h2-ch"><h2 id="q-title">The quote</h2></div>
      <div id="q-body"></div>
    </section>

    <section class="h2-card" data-in>
      <details class="fold"><summary><h3 id="p-strip-title">Every account on this service</h3><span class="sub" id="p-strip-sub"></span></summary><div id="p-strip" style="margin-top:var(--sp-3)"></div><div class="src" id="p-strip-src"></div></details>
      ${costs ? '<details class="fold"><summary><h3 id="p-cost-title">How the cost is worked out</h3><span class="sub">est. cost model</span></summary><div id="p-cost" style="margin-top:var(--sp-3)"></div></details>' : ''}
    </section>

    <section class="h2-card book" data-in>
      <details class="fold pq-book"><summary><h3 id="b-title">Prices under the book</h3><span class="sub" id="b-sub"></span></summary>
        <p class="pq-explain">Not about this quote: it looks across every account. "The book" is what R4's accounts really pay. For each service, the table counts the accounts paying under the middle price, and adds up what R4 would bill in a year if each of them moved up to it. It is the most there is to win, not a forecast. Tap a service to see the accounts behind its number.</p>
        <div id="b-rows"></div>
        <div class="src">Each account's usual invoiced rate over the last 13 months, from VCK. Storage is weighted by boxes. List prices are not in the database, so the book's own median is the comparison.</div>
      </details>
    </section>
  </div>`;

  const $ = id => main.querySelector('#' + id);
  const stayPut = () => { const m = document.querySelector('.mast'); main.querySelector('.pq').style.setProperty('--pq-top', (m ? m.offsetHeight : 0) + 'px'); };
  stayPut(); addEventListener('resize', stayPut, { passive: true });
  $('p-cust').value = st.level1 ? (customers.find(x => x[0] === st.level1) || [0, ''])[1] : '';
  // a service reached from the book table may not be on the list: it joins it
  const showCode = () => { const el = $('p-code'); if (![...el.options].some(o => o.value === st.code)) el.add(new Option(svcName(st.code), st.code)); el.value = st.code; };
  showCode();
  $('p-cust').addEventListener('focus', e => e.target.select());
  const isBin = () => (SERVICES[st.code] || {}).fam === 'bin';
  const hasPlace = () => ['bin', 'trip', 'itad'].includes((SERVICES[st.code] || {}).fam);
  const dec = () => st.code === 'STO' ? 3 : 2;

  // defaults from the account's own data, or one bin emptied weekly for a new customer
  function prefill() {
    const svc = SERVICES[st.code], rows = book[st.code].rows, mine = rows.find(r => r.level1 === st.level1), a = acctOf.get(st.level1);
    const own = R.routeFor && R.routeFor(st.level1);
    st.opt = 'now'; st.own = null;
    st.units = mine ? Math.round(mine.units) : Math.round(median(rows.map(r => r.units)));
    st.price = mine ? mine.v : median(rows.map(r => r.v));
    st.visits = null;
    if (svc && svc.fam === 'bin') {
      if (mine && (own || (a && a.visits))) { st.visits = own ? own.days : a.visits; st.own = st.visits; st.bins = st.units / st.visits; }
      else { st.visits = 52; st.bins = 1; st.units = 52; }
    } else if (svc && svc.fam === 'itad') { const l = st.level1 && linesOf(st.level1).find(x => x.servcode === st.code); st.visits = l ? l.days : Math.max(1, Math.ceil(st.units / 4000)); }
    else if (svc && svc.fam === 'trip') st.visits = st.units;
    if (st.level1 && QR && QR.acctPc[st.level1] && Z[QR.acctPc[st.level1]]) st.postcode = QR.acctPc[st.level1];
    $('p-pc').value = st.postcode || '';
    setMiles();
    $('p-units').value = st.units;
    $('p-price').value = Fmt.fixed(st.price, dec());
    $('p-units-lab').textContent = !svc ? 'Units a year' : svc.fam === 'storage' ? 'Box-months a year' : svc.unit[0].toUpperCase() + svc.unit.slice(1) + 's a year';
    $('p-hint').textContent = mine ? `Pays ${Fmt.money(mine.v, { dp: dec() })} today, pre-filled${isBin() && st.own ? `, on its ${Fmt.num(st.own)} visits in twelve months` : ''}.` : st.level1 ? 'No rate on this service yet: a quote.' : isBin() ? 'A new customer: one bin, emptied weekly. Change what you need.' : "A new customer at the typical account's volume.";
    drawFreq();
  }
  const setMiles = () => { if (st.postcode && Z[st.postcode]) st.miles = Math.round(dist(YARD, Z[st.postcode]) * 10) / 10; };
  function drawFreq() {
    const list = st.own ? [[`Today, ${Fmt.num(st.own)} a year`, st.own], ...FREQ] : FREQ;
    $('p-freq').innerHTML = list.map(([t, v]) => `<button type="button" data-v="${v}" aria-pressed="${v === st.visits}">${esc(t)}</button>`).join('');
  }

  const context = near => ({ acct: acctOf.get(st.level1) || null, lines: st.level1 ? linesOf(st.level1) : [], Z, near, band: bandNow() });
  const bandNow = () => { const rows = book[st.code].rows; return stripStats(rows.map(r => ({ v: r.v, name: r.name, w: st.code === 'STO' ? r.units : undefined }))); };
  const nearNow = () => hasPlace() && st.postcode ? nearestRoute(QR, Z, st.postcode, st.level1) : null;
  const allOptions = () => { const near = nearNow(); return { near, list: quoteOptions(R, { ...st }, context(near)) }; };
  const chosen = () => { const { list } = allOptions(); return list.find(o => o.id === st.opt && !o.off) || list[0]; };

  let lastPc = null, firstMap = true, sumTimer = null, sumSeq = 0;
  function update() {
    const { near, list } = allOptions();
    if (st.opt !== 'now' && (list.find(o => o.id === st.opt) || {}).off) st.opt = 'now';
    const o = list.find(x => x.id === st.opt) || list[0], svc = SERVICES[st.code], s = bandNow(), unit = svc ? svc.unit : 'unit', bin = isBin();
    // what is being quoted
    $('p-binbox').hidden = !bin; $('p-freqbox').hidden = !bin; $('p-unitbox').hidden = bin;
    $('p-bins').textContent = Fmt.fixed(st.bins, st.bins % 1 ? 1 : 0);
    $('p-minus').disabled = st.bins <= 1;
    $('p-freq').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === st.visits)));
    $('p-price-unit').textContent = bin ? ' a bin' : ` a ${unit}`;
    // the band: the real middle half and median for this service
    const lo = Math.max(0, Math.min(s.p25 * .5, st.price)), hi = Math.max(s.p75 * 1.6, st.price), pos = v => (v - lo) / (hi - lo || 1) * 100;
    const sl = $('p-slide'); sl.min = lo; sl.max = hi; if (document.activeElement !== sl) sl.value = st.price;
    $('p-bmid').style.cssText = `left:${pos(s.p25).toFixed(2)}%;width:${Math.max(.6, pos(s.p75) - pos(s.p25)).toFixed(2)}%`;
    $('p-bmed').style.left = pos(s.median).toFixed(2) + '%';
    $('p-bmedl').style.left = Math.min(82, Math.max(14, pos(s.median))).toFixed(2) + '%';
    const nm = s.weighted ? 'box-weighted median' : 'median';
    $('p-bmedl').textContent = `${nm} ${Fmt.money(s.median, { dp: dec() })}, middle half ${Fmt.money(s.p25, { dp: dec() })} to ${Fmt.money(s.p75, { dp: dec() })}`;
    const note = $('p-note'), under = st.price < s.p25, over = st.price > s.p75;
    note.textContent = under ? 'Under most accounts' : over ? 'Above most accounts' : 'In the middle half';
    note.className = 'pq-note' + (under ? ' is-warn' : '');
    note.style.left = Math.min(84, Math.max(16, pos(st.price))).toFixed(2) + '%';
    // the four figures
    const os = o.st;
    countTo($('k-price'), os.price, v => Fmt.money(v, { dp: dec() }));
    $('k-price-s').textContent = bin ? `a bin, ${Fmt.fixed(os.bins, os.bins % 1 ? 1 : 0)} bin${os.bins === 1 ? '' : 's'} a visit` : `a ${unit}`;
    countTo($('k-rev'), o.yrev, moneyK);
    $('k-rev-s').textContent = os.visits ? `${Fmt.num(os.visits)} visits a year` : `${Fmt.num(os.units)} ${svc && svc.fam === 'storage' ? 'box-months' : unit + 's'} a year`;
    if (costs) {
      const lab = marginLabel(R, o.m);
      countTo($('k-mar'), o.year ?? 0, mk); $('k-mar').classList.toggle('is-bad', (o.year ?? 0) < 0);
      if (o.m == null) { counts.delete($('k-pct')); $('k-pct').textContent = '—'; } else countTo($('k-pct'), o.m, pc);
      $('k-pct').classList.toggle('is-bad', lab.cls === 'loss'); $('k-pct').classList.toggle('is-warn', lab.cls === 'thin');
      $('k-tag').className = 'pq-tag ' + lab.cls; $('k-tag').textContent = lab.word || 'not costed';
    }
    // where
    $('p-where').hidden = !hasPlace(); main.querySelector('.pq-split').classList.toggle('one', !hasPlace());
    const moved = lastPc !== st.postcode, useRoute = o.c && o.c.routeBasis === 'ride';
    if (hasPlace() && QR) {
      drawQuoteMap($('p-map'), { Z, base, zones, shading, postcode: st.postcode, near, useRoute: useRoute || (o.c && o.c.routeBasis !== 'yard' && near && near.carries), onPick: pick, moved: moved && !!st.postcode, first: firstMap });
      firstMap = false;
      $('p-where-s').textContent = !st.postcode ? "Tap the map or type a postcode. Until then it is costed at the book's average stop." : near && near.carries ? `${routeLabel(near.route)} calls ${near.miles < .05 ? 'in this postcode' : `${Fmt.fixed(near.miles, 1)} mi away`} on ${dayLabel(near.dow)}` : o.c && o.c.routeBasis === 'nearby' ? `No route calls within ${RIDE_MILES} mi regularly. Costed on the occasional stops nearby.` : `No route calls within ${RIDE_MILES} mi: on its own from the yard`;
    }
    lastPc = st.postcode;
    // where the price goes
    if (costs) {
      if (o.c) {
        const p = o.parts, rev = o.rev, cost = p.cost, left = rev - cost, tot = Math.max(rev, cost, .01), perWord = os.visits ? 'visit' : unit;
        $('p-goes-s').textContent = `${o.t}: a ${perWord}, est.`;
        $('p-line').textContent = `At ${Fmt.money(os.price, { dp: dec() })} ${bin ? 'a bin' : `a ${unit}`}, R4 ${left >= 0 ? 'keeps' : 'is short by'} ${Fmt.money(Math.abs(left), { dp: 2 })} a ${perWord}, ${mk(o.year)} a year on ${mk(o.yrev)} of revenue.`;
        const segs = [['q-s-t', 'Getting there', p.travel], ['q-s-s', 'Time on site', p.time], ['q-s-p', 'Shredding', p.plant], ['q-s-o', 'The work', p.other]].filter(x => x[2] > .005);
        let at = 0;
        const bar = segs.map(([cls, , v]) => { const h = `<i class="${cls}" style="transform:translateX(${(at / tot * 100).toFixed(2)}%) scaleX(${(v / tot).toFixed(4)})"></i>`; at += v; return h; }).join('');
        const last = left >= 0 ? `<i class="q-s-l" style="transform:translateX(${(at / tot * 100).toFixed(2)}%) scaleX(${(left / tot).toFixed(4)})"></i>` : `<i class="q-s-x" style="transform:translateX(${(rev / tot * 100).toFixed(2)}%) scaleX(${(-left / tot).toFixed(4)})"></i>`;
        $('p-stack').innerHTML = bar + last;
        $('p-stack').setAttribute('aria-label', `${segs.map(x => `${x[1]} ${Fmt.money(x[2], { dp: 2 })}`).join(', ')}, ${left >= 0 ? 'left for R4' : 'short'} ${Fmt.money(Math.abs(left), { dp: 2 })}`);
        $('p-skey').innerHTML = [...segs.map(([cls, n, v]) => [cls, n, Fmt.money(v, { dp: 2 })]), [left >= 0 ? 'q-s-l' : 'q-s-x', left >= 0 ? 'Left for R4' : 'Short', Fmt.money(Math.abs(left), { dp: 2 })]].map(([cls, n, v]) => `<span><i class="${cls}"></i>${esc(n)}<b>${esc(v)}</b></span>`).join('');
        drawSummary(o, list, near, s);
      } else {
        $('p-goes-s').textContent = '';
        $('p-line').textContent = `A product or a fee, not work the cost model prices: ${mk(o.yrev)} of revenue a year, no cost shown.`;
        $('p-stack').innerHTML = ''; $('p-skey').innerHTML = ''; $('p-why').innerHTML = ''; $('p-by').textContent = '';
      }
    }
    // the four ways
    const maxY = Math.max(1, ...list.filter(x => !x.off && x.year != null).map(x => Math.abs(x.year)));
    $('p-opts').innerHTML = list.map(x => `<button type="button" class="pq-opt" data-o="${x.id}" aria-pressed="${x.id === o.id}" ${x.off ? 'disabled' : ''}>${x.best && costs ? '<span class="pq-best">Best for R4</span>' : ''}<span class="t">${esc(x.t)}</span><span class="d">${esc(x.off || x.d)}</span>${costs && !x.off && x.m != null ? `<span class="m ${x.m < 0 ? 'is-bad' : ''}">${pc(x.m)}</span><span class="y">${mk(x.year)} a year left est., on ${mk(x.yrev)}</span><span class="pq-mbar"><i class="${x.year < 0 ? 'neg' : ''}" style="--s:${Math.max(.02, Math.abs(x.year) / maxY).toFixed(3)}"></i></span>` : !x.off ? `<span class="y">${mk(x.yrev)} a year</span>` : ''}</button>`).join('');
    $('p-year').textContent = costs && o.year != null ? `${o.t}: ${mk(o.yrev)} revenue and ${mk(o.year)} left a year, est.` : `${o.t}: ${mk(o.yrev)} a year.`;
    const who = st.level1 ? (customers.find(x => x[0] === st.level1) || [0, ''])[1] : 'For a new customer';
    $('p-ask').dataset.q = `${who}: is ${Fmt.money(os.price, { dp: dec() })} a ${unit} right for ${st.code === 'STO' ? 'storage' : titleCase(book[st.code].name)}${st.postcode ? ` in ${st.postcode}` : ''}, and how do we improve the margin?`;
    // the working, one tap away
    const rows = book[st.code].rows, vals = rows.map(r => ({ v: r.v, name: r.name, w: st.code === 'STO' ? r.units : undefined }));
    $('p-strip-sub').textContent = `${s.n} accounts, ${nm} ${Fmt.money(s.median, { dp: dec() })}`;
    strip($('p-strip'), { values: vals, cost: costs && o.c ? o.c.total / Math.max(1, os.units) : null, price: os.price, named: rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(r => r.name), fmt: v => Fmt.money(v, { dp: dec() }) });
    $('p-strip-src').textContent = st.code === 'STO' ? 'Storage billed ÷ boxes in the latest month, weighted by boxes, from VCK' : "Each account's usual invoiced rate over the last 13 months, from VCK";
    if (costs) {
      $('p-cost').innerHTML = o.c ? o.c.lines.map(l => { const i = l[2].indexOf('. '), head = i > 0 ? l[2].slice(0, i + 1) : l[2], rest = i > 0 ? l[2].slice(i + 2) : ''; return `<div class="line"><span>${esc(l[0])}${l[3] ? ' est.' : ''}</span><span class="v">${money0(l[1])}</span><span class="d">${esc(head)}${rest ? ` ${esc(rest)}` : ''}</span></div>`; }).join('') + `<div class="line total"><span>A year</span><span class="v">${money0(o.c.total)}</span></div>` : '<p class="nocost">A product or a fee, not work the cost model prices.</p>';
    }
  }

  // the three points: the plain version at once; Claude's when it is back and every number in it is on the sheet
  function drawSummary(o, list, near, s) {
    const sheet = quoteFacts(o, list, { near, st: o.st, band: s });
    const titles = { why: `Why the margin is ${pc(o.m || 0)}`, nearby: 'Who is already nearby', better: 'What would make it better' };
    const paint = T => {
      $('p-why').innerHTML = sheet.map((f, i) => `<li style="--n:${i}"><b>${esc(titles[f.key])}</b><p>${esc(T[f.key])}</p></li>`).join('');
    };
    paint(Object.fromEntries(sheet.map(f => [f.key, f.say])));
    $('p-by').textContent = 'Written from the figures above.';
    const seq = ++sumSeq;
    clearTimeout(sumTimer);
    sumTimer = setTimeout(() => {
      fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'quote', sheet: sheet.map(({ key, line }) => ({ key, line })) }) })
        .then(r => r.ok ? r.json() : null).then(j => {
          if (seq !== sumSeq || !j || j.source !== 'claude' || !main.isConnected) return;
          const T = parseQuote(j.text, sheet);
          if (T && checkNumbers(j.text, sheet).ok) { paint(T); $('p-by').textContent = 'Pulse summary, checked against the figures above.'; }
        }).catch(() => {});
    }, 800);
  }

  const num = el => { const v = parseFloat(String(el.value).replace(/[$,\s]/g, '')); return Number.isFinite(v) ? v : null; };
  const link = () => history.replaceState(null, '', `#pricing?${st.level1 ? 'level1=' + st.level1 + '&' : ''}code=${st.code}${st.postcode ? '&postcode=' + st.postcode : ''}`);
  function pick(code) {
    if (!Z[code]) { $('p-map-msg').textContent = `${code} is not a postcode on this map.`; return; }
    $('p-map-msg').textContent = '';
    st.postcode = code; st.opt = 'now'; $('p-pc').value = code; setMiles(); link(); update();
  }
  $('p-cust').addEventListener('change', () => { st.level1 = byName.get($('p-cust').value.trim()) ?? null; prefill(); update(); link(); });
  $('p-code').addEventListener('change', () => { st.code = $('p-code').value; prefill(); update(); link(); });
  $('p-pcf').addEventListener('submit', e => { e.preventDefault(); const v = $('p-pc').value.trim(); if (/^\d{5}$/.test(v)) pick(v); else $('p-map-msg').textContent = 'A postcode has five figures.'; });
  $('p-price').addEventListener('input', () => { const v = num($('p-price')); if (v == null) return; st.price = v; st.opt = 'now'; update(); });
  $('p-slide').addEventListener('input', () => { st.price = Number($('p-slide').value); st.opt = 'now'; $('p-price').value = Fmt.fixed(st.price, dec()); update(); });
  $('p-units').addEventListener('input', () => { const v = num($('p-units')); if (v == null) return; st.units = v; if ((SERVICES[st.code] || {}).fam === 'trip') st.visits = v; st.opt = 'now'; update(); });
  const setBins = n => { st.bins = Math.max(1, Math.min(60, n)); st.units = st.bins * st.visits; st.opt = 'now'; update(); };
  $('p-minus').addEventListener('click', () => setBins(st.bins % 1 ? Math.floor(st.bins) : st.bins - 1));
  $('p-plus').addEventListener('click', () => setBins(st.bins % 1 ? Math.ceil(st.bins) : st.bins + 1));
  $('p-freq').addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; st.visits = +b.dataset.v; st.units = st.bins * st.visits; st.opt = 'now'; update(); });
  $('p-opts').addEventListener('click', e => { const b = e.target.closest('button[data-o]'); if (!b || b.disabled) return; st.opt = b.dataset.o; update(); });
  $('p-ask').addEventListener('click', e => dispatchEvent(new CustomEvent('open-ask', { detail: { ask: e.currentTarget.dataset.q } })));
  // invoiced against the book: each priced service, the share of its volume under the median and
  // what the median would add a year
  const bookRows = codes.map(code => {
    const rs = book[code].rows, weighted = code === 'STO';
    const st2 = stripStats(rs.map(r => ({ v: r.v, w: weighted ? r.units : undefined })));
    const under = rs.filter(r => r.v < st2.median && r.level1 !== CITADEL && !unitSuspect(r.v, st2.median));
    const vol = rs.reduce((t, r) => t + r.units, 0), uvol = under.reduce((t, r) => t + r.units, 0);
    const gap = under.reduce((t, r) => t + (st2.median - r.v) * r.units, 0);
    const list = under.map(r => ({ ...r, worth: (st2.median - r.v) * r.units })).sort((x, y) => y.worth - x.worth);
    return { code, name: code === 'STO' ? book[code].name : titleCase(book[code].name), n: rs.length, med: st2.median, share: vol ? uvol / vol : 0, gap, under: under.length, list, weighted };
  }).filter(r => r.n >= 20 && r.gap > 0).sort((a, b) => b.gap - a.gap);
  const bookTotal = bookRows.reduce((t, r) => t + r.gap, 0);
  $('b-title').textContent = bookRows.length ? `Prices under the book: up to ${moneyK(bookTotal)} a year across ${bookRows.length} services` : 'Prices under the book';
  $('b-sub').textContent = bookRows.length ? `largest: ${bookRows[0].name}, ${moneyK(bookRows[0].gap)}` : '';
  // what is behind one service's number, and the five accounts that sway it most
  function showGap(r) {
    const d = r.code === 'STO' ? 3 : 2, f = v => Fmt.money(v, { dp: d }), top = r.list.slice(0, 5), rest = r.list.slice(5);
    const sum = l => l.reduce((t, x) => t + x.worth, 0), topV = sum(top), max = Math.max(1, ...top.map(x => x.worth));
    const unitWord = r.code === 'STO' ? 'a box a month' : 'a unit', row = x => `<tr><td class="tl"><a href="#customer/${x.level1}">${esc(x.name)}</a><small>pays ${f(x.v)} on ${Fmt.num(x.units)} ${r.code === 'STO' ? 'box-months' : 'units'} a year</small><i class="pq-sway" style="--s:${Math.max(.01, x.worth / max).toFixed(3)}"></i></td><td>+${moneyK(x.worth)}</td></tr>`;
    openPop({ title: r.name, sub: `${Fmt.num(r.under)} of ${Fmt.num(r.n)} accounts pay under the ${r.weighted ? 'box-weighted ' : ''}median of ${f(r.med)} ${unitWord}`, ask: `Which accounts should we raise first on ${r.name}, and how?`, html: `
      <p class="p2-lede">If those ${Fmt.num(r.under)} accounts moved up to ${f(r.med)}, R4 would bill <b>+${moneyK(r.gap)} a year</b>. That is the most there is to win, not a forecast.</p>
      <h3>${top.length < r.list.length ? `The five that sway it most: ${Fmt.pct(topV / r.gap)} of the number` : 'The accounts behind it'}</h3>
      <table class="p2-t"><thead><tr><th class="tl">Account</th><th>At the median, a year</th></tr></thead><tbody>${top.map(row).join('')}</tbody></table>
      ${rest.length ? `<details class="fold"><summary><h3>The other ${Fmt.num(rest.length)} accounts</h3><span class="sub">+${moneyK(sum(rest))} between them</span></summary><table class="p2-t"><tbody>${rest.map(row).join('')}</tbody></table></details>` : ''}
      <p class="p2-go"><button type="button" class="pq-btn" data-price="${esc(r.code)}">Price this service</button></p>
      <p class="src">Each account's usual invoiced rate over the last 13 months, from VCK. A rate under a fifth of the median is left out as a likely unit mismatch.</p>` });
    const b = document.querySelector('.pop .pop-b [data-price]');
    if (b) b.addEventListener('click', () => { closePop(); st.code = r.code; showCode(); prefill(); update(); link(); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); });
  }
  dataTable($('b-rows'), { key: 'pricegaps', ns: 'g_', noun: 'services', who: whoAmI(), rows: bookRows, placeholder: 'Find a service', search: r => r.name,
    opens: true, plain: true, onRow: r => showGap(r),
    cols: [
      { k: 'name', l: 'Service', name: true, text: true, get: r => r.name, fmt: r => esc(r.name) },
      { k: 'under', l: 'Accounts under the median', short: 'Under', def: true, get: r => r.under, total: 'sum', fmt: r => r.under },
      { k: 'gap', l: 'If they moved to the median, a year', short: 'At median', def: true, sorted: true, get: r => r.gap, total: 'sum', totalFmt: v => '+' + moneyK(v), fmt: r => '+' + moneyK(r.gap) },
      { k: 'med', l: 'Median', get: r => r.med, fmt: r => Fmt.money(r.med, { dp: r.code === 'STO' ? 3 : 2 }) },
      { k: 'n', l: 'Accounts', get: r => r.n, fmt: r => r.n },
      { k: 'share', l: 'Volume under', get: r => r.share, fmt: r => Fmt.pct(r.share) },
    ] });

  // ── the quote: several lines, each priced and costed as above, a deal total and its margin a year.
  // A draft is kept in this browser until saved; saving writes app.quote (server/sales.js).
  const QKEY = 'r4-quote-draft';
  let Q = (() => { try { return JSON.parse(localStorage.getItem(QKEY)) || null; } catch { return null; } })() || { lines: [], prospect: '' };
  const keepQ = () => { try { localStorage.setItem(QKEY, JSON.stringify(Q)); } catch {} };
  const nameOf = id => (customers.find(x => x[0] === id) || [0, ''])[1];
  function addLine() {
    const o = chosen(), svc = SERVICES[st.code], c = costsVisible() ? o.c : null, units = Math.max(0, o.st.units || 0);
    if (!units || !(o.st.price > 0)) return;
    if (Q.level1 != null && st.level1 !== Q.level1 && Q.lines.length) Q.lines = [];   // a quote is for one customer
    Q.level1 = st.level1; Q.postcode = st.postcode || Q.postcode || null;
    Q.lines.push({ code: st.code, name: (st.code === 'STO' ? book.STO.name : titleCase(book[st.code].name)).replace(/\s+/g, ' '), unit: svc ? (svc.fam === 'storage' ? 'box-month' : svc.unit) : 'unit',
      units, visits: o.st.visits || null, price: o.st.price, cost: c ? c.total : null,
      basis: !svc ? 'none' : c && c.routeBasis ? c.routeBasis : 'model' });
    keepQ(); drawQuote();
  }
  function totals() {
    const rev = Q.lines.reduce((t, l) => t + l.price * l.units, 0);
    const costed = Q.lines.filter(l => l.cost != null), cost = costed.reduce((t, l) => t + l.cost, 0);
    const crev = costed.reduce((t, l) => t + l.price * l.units, 0);
    return { rev, cost, crev, margin: crev - cost, pc: crev > 0 ? (crev - cost) / crev : null, uncosted: Q.lines.length - costed.length, review: Q.lines.some(l => l.basis === 'book') };
  }
  function quoteText() {
    const T = totals(), who = Q.level1 ? nameOf(Q.level1) : (Q.prospect || 'New customer');
    return [`Quote for ${who}${Q.postcode ? ` (${Q.postcode})` : ''}`, ...Q.lines.map(l => `${l.name}: ${Fmt.num(l.units)} ${l.unit}s a year at ${Fmt.money(l.price, { dp: l.code === 'STO' ? 3 : 2 })} = ${money0(l.price * l.units)}`), `Total: ${money0(T.rev)} a year`].join('\n');
  }
  function drawQuote() {
    const T = totals(), n = Q.lines.length;
    $('q-title').textContent = n ? `The quote: ${moneyK(T.rev)} a year${costsVisible() && T.pc != null ? `, ${moneyK(T.margin)} margin est.` : ''}` : 'The quote';
    if (!n) { $('q-body').innerHTML = `<p class="hint">Price a service above, then add it. Add as many lines as the deal has: storage, bins, shredding, delivery. The quote totals the revenue${costsVisible() ? ' and the margin' : ''} a year.</p>${savedHtml()}`; return; }
    const dec = l => l.code === 'STO' ? 3 : 2;
    $('q-body').innerHTML = `
      ${!Q.level1 ? `<label class="q-who">Prospect<input id="q-prospect" value="${esc(Q.prospect || '')}" placeholder="Company name"></label>` : `<p class="hint">For ${esc(nameOf(Q.level1))}${Q.postcode ? ` · ${esc(Q.postcode)}` : ''}</p>`}
      <table class="q-t"><thead><tr><th>Line</th><th class="v">A year</th><th class="v">Price</th><th class="v">Revenue</th>${costsVisible() ? '<th class="v">Margin est.</th>' : ''}<th></th></tr></thead><tbody>
      ${Q.lines.map((l, i) => { const r = l.price * l.units, m = l.cost == null ? null : r - l.cost; return `<tr>
        <td>${esc(l.name)}${!costsVisible() ? '' : l.basis === 'average' ? '<small>route cost under review</small>' : ['account', 'postcode', 'nearby'].includes(l.basis) ? '<small>from real route days</small>' : l.basis === 'ride' ? '<small>what the stop adds to that route</small>' : l.basis === 'yard' ? '<small>its own trip from the yard</small>' : l.basis === 'book' ? "<small>at the book's average stop</small>" : l.basis === 'none' ? '<small>a fee: not costed</small>' : ''}</td>
        <td class="v">${Fmt.num(l.units)} ${esc(l.unit)}s</td><td class="v">${Fmt.money(l.price, { dp: dec(l) })}</td><td class="v">${money0(r)}</td>
        ${!costsVisible() ? '' : `<td class="v ${m != null && m < 0 && l.basis !== 'average' ? 'is-bad' : ''}">${m == null ? '—' : (m < 0 ? '−' : '') + money0(Math.abs(m))}${m != null && r > 0 ? `<small>${Fmt.pct(m / r)}</small>` : ''}</td>`}
        <td><button class="q-x" type="button" data-i="${i}" aria-label="Remove ${esc(l.name)}">×</button></td></tr>`; }).join('')}
      </tbody><tfoot><tr><td>Total</td><td></td><td></td><td class="v">${money0(T.rev)}</td>${!costsVisible() ? '' : `<td class="v ${T.margin < 0 && !T.review ? 'is-bad' : ''}">${T.pc == null ? '—' : (T.margin < 0 ? '−' : '') + money0(Math.abs(T.margin))}<small>${T.pc == null ? '' : Fmt.pct(T.pc)}</small></td>`}<td></td></tr></tfoot></table>
      ${!costsVisible() ? '' : `<p class="src">Margin is revenue less the cost to serve from the cost model est.${T.uncosted ? `, on the ${n - T.uncosted} costed line${n - T.uncosted === 1 ? '' : 's'}` : ''}${T.review ? "; a line with no place chosen is at the book's average stop" : ''}.</p>`}
      <div class="q-acts"><button type="button" id="q-save" class="q-add">Save the quote</button><button type="button" id="q-copy">Copy as text</button><button type="button" id="q-clear">Start again</button><span id="q-msg" class="hint"></span></div>
      ${savedHtml()}`;
    const pr = $('q-prospect'); if (pr) pr.addEventListener('input', () => { Q.prospect = pr.value; keepQ(); });
    $('q-body').querySelectorAll('.q-x').forEach(b => b.addEventListener('click', () => { Q.lines.splice(+b.dataset.i, 1); keepQ(); drawQuote(); }));
    $('q-copy').addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(quoteText()).then(() => { $('q-msg').textContent = 'Copied.'; }, () => { $('q-msg').textContent = 'Copy failed: select and copy by hand.'; }); });
    $('q-clear').addEventListener('click', () => { Q = { lines: [], prospect: '' }; keepQ(); drawQuote(); });
    $('q-save').addEventListener('click', async () => {
      const r = await fetch('/api/sales/quotes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level1: Q.level1, prospect: Q.prospect, postcode: Q.postcode, lines: Q.lines }) }).catch(() => null);
      if (r && r.ok) { loadSaved('Saved. It is in Saved quotes below.'); } else $('q-msg').textContent = 'Could not save just now.';
    });
  }
  let saved = null;
  function savedHtml() {
    if (!saved || !saved.length) return '';
    const sum = q => q.lines.reduce((t, l) => t + l.price * l.units, 0);
    return `<details class="fold q-saved"><summary><h3>Saved quotes</h3><span class="sub">${saved.length} in the last 90 days · open</span></summary><ul>${saved.slice(0, 12).map((q, i) => `<li><button type="button" data-q="${i}">${esc(q.level1 ? nameOf(q.level1) : q.prospect || 'New customer')}</button><span>${q.lines.length} line${q.lines.length === 1 ? '' : 's'} · ${moneyK(sum(q))} a year · ${esc(q.who)} · ${esc(String(q.at).slice(0, 10))}</span></li>`).join('')}</ul></details>`;
  }
  function loadSaved(msg) {
    fetch('/api/sales/quotes').then(r => r.ok ? r.json() : { data: [] }).then(j => { saved = j.data || []; drawQuote(); if (msg && $('q-msg')) $('q-msg').textContent = msg;
      $('q-body').querySelectorAll('.q-saved [data-q]').forEach(b => b.addEventListener('click', () => { const q = saved[+b.dataset.q]; Q = { level1: q.level1, prospect: q.prospect || '', postcode: q.postcode, lines: q.lines.map(l => ({ ...l, unit: l.unit || 'unit', basis: l.basis || 'model' })) }; keepQ(); drawQuote(); })); }).catch(() => {});
  }
  $('q-add').addEventListener('click', addLine);
  drawQuote(); loadSaved();

  prefill(); update();
  document.documentElement.classList.add('js');
  const root = main.querySelector('.pr2');
  if (firstPlay('r4-quote-played')) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }
}
