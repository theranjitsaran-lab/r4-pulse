// One customer: the page every list and every number opens. Desktop first, restacks on a phone.
// Four figures · 24 months of storage and service with proper axes · its margin bridge and lines, each opening
// the one drill drawer (components/margindrawer.js): every job, then one job's cost build · what would improve it
// and its open opportunities · folded below: not bought yet, prices, signals; where it is served and its visits.
import * as Fmt from '/components/format.js';
import { lineChart, money0, moneyK } from '/components/chart.js';
import { buildMargins, accountJobs, marginLevers, FAMILY_NAMES } from '/components/margin.js';
import { pricePosition } from '/components/custbook.js';
import { openDrawer, bridgeHtml, linesHtml, leversHtml, linesOf } from '/components/margindrawer.js';
import { openInvoices } from '/components/invoices.js';
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
  const summary = s && s.move && Math.abs(s.move.pct || 0) >= 0.05 ? `Over the last three months: ${moveReason(s.move, moneyK)}.` : id === CITADEL ? "Citadel's settlements land in lumps, so it is held apart from core." : '';

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
  const tile = (cls, d, label, big, small) => `<div class="h2-kpi ${cls}" data-in style="--d:${d}ms"><span>${label}</span><b>${big}</b><small>${small}</small></div>`;
  const moved = s && s.move && s.move.pct != null ? (Math.abs(s.move.pct) < 0.01 ? 'level with' : `${s.move.pct > 0 ? 'up' : 'down'} ${Fmt.pct(s.move.pct, { abs: true })} on`) : null;

  main.innerHTML = `
  <div class="cp h2">
    <div class="crumb"><a href="#customers">Accounts</a><span>›</span><span style="color:var(--ink-2)">${esc(name)}</span></div>
    <div class="cp-head"><h1>${esc(name)}</h1>
    <div class="tags">
      ${id === CITADEL ? '<span class="chip">Held apart from core</span>' : ''}
      ${slipping ? `<span class="chip bad">Slipping: ${deltaText(s.move.pct)} on its own run</span>` : ''}
      ${signals && signals.not_raised_2y ? '<span class="chip warn">Missed every rate round</span>' : ''}
    </div>
    ${summary ? `<p class="cp-lede">${summary}</p>` : ''}</div>
    <section class="h2-kpis four">
      ${tile('lead', 0, 'Invoiced, last twelve months', moneyK(ltm), s ? `${share('storage')}% storage, ${share('service')}% service` : '')}
      ${s && s.move ? tile('', 80, 'Running at, a month', moneyK(s.move.last3), `${moved || 'against'} its own ${moneyK(s.move.run)} before`) : ''}
      ${costsVisible() && m && m.cost > 0 ? tile('', 160, 'Margin est.', pc != null ? Fmt.pct(pc).replace('-', '−') : '—', `${m.margin >= 0 ? 'keeps' : 'short by'} ${moneyK(Math.abs(m.margin))} on ${moneyK(m.cost)} to serve`) : ''}
      ${acct && (acct.boxes >= 1 || acct.bins) ? tile('', 240, acct.boxes >= 1 ? 'Boxes stored' : 'Bin services, a year', n0(acct.boxes >= 1 ? acct.boxes : acct.bins), acct.bins ? `${n0(acct.bins)} bin services on ${n0(acct.visits)} visits` : 'on average, over the year') : ''}
    </section>
    <section class="h2-card" data-in id="cp-chart"></section>
    <div class="cp-two">
      <section class="h2-card" data-in>
        <div class="h2-ch cp-ch"><h2>${costsVisible() ? (m && m.cost > 0 ? (m.margin >= 0 ? `Keeps ${moneyK(m.margin)} of ${moneyK(m.revenue)} est.` : `Costs ${moneyK(-m.margin)} more than it pays est.`) : 'What it buys') : 'What it buys, the last twelve months'}</h2>${F && linesOf(F).length ? '<button type="button" class="linkbtn" id="cp-jobs">Every job ›</button>' : ''}</div>
        ${costsVisible() && m && m.cost > 0 ? bridgeHtml(m.revenue, working) : ''}
        <div id="cp-fams">${F ? linesHtml(F, costsVisible(), F.noLine) : '<p class="sub">No priced lines in the last twelve months.</p>'}</div>
      </section>
      <div class="cp-side">
        ${costsVisible() ? `<section class="h2-card" data-in><div class="h2-ch"><h2>What would improve it</h2></div>${leversHtml(levers, 4)}</section>` : ''}
        <section class="h2-card cp-opps" id="cp-opps" data-in><div class="h2-ch cp-ch"><h2>Open opportunities</h2><a href="#opportunities">All ›</a></div><p class="sub">Loading…</p></section>
      </div>
    </div>
    <details class="fold cp-fold"><summary><h3>Not bought yet, prices against the book, signals</h3><span class="sub">${sigs.length ? `${sigs.length} signal${sigs.length === 1 ? '' : 's'} · ` : ''}${mine.length} prices · open</span></summary>
    <div class="grid three">
        ${wsCard(wsRow, pitch)}
        <div class="card">
          <div class="card-head"><h3>Prices against the book</h3><a href="#pricing?level1=${id}">Price it ›</a></div>
          ${mine.map(r => `<div class="price">
            <span><a href="#pricing?level1=${id}&code=${encodeURIComponent(r.servcode)}" style="color:inherit;text-decoration:none"><b>${esc(titleCase(r.service))}</b> <span style="color:var(--brand)">›</span></a><span class="sub" style="display:block">${Fmt.money(r.modal_rate, { dp: 2 })} · book median ${Fmt.money(r.med, { dp: 2 })} · ${r.suspect ? 'so far apart it is probably billed in another unit: check before quoting' : r.modal_rate < r.med ? `cheaper than ${Fmt.pct(1 - r.below)} of accounts` : `dearer than ${Fmt.pct(r.below)} of accounts`}</span></span>
            <span class="v">${r.suspect ? '<span class="chip warn">check the unit</span>' : r.worth > 0 ? `+${moneyK(r.worth)} a year<span class="sub" style="display:block;font-weight:400">at the median</span>` : '<span class="sub">at or above</span>'}</span>
            <div class="pos"><b style="left:${pos(r.med, r)}%"></b><i style="left:${pos(r.modal_rate, r)}%"></i></div>
          </div>`).join('') || '<p class="sub">No service rates in the last thirteen months.</p>'}
        </div>
        <div class="card">
          <div class="card-head"><h3>Signals</h3></div>
          <div id="cp-sigs">${sigs.map(g => { const l = said.get(g.key); return `<div class="sig" data-sig="${g.key}">${esc(g.text)}<div class="acts"><button data-v="right" class="${l && l.verdict === 'right' ? 'on' : ''}">Right</button><button data-v="not_right" class="${l && l.verdict === 'not_right' ? 'on' : ''}">Not right</button><span class="sub said">${l ? `${esc(l.who)} said ${VERB[l.verdict]}, ${when(l.logged_at)}` : ''}</span></div></div>`; }).join('') || '<p class="sub">Nothing flagged this week.</p>'}</div>
          ${log.length ? `<div class="aside" style="margin-top:var(--sp-3);padding-top:var(--sp-3);border-top:var(--hair) solid var(--rule)"><div class="lab" style="margin-bottom:var(--sp-1)">Logged</div>${log.slice(0, 5).map(l => `<div class="sub">${when(l.logged_at)} · ${esc(l.who)} · ${VERB[l.verdict]} (${esc(l.signal)})</div>`).join('')}</div>` : ''}
        </div>
    </div>
    </details>
    <details class="fold cp-fold" id="cp-where"><summary><h3>Where it is served, and its shredding visits</h3><span class="sub">last six months · open</span></summary>
    <div class="grid drill" id="cp-drill"><div class="card" style="grid-column:1/-1"><p class="sub">Loading…</p></div></div>
    </details>
  </div>`;

  // this customer's open opportunities, from the same list as Customers › Opportunities
  getJson('view/opportunities?level1=' + id).then(V => {
    const box = main.querySelector('#cp-opps'); if (!box) return;
    const open = V.rows.filter(r => r.status !== 'won' && r.status !== 'lost').slice(0, 5);
    const KIND = { cross: 'Cross-sell', price: 'Price gap', slip: 'Win back', round: 'Rate round', overdue: 'Overdue boxes' };
    box.querySelector('p').outerHTML = open.length ? `<ul class="cp-opp">${open.map(r => `<li><span><b>${esc(KIND[r.kind] || r.kind)}</b>${r.owner ? ` · ${esc(r.owner)}` : ''}${r.status !== 'open' ? ` · ${esc(r.status)}` : ''}<small>${esc(r.reason)}</small></span><em>${moneyK(r.value)}${r.once ? ' once' : ''}${r.modelled ? ' est.' : ''}</em></li>`).join('')}</ul>` : '<p class="sub">Nothing open for this customer.</p>';
  }).catch(() => { const box = main.querySelector('#cp-opps'); if (box) box.remove(); });

  const play = firstPlay('r4-customer-played');
  if (s) {
    const pts = k => s.months.map((x, i) => ({ x, y: s[k][i] }));
    const parts = ['storage', 'service'].filter(k => s[k].some(Boolean));
    lineChart(main.querySelector('#cp-chart'), {
      title: chartTitle(s), sub: `${s.months.length} months to the latest posted month · tap a month for its invoices`,
      axes: { y: '$ invoiced a month' }, play, onPick: x => openInvoices(id, x, s.customer),
      // a part never billed is said in the source line, not drawn as a line along the axis
      series: [{ name: 'Storage', cls: 'storage', points: pts('storage') }, { name: 'Service', cls: 'service', points: pts('service') }].filter(x => parts.includes(x.cls)),
      source: `VCK invoices, by invoice month · ${['storage', 'service'].filter(k => !parts.includes(k)).map(k => `no ${k} billed in these months · `).join('')}as billed`,
    });
  } else main.querySelector('#cp-chart').remove();

  const wsBox = main.querySelector('.ws1') && main.querySelector('.ws1').closest('.card');
  if (wsBox && wsRow) wsBox.addEventListener('click', ev => { const b = ev.target.closest('button.opp'); if (b) openExplainer({ row: wsRow, key: b.dataset.key, call: signals, H: M.history, names: new Map(M.accounts.map(a => [a.level1, a.customer])) }); });
  // the visits and the map, read when the fold opens
  const where = main.querySelector('#cp-where');
  if (where) where.addEventListener('toggle', () => { if (where.open && !where.dataset.read) { where.dataset.read = '1'; drawDrill(main.querySelector('#cp-drill'), loadDrill(id)); } });

  // a line opens the drawer at that line; every job, at the account
  main.querySelector('#cp-fams').addEventListener('click', ev => { const b = ev.target.closest('button.md-line'); if (b) drawer(b.dataset.f); });
  const allJobs = main.querySelector('#cp-jobs'); if (allJobs) allJobs.addEventListener('click', () => drawer());
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
  el.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-head"><h3>Shredding visits</h3><small>${d.visits.length ? `${n0(d.visits.length)} days on a route · ${n0(lbs)} lb` : 'last six months'}</small></div><div id="cp-visits"></div><div class="src">Bin and shredding stops drivers marked done in Veri-Shred, one row per day and route. Executive-bin weights are a set figure, not weighed.</div></div>`;
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
    <div class="card-head"><h3>${missing.length ? `Not bought yet: about ${moneyK(r.opp / 12)} a month est.` : lines.every(o => o.c.have) ? 'Buys every line we sell' : 'Not bought yet: too small to size'}</h3><a href="#customers?view=whitespace">Cross-sell ›</a></div>
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
    <div class="rm-grid"><div><div class="rm-wrap"></div>${zoneKey()}</div><ol class="rm-list">${places.slice(0, 12).map(p => `<li><span>${esc(p.postcode)}<small>${p.mi != null ? `${Fmt.fixed(p.mi, 1)} miles from the yard` : 'no postcode centre'} · ${p.days} day${p.days === 1 ? '' : 's'} on a route</small></span><span class="num">${Fmt.grouped(p.services)}<small>services</small></span></li>`).join('')}</ol></div>
    <div class="src">${Fmt.pct(within10 / Math.max(1, all))} of its ${Fmt.grouped(all)} done services in six months were within ten miles of the yard · Veri-Shred done orders on ${days.size} route days · postcode centres from the US Census, the likely way along main roads: no GPS was captured · districts shaded by R4's done services over twelve months</div>`;
  el.prepend(card);
  const draw = () => { const w = card.querySelector('.rm-wrap'); if (w && w.isConnected) { w.innerHTML = placesSvg(placed, { width: Math.max(280, Math.min(900, w.clientWidth || 560)), base: basemapNow(), label: title, shading: bookShading(A, Z) }); playMap(w.querySelector('svg'), { vans: 5 }); } };
  draw();
  if (!basemapNow()) loadBasemap().then(b => { if (b) draw(); });   // redrawn once the outline arrives
}
