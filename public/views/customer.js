// One customer: the page every list and every number opens. Desktop first, restacks on a phone.
// Three lit points beside who they are, four tiles, the margin one a button, twelve months beside what would improve
// it, every line with its margin pill: a line's name opens the drill drawer (components/margindrawer.js), a pill the
// margin pop-out, where it is served, folded below: opportunities, not bought yet, prices, signals, visits.
import * as Fmt from '/components/format.js';
import { money0, moneyK } from '/components/chart.js';
import { buildMargins, accountJobs, marginLevers, marginBand, costParts, FAMILY_NAMES } from '/components/margin.js';
import { drawPoints, tile, chip, ragPill, barsSvg } from '/components/lit.js';
import { openMargin, weakest } from '/components/marginpop.js';
import { isAdmin } from '/components/access.js';
import { pricePosition } from '/components/custbook.js';
import { openDrawer, leversHtml, linesOf } from '/components/margindrawer.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { loadZones, bookShading, playMap, zoneKey } from '/components/mapkit.js';
import { buildWhitespace, LINES } from '/components/whitespace.js';
import { openExplainer } from '/components/explain.js';
import { ledgerTable } from '/components/table.js';
import { getJson, loadRates, titleCase, esc, getLog, postLog } from '/components/data.js';
import { seriesOf, deltaText, moveReason } from '/components/series.js';
import { slippingAccounts, unitSuspect } from '/components/levers.js';
import { costsVisible } from '/components/access.js';
import { placesSvg, miles, YARD, loadBasemap, basemapNow, loadRoadnet } from '/components/routemap.js';

const CITADEL = 6714;

export async function render(main, C, params) {
  if (!main) return;
  const id = Number(params.id);
  const [R, M, PR, CA, log, VW] = await Promise.all([loadRates(), getJson('margin'), getJson('pricing'), getJson('calls'), getLog(Number(params.id)).catch(() => []), costsVisible() ? getJson('view/customers').catch(() => null) : null]);
  const [QR, ZC] = await Promise.all([getJson('view/quote-routes').catch(() => null), zcta()]);
  const s = seriesOf(C).get(id);
  const book = buildMargins(R, M, {});
  const m = book.accounts.find(a => a.level1 === id);
  const acct = M.accounts.find(a => a.level1 === id);
  const name = titleCase((s && s.customer) || (m && m.customer) || `Account ${id}`);
  const signals = CA.find(c => c.level1 === id);
  const wsRow = buildWhitespace(M, { exclude: [CITADEL], top: 100000 }).rows.find(x => x.level1 === id);
  const ownRate = (PR.storage.find(r => r.level1 === id) || {}).rate_per_box;
  const overdue = signals && signals.boxes_review_overdue > 0 ? Math.round(signals.boxes_review_overdue) : 0;
  const pitch = overdue && ownRate ? `The case for them: ${Fmt.grouped(overdue)} of their boxes are past their retention review. Destroying them would save them about ${moneyK(overdue * ownRate)} a month in storage at their own ${Fmt.money(ownRate, { dp: 3 })} a box.` : '';

  // an account with nothing billed in twelve months gets one honest line, not a page of blanks
  const billed = (s ? s.total.some(v => v !== 0) : false) || (m ? m.revenue !== 0 || m.cost !== 0 : false);
  if (!billed) { main.innerHTML = `<div class="crumb"><a href="#customers">Accounts</a><span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div><div class="empty"><h2>${esc(name)}: nothing billed recently</h2>No storage, service or priced lines on its account in the last twelve months. If it is a live customer, its work is billed under another account number.</div>`; return; }

  const ltm = s ? s.ltm : m.revenue;
  const pc = m && m.revenue > 0 ? m.margin / m.revenue : null;
  const slipping = s && s.move && slippingAccounts(C).some(x => x.level1 === id);
  const share = k => s ? Math.round(s[k].slice(-12).reduce((t, v) => t + v, 0) / Math.max(1, s.ltm) * 100) : null;
  const n0 = Fmt.count;

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
    if (signals.boxes_review_overdue > 0) sigs.push({ key: 'overdue', text: `${Fmt.num(signals.boxes_review_overdue)} boxes are past their retention review: a destruction conversation.` });
  }
  const said = new Map(log.filter(l => l.kind === 'signal').map(l => [l.signal, l]));
  const VERB = { right: 'right', not_right: 'not right', called: 'called', emailed: 'emailed', not_this_week: 'not this week' };
  const when = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const lines = M.lines.filter(l => l.level1 === id);
  const F = acct ? accountJobs(R, acct, lines, []) : null;
  const B = VW ? { rows: VW.rows, book: VW.book } : null, row = B ? VW.rows.find(r => r.level1 === id) || null : null;
  const position = B ? (r, k) => pricePosition(B, r, k) : null;
  const levers = F && costsVisible() ? marginLevers(R, acct, lines, F, { row, position }) : [];
  const working = F ? Object.values(F.fams).flatMap(x => x.working) : [];
  const drawer = (family = null, woid = null) => openDrawer({ level1: id, name: (s && s.customer) || (m && m.customer) || name, R, row, B, family, woid });
  const moved = s && s.move && s.move.pct != null ? (Math.abs(s.move.pct) < 0.01 ? null : s.move.pct) : null;
  const allParts = costParts(working), rowsF = F ? linesOf(F) : [], costs = costsVisible(), weak = m ? weakest(m.fam) : null;
  const pcS = v => { const t = Fmt.pct(Math.abs(v)); return (v < 0 && t !== '0%' ? '−' : '') + t; };
  const word = n => n === 'ITAD' ? n : n.toLowerCase();
  // the three points, from computed fields only
  const pts = [];
  if (s && s.move) pts.push({ key: 'run', tone: moved != null && moved <= -.1 ? 'r' : moved != null && moved < -.02 ? 'a' : 'g', lead: moved == null ? 'About level on its own run:' : moved > 0 ? `Up ${Fmt.pct(moved, { abs: true })} on its own run:` : `Down ${Fmt.pct(moved, { abs: true })} on its own run:`, rest: `running at ${moneyK(s.move.last3)} a month against ${moneyK(s.move.run)}; ${share('storage')}% of ${moneyK(ltm)} is storage.` });
  else pts.push({ key: 'run', tone: 'a', lead: `${moneyK(ltm)} in twelve months,`, rest: 'too little history for a run.' });
  if (costs && weak) { const l = weak.revenue - weak.cost, wp = l / weak.revenue; pts.push({ key: 'weak', tone: marginBand(R, wp).cls === 'g' ? 'g' : marginBand(R, wp).cls, lead: `${FAMILY_NAMES[weak.family] || weak.family} earns least:`, rest: `${money0(weak.revenue)} of revenue on ${money0(weak.cost)} to serve, ${pcS(wp)} est.` }); }
  const lowCell = wsRow ? LINES.map(x => ({ x, c: wsRow.cells[x.key] })).find(o => o.c.low) : null, addCell = wsRow ? LINES.map(x => ({ x, c: wsRow.cells[x.key] })).filter(o => !o.c.have && o.c.opp > 0).sort((a, b) => b.c.opp - a.c.opp)[0] : null;
  if (lowCell) pts.push({ key: 'low', tone: 'a', lead: `Low on ${word(lowCell.x.name)} for its size:`, rest: `${moneyK(lowCell.c.spend)} a year against about ${moneyK(lowCell.c.expected)} at comparable accounts est.` });
  else if (addCell) pts.push({ key: 'add', tone: 'a', lead: `Does not buy ${word(addCell.x.name)} yet:`, rest: `about ${moneyK(addCell.c.opp)} a year at comparable accounts est.` });
  else if (slipping) pts.push({ key: 'slip', tone: 'r', lead: 'Slipping:', rest: `${moneyK(s.move.last3)} a month against its own ${moneyK(s.move.run)}.` });
  else pts.push({ key: 'all', tone: 'g', lead: 'Nothing else stands out', rest: 'against comparable accounts.' });
  // where it is served, from its route stops
  const pc0 = QR && QR.acctPc ? QR.acctPc[id] : null, own = R.routeFor && R.routeFor(id), served = pc0 && ZC[pc0] ? `Served at ${pc0}, ${Fmt.fixed(miles(YARD, ZC[pc0]), 1)} mi from the yard${own ? `: ${Fmt.num(own.services)} services on ${Fmt.num(own.days)} route days in twelve months.` : '.'}` : '';
  const line12 = s ? s.months.slice(-12).map((x, i) => ({ m: x, v: s.total[s.total.length - 12 + i], attrs: `data-inv-id="${id}" data-inv-m="${x}" data-inv-name="${esc(s.customer)}"` })) : [];
  main.innerHTML = `
  <div class="cp h2 ac">
    <div class="crumb"><a href="#customers">Accounts</a><span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div>
    <div class="cp-head"><h1>${esc(name)}</h1>
    <div class="tags">
      ${id === CITADEL ? '<span class="chip">Held apart from core</span>' : ''}
      ${signals && signals.not_raised_2y ? '<span class="chip warn">Missed every rate round</span>' : ''}
    </div></div>
    <div class="cp-top">
      <section class="h2-card lit-card" data-in><div id="cp-lit"></div><small class="lit-by">Pulse summary, from the figures below</small></section>
      <section class="h2-card cp-who" data-in id="cp-who"><div class="h2-ch"><h2>Who they are</h2></div><p class="sub">Reading…</p></section>
    </div>
    <section class="ktiles">
      ${tile({ lead: true, label: 'Invoiced, last twelve months', big: moneyK(ltm), sub: s ? `${share('storage')}% storage, ${share('service')}% service` : '', spark: line12.map(x => x.v) })}
      ${s && s.move ? tile({ d: 80, label: 'Running at, a month', big: moneyK(s.move.last3), sub: `${moved == null ? 'level with' : chip(moved) + ' on'} its own ${moneyK(s.move.run)}` }) : ''}
      ${costs && m && m.cost > 0 ? tile({ d: 160, label: 'Margin est.', big: pc != null ? pcS(pc) : '—', sub: `${esc(marginBand(R, pc).word)}: ${m.margin >= 0 ? 'keeps' : 'short by'} ${moneyK(Math.abs(m.margin))} on ${moneyK(m.cost)} to serve`, margin: { cls: marginBand(R, pc).cls } }) : ''}
      ${acct && (acct.boxes >= 1 || acct.bins) ? tile({ d: 240, label: acct.boxes >= 1 ? 'Boxes stored' : 'Bin services, a year', big: n0(acct.boxes >= 1 ? acct.boxes : acct.bins), sub: acct.bins ? `${n0(acct.bins)} bin services on ${n0(acct.visits)} visits` : 'on average, over the year' }) : ''}
    </section>
    <div class="cp-mid">
      <section class="h2-card" data-in id="cp-chart">${s ? `<div class="h2-ch"><h2>${esc(chartTitle(s))}</h2><small>Invoiced a month, from VCK. Tap a month for its invoices.</small></div>${barsSvg(line12, { ref: s.move ? s.move.run : null, refLabel: s.move ? `own run ${moneyK(s.move.run)}` : '', label: chartTitle(s) })}` : ''}</section>
      ${costs ? `<section class="h2-card" data-in><div class="h2-ch"><h2>What would improve it</h2></div>${leversHtml(levers, 4)}</section>` : ''}
    </div>
    <section class="h2-card" data-in><div class="h2-ch cp-ch"><h2>Every line${costs ? ', est.' : ''}</h2>${rowsF.length ? '<small>Tap a line for its jobs' + (costs ? ', a margin for its breakdown' : '') + '</small>' : ''}</div>
      <div class="cp-lines"><table><thead><tr><th>Line</th><th>Revenue</th>${costs ? '<th>Cost est.</th><th>Left est.</th><th>Margin</th>' : ''}</tr></thead><tbody>${rowsF.map((x, i) => { const l = x.revenue - x.cost, p = x.revenue > 0 && x.cost > 0 ? l / x.revenue : null; return `<tr><td><button type="button" class="linkbtn cp-line" data-f="${esc(x.family)}">${esc(FAMILY_NAMES[x.family] || x.family)}</button></td><td>${money0(x.revenue)}</td>${costs ? `<td>${x.cost ? money0(x.cost) : 'not costed'}</td><td>${x.cost ? (l < 0 ? '−' : '') + moneyK(Math.abs(l)) : ''}</td><td>${p != null ? ragPill(R, p, pcS(p), `data-lm="${esc(x.family)}"`, i) : ''}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="5">No priced lines in the last twelve months.</td></tr>`}</tbody></table></div>
      ${F && Math.abs(F.noLine) >= 1 ? `<p class="src">${money0(Math.abs(F.noLine))} invoiced with no line in this period: work and its invoice fall in different months, or a charge with no cost behind it.</p>` : ''}
      ${served ? `<p class="cp-served">${esc(served)}</p>` : ''}
    </section>
    <details class="fold cp-fold"><summary><h3>Open opportunities</h3><a href="#opportunities" class="sub chev">All opportunities</a></summary><div id="cp-opps"><p class="sub">Loading…</p></div></details>
    <details class="fold cp-fold"><summary><h3>Not bought yet, prices against the book, signals</h3><span class="sub">${sigs.length ? `${sigs.length} signal${sigs.length === 1 ? '' : 's'}, ` : ''}${mine.length} prices</span></summary>
    <div class="grid three">
        ${wsCard(wsRow, pitch)}
        <div class="card">
          <div class="card-head"><h3>Prices against the book</h3><a class="chev" href="#pricing?level1=${id}">Price it</a></div>
          ${mine.map(r => `<div class="price">
            <span><a href="#pricing?level1=${id}&code=${encodeURIComponent(r.servcode)}" style="color:inherit;text-decoration:none"><b class="chev">${esc(titleCase(r.service))}</b></a><span class="sub" style="display:block">${Fmt.money(r.modal_rate, { dp: 2 })}, book median ${Fmt.money(r.med, { dp: 2 })}, ${r.suspect ? 'so far apart it is probably billed in another unit: check before quoting' : r.modal_rate < r.med ? `cheaper than ${Fmt.pct(1 - r.below)} of accounts` : `dearer than ${Fmt.pct(r.below)} of accounts`}</span></span>
            <span class="v">${r.suspect ? '<span class="chip warn">check the unit</span>' : r.worth > 0 ? `+${moneyK(r.worth)} a year<span class="sub" style="display:block;font-weight:400">at the median</span>` : '<span class="sub">at or above</span>'}</span>
            <div class="pos"><b style="left:${pos(r.med, r)}%"></b><i style="left:${pos(r.modal_rate, r)}%"></i></div>
          </div>`).join('') || '<p class="sub">No service rates in the last thirteen months.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h3>Signals</h3></div>
          <div id="cp-sigs">${sigs.map(g => { const l = said.get(g.key); return `<div class="sig" data-sig="${g.key}">${esc(g.text)}<div class="acts"><button data-v="right" class="${l && l.verdict === 'right' ? 'on' : ''}">Right</button><button data-v="not_right" class="${l && l.verdict === 'not_right' ? 'on' : ''}">Not right</button><span class="sub said">${l ? `${esc(l.who)} said ${VERB[l.verdict]}, ${when(l.logged_at)}` : ''}</span></div></div>`; }).join('') || '<p class="sub">Nothing flagged this week.</p>'}</div>
          ${log.length ? `<div class="aside" style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:var(--hair) solid var(--rule)"><div class="lab" style="margin-bottom:var(--sp-1)">Logged</div>${log.slice(0, 5).map(l => `<div class="sub">${when(l.logged_at)}, ${esc(l.who)}, ${VERB[l.verdict]} (${esc(l.signal)})</div>`).join('')}</div>` : ''}
        </div>
    </div>
    </details>
    <details class="fold cp-fold" id="cp-where"><summary><h3>Where it is served, and its shredding visits</h3><span class="sub">last six months</span></summary>
    <div class="grid drill" id="cp-drill"><div class="card" style="grid-column:1/-1"><p class="sub">Loading…</p></div></div>
    </details>
  </div>`;

  // this customer's open opportunities, from the same list as Customers › Opportunities
  getJson('view/opportunities?level1=' + id).then(V => {
    const box = main.querySelector('#cp-opps'); if (!box) return;
    const open = V.rows.filter(r => r.status !== 'won' && r.status !== 'lost').slice(0, 5);
    const KIND = { cross: 'Cross-sell', price: 'Price gap', slip: 'Win back', round: 'Rate round', overdue: 'Overdue boxes' };
    box.querySelector('p').outerHTML = open.length ? `<ul class="cp-opp">${open.map(r => `<li><span><b>${esc(KIND[r.kind] || r.kind)}</b>${r.owner ? `, ${esc(r.owner)}` : ''}${r.status !== 'open' ? `, ${esc(r.status)}` : ''}<small>${esc(r.reason)}</small></span><em>${moneyK(r.value)}${r.once ? ' once' : ''}${r.modelled ? ' est.' : ''}</em></li>`).join('')}</ul>` : '<p class="sub">Nothing open for this customer.</p>';
  }).catch(() => { const box = main.querySelector('#cp-opps'); if (box) box.innerHTML = ''; });

  const play = firstPlay('r4-customer-played');
  drawPoints(main.querySelector('#cp-lit'), pts);
  // who they are: cached research, or an honest empty state; an admin can ask for it
  const whoBox = main.querySelector('#cp-who');
  const whoHtml = w => w.status === 'ok' ? `<div class="h2-ch"><h2>Who they are</h2></div>${w.lines.map(l => `<p>${esc(l)}</p>`).join('')}${w.reading ? `<p class="cp-reading"><b>Pulse's reading:</b> ${esc(w.reading)}</p>` : ''}<small class="lit-by">From <a href="${esc(w.source)}" target="_blank" rel="noopener">${esc((w.source.match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || w.source)}</a>, researched ${esc(new Date(w.at + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))}${w.reading ? ". The reading is Pulse's, not theirs" : ''}.</small>`
    : `<div class="h2-ch"><h2>Who they are</h2></div><div class="pending">Not researched yet. It will come from the company's own public website.${w.note ? ` ${esc(w.note)}` : ''}</div>${w.canResearch ? '<button type="button" class="pq-btn" id="cp-research">Research it</button>' : ''}`;
  const paintWho = w => { if (!whoBox.isConnected) return; whoBox.innerHTML = whoHtml(w); const b = whoBox.querySelector('#cp-research'); if (b) b.addEventListener('click', () => { b.disabled = true; b.textContent = 'Researching…'; fetch(`/api/customer/${id}/who`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(r => r.json()).then(paintWho).catch(() => paintWho({ status: 'none', note: 'Research did not finish.' })); }); };
  fetch(`/api/customer/${id}/who`, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : { status: 'none' }).then(paintWho).catch(() => paintWho({ status: 'none' }));
  // the margin tile and pills open the pop-out; a line's name opens its jobs
  const tileM = main.querySelector('[data-margin-tile]');
  if (tileM) tileM.addEventListener('click', () => openMargin({ R, name, revenue: m.revenue, cost: m.cost, parts: allParts, weak, level1: id, row, B }));
  main.querySelector('.cp-lines').addEventListener('click', ev => {
    const pill = ev.target.closest('[data-lm]'), ln = ev.target.closest('.cp-line');
    if (pill) { const x = F.fams[pill.dataset.lm]; openMargin({ R, name: `${name}, ${FAMILY_NAMES[x.family] || x.family}`, revenue: x.revenue, cost: x.cost, parts: costParts(x.working), level1: id, row, B, family: x.family }); }
    else if (ln) drawer(ln.dataset.f);
  });

  const wsBox = main.querySelector('.ws1') && main.querySelector('.ws1').closest('.card');
  if (wsBox && wsRow) wsBox.addEventListener('click', ev => { const b = ev.target.closest('button.opp'); if (b) openExplainer({ row: wsRow, key: b.dataset.key, call: signals, H: M.history, names: new Map(M.accounts.map(a => [a.level1, a.customer])) }); });
  // the visits and the map, read when the fold opens
  const where = main.querySelector('#cp-where');
  if (where) where.addEventListener('toggle', () => { if (where.open && !where.dataset.read) { where.dataset.read = '1'; drawDrill(main.querySelector('#cp-drill'), loadDrill(id)); } });

  if (params.line) drawer(params.line, params.job || null);

  document.documentElement.classList.add('js');
  const root = main.querySelector('.cp');
  if (play) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }

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

}

const zcta = () => fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));

// Its Veri-Shred visits and the postcodes they were at, read when the fold opens.
async function loadDrill(id) {
  try {
    const [r, Z, A] = await Promise.all([fetch(`/api/customer/${id}`, { credentials: 'same-origin' }), zcta(), getJson('activity').catch(() => null), loadRoadnet(), loadZones()]);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return { d: j.data, Z, A };
  } catch (e) { return { error: e.message }; }
}

async function drawDrill(el, drillP) {
  if (!el) return;
  const { d, Z, A, error } = await drillP;
  if (!el.isConnected) return;
  if (error) { el.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="pending">${esc(error)}</div></div>`; return; }
  const day = t => new Date(t + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const n0 = v => Fmt.num(v || 0);
  const lbs = d.visits.reduce((t, v) => t + (v.pounds || 0), 0);
  el.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-head"><h3>Shredding visits</h3><small>${d.visits.length ? `${n0(d.visits.length)} days on a route, ${n0(lbs)} lb` : 'last six months'}</small></div><div id="cp-visits"></div><div class="src">Bin and shredding stops drivers marked done in Veri-Shred, one row per day and route. Executive-bin weights are a set figure, not weighed.</div></div>`;
  const vBox = el.querySelector('#cp-visits');
  drawWhere(el, d, Z, A);
  const draw = n => ledgerTable(vBox, {
    columns: [
      { key: 'date', label: 'Date', fmt: v => v ? day(v) : '—' },
      { key: 'route', label: 'Route', fmt: (v, r) => `${esc(v || '—')}${r.driver ? ` <span class="sub" style="display:inline">${esc(r.driver)}</span>` : ''}` },
      { key: 'services', label: 'Services', num: true, fmt: (v, r) => `${n0(v)}${r.stops > 1 ? ` <span class="sub" style="display:inline">${r.stops} stops</span>` : ''}` },
      { key: 'pounds', label: 'Pounds', num: true, fmt: v => v ? n0(v) : '—' },
    ],
    rows: d.visits.slice(0, n),
  });
  if (!d.visits.length) { vBox.innerHTML = '<p class="sub">No done Veri-Shred orders in the last six months: this account\'s work is storage or warehouse handling.</p>'; return; }
  draw(Math.min(12, d.visits.length));
  if (d.visits.length > 12) { const b = document.createElement('button'); b.className = 'linkbtn'; b.textContent = `Show all ${d.visits.length}`; b.onclick = () => { draw(d.visits.length); b.remove(); }; vBox.after(b); }
}

// What the account doesn't buy yet, sized at what comparable accounts spend (components/whitespace.js).
function wsCard(r, pitch) {
  if (!r) return '';
  const lines = LINES.map(x => ({ x, c: r.cells[x.key] }));
  const missing = lines.filter(o => !o.c.have && o.c.opp > 0).sort((a, b) => b.c.opp - a.c.opp);
  return `<div class="card">
    <div class="card-head"><h3>${missing.length ? `Not bought yet: about ${moneyK(r.opp / 12)} a month est.` : lines.every(o => o.c.have) ? 'Buys every line we sell' : 'Not bought yet: too small to size'}</h3><a class="chev" href="#customers?view=whitespace">Cross-sell</a></div>
    ${!missing.length && !lines.every(o => o.c.have) ? '<p class="sub" style="margin:0 0 var(--sp-2)">It doesn\'t buy every line, but it has too few boxes or too little other spend to size what comparable accounts would spend.</p>' : ''}
    ${lines.map(({ x, c }) => `<div class="ws1"><span>${esc(x.name)}</span>${c.have ? `<span class="num">${moneyK(c.spend)} <span class="sub" style="display:inline">a year</span></span>` : c.opp > 0 ? `<button class="num opp" data-key="${x.key}" title="How this was worked out">+${moneyK(c.opp)} est.</button>` : '<span class="sub">—</span>'}</div>${!c.have && x.key === 'shred' && pitch ? `<div class="ws1p">${esc(pitch)}</div>` : ''}${!c.have && c.opp > 0 ? `<div class="sub ws1b">${esc(c.basis)}</div>` : ''}`).join('')}
  </div>`;
}

function pos(v, r) {
  const lo = Math.min(r.p10, r.modal_rate), hi = Math.max(r.p90, r.modal_rate, r.med * 1.01);
  return Math.max(1, Math.min(99, (v - lo) / (hi - lo) * 100));
}

// The chart says what it shows: the last three months against the account's own run before, and
// what it buys. "Running at $13K a month, about level on its own run, all service".
function chartTitle(s) {
  const m = s.move, st = s.storage.reduce((a, b) => a + b, 0), sv = s.service.reduce((a, b) => a + b, 0);
  const mix = !st ? ', all service' : !sv ? ', all storage' : `, ${Fmt.pct(st / (st + sv))} storage`;
  if (!m || m.pct == null) return `Billing by month${mix}`;
  const how = Math.abs(m.pct) < 0.05 ? 'about level' : `${m.pct > 0 ? 'up' : 'down'} ${Fmt.pct(m.pct, { abs: true })}`;
  return `Running at ${moneyK(m.last3)} a month, ${how} on its own run${mix}`;
}

// Where the account is served: its own stops over six months (the drill's route lists), by postcode,
// against the yard, above the orders and visits. One look says a city account or one far out.
function drawWhere(el, d, Z, A) {
  if (!el || !Z || !d.routes) return;
  const by = new Map(), days = new Set();
  for (const r of d.routes) {
    if (r.level1 !== d.level1 || !r.postcode) continue;
    const x = by.get(r.postcode) || { postcode: r.postcode, services: 0, days: new Set(), pt: Z[r.postcode] || null };
    x.services += r.services || 0; x.days.add(r.date); days.add(r.date);
    by.set(r.postcode, x);
  }
  const places = [...by.values()].map(p => ({ ...p, days: p.days.size, mi: p.pt ? miles(YARD, p.pt) : null })).sort((a, b) => b.services - a.services);
  const placed = places.filter(p => p.pt);
  if (!placed.length) return;
  const far = placed.reduce((m, p) => p.mi > m.mi ? p : m, placed[0]);
  const all = places.reduce((t, p) => t + p.services, 0), within10 = placed.filter(p => p.mi <= 10).reduce((t, p) => t + p.services, 0);
  const title = placed.length === 1 ? `Served at one postcode, ${Fmt.fixed(far.mi, 0)} miles from the yard`
    : `Served at ${placed.length} postcodes; the furthest, ${far.postcode}, is ${Fmt.fixed(far.mi, 0)} miles from the yard`;
  const card = document.createElement('div');
  card.className = 'card'; card.style.gridColumn = '1 / -1';
  card.innerHTML = `<div class="card-head"><h3>${esc(title)}</h3></div>
    <div class="rm-grid"><div><div class="rm-wrap"></div>${zoneKey()}</div><ol class="rm-list">${places.slice(0, 12).map(p => `<li><span>${esc(p.postcode)}<small>${p.mi != null ? `${Fmt.fixed(p.mi, 1)} miles from the yard` : 'no postcode centre'}, ${p.days} day${p.days === 1 ? '' : 's'} on a route</small></span><span class="num">${Fmt.grouped(p.services)}<small>services</small></span></li>`).join('')}</ol></div>
    <div class="src">${Fmt.pct(within10 / Math.max(1, all))} of its ${Fmt.grouped(all)} done services in six months were within ten miles of the yard, Veri-Shred done orders on ${days.size} route days, postcode centres from the US Census, the likely way along main roads: no GPS was captured, districts shaded by R4's done services over twelve months</div>`;
  el.prepend(card);
  const draw = () => { const w = card.querySelector('.rm-wrap'); if (w && w.isConnected) { w.innerHTML = placesSvg(placed, { width: Math.max(280, Math.min(900, w.clientWidth || 560)), base: basemapNow(), label: title, shading: bookShading(A, Z) }); playMap(w.querySelector('svg'), { vans: 5 }); } };
  draw();
  if (!basemapNow()) loadBasemap().then(b => { if (b) draw(); });   // redrawn once the outline arrives
}
