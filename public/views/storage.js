// Routes › Warehouse — Mike and Anne. Who fills the building and in what state, what can be
// shredded and what that is worth, and boxes held that are not on a storage bill. From
// /api/storage (storage_retention, status I) with pricing (rates) and margin (for the drill link).
// Every box is at one location (CHI) and rack capacity is not in the data: no percent full.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { getJson, titleCase, esc } from '/components/data.js';
import { byAccount, totals, cells, eligibleList, heldNotBilled, splitNotBilled, gridSvg, STATES } from '/components/storage.js';
import { dataTable } from '/components/datatable.js';
import { isInternal, SIZE_BANDS, inBand } from '/components/metrics.js';
import { whoAmI } from '/components/access.js';

const CSS = `
.wh .lede { font-size: 17px; line-height: 1.45; color: var(--ink-2); margin: 0 0 14px; max-width: 940px; }
.wh .wgrid { display: block; width: 100%; height: auto; }
.wh .wc.inuse { fill: color-mix(in srgb, var(--s-storage) 28%, var(--surface)); }
.wh .wc.old { fill: var(--s-storage); }
.wh .wc.eligible { fill: var(--s-service); }
.wh .wc.protected { fill: var(--ink-4); }
.wh .wc.dim { opacity: .18; }
.wh .wkey { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--ink-3); margin: 10px 0 0; }
.wh .wkey i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.wh .gwrap { position: relative; }
.wh .hd, .wh .rw { display: grid; grid-template-columns: minmax(0, 1fr) 110px 130px 130px 90px 90px 14px; gap: 12px; align-items: center; }
.wh .hd { font-size: 12px; color: var(--ink-3); padding: 0 4px 8px; } .wh .hd span:nth-child(n+2) { text-align: right; }
.wh .rw { padding: 9px 4px; border-top: 1px solid var(--rule); color: inherit; text-decoration: none; }
.wh a.rw:hover { background: var(--well); }
.wh .rw .nm { font-weight: 600; line-height: 1.3; } .wh .rw .nm small { display: block; font-weight: 400; font-size: 12px; color: var(--ink-3); }
.wh .rw .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.wh .rw .go { color: var(--ink-5); font-size: 20px; }
.wh .tot { border-top: 1px solid var(--rule-ink); font-weight: 700; }
.wh .nb .hd, .wh .nb .rw { grid-template-columns: minmax(0, 1fr) 120px 120px 120px 14px; }
.wh .cols { display: grid; grid-template-columns: 1fr; gap: 14px; margin-top: 14px; }
@media (max-width: 860px) {
  .wh .hd { display: none; }
  .wh .rw { grid-template-columns: minmax(0, 1fr) 92px 14px; grid-template-areas: "nm el go" "nm on go"; gap: 2px 10px; }
  .wh .rw .nm { grid-area: nm; } .wh .rw .el { grid-area: el; } .wh .rw .on { grid-area: on; font-size: 12px; color: var(--ink-3); } .wh .rw .go { grid-area: go; }
  .wh .rw .lo, .wh .rw .mo, .wh .rw .sh { display: none; }
  .wh .nb .rw { grid-template-columns: minmax(0, 1fr) 84px 14px; grid-template-areas: "nm gp go" "nm bl go"; }
  .wh .nb .rw .gp { grid-area: gp; } .wh .nb .rw .bl { grid-area: bl; font-size: 12px; color: var(--ink-3); } .wh .nb .rw .hl { display: none; }
}`;

const n0 = v => Math.round(v || 0).toLocaleString('en-US');
const k0 = v => v >= 10000 ? Math.round(v / 1000).toLocaleString('en-US') + 'K' : n0(v);
const pc = v => Math.round(v * 100) + '%';
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export async function render(main, tabs) {
  if (!main) return;
  if (!document.getElementById('wh-css')) { const s = document.createElement('style'); s.id = 'wh-css'; s.textContent = CSS; document.head.appendChild(s); }
  let S, PR, MG;
  try { [S, PR, MG] = await Promise.all([getJson('storage'), getJson('pricing'), getJson('margin')]); }
  catch (e) {
    main.innerHTML = `<div class="rt wh">${tabs}<div class="empty" style="border:1px dashed var(--rule-3);border-radius:var(--r);padding:18px"><b>Warehouse data is not in this snapshot yet.</b> It arrives with the next refresh.</div></div>`;
    return;
  }
  const acc = byAccount(S), T = totals(acc), G = cells(acc, 1000);
  const E = eligibleList(acc, PR, T.boxes), NB = heldNotBilled(acc, PR);
  const SP = splitNotBilled(NB.rows, new Map(MG.accounts.map(a => [a.level1, (a.storage_revenue || 0) + (a.service_revenue || 0)])), isInternal), nbRows = SP.rows;
  const nbTop = SP.active[0] && SP.active[0].gap >= SP.activeBoxes * .4 ? SP.active[0] : null;
  const m = S.months, last = m[m.length - 1], yearAgo = m[m.length - 13];
  const yoy = yearAgo ? last.boxes / yearAgo.boxes - 1 : null;
  const top = acc[0];
  const say = `${n0(T.boxes)} boxes in storage${yoy != null ? `; the storage bill carried ${yoy >= 0 ? 'up' : 'down'} ${pc(Math.abs(yoy))} on a year ago` : ''}. At least <b>${n0(T.eligible)}</b> (${pc(T.eligible / T.boxes)}) are past their retention review and could be shredded today est., and ${pc(T.ten / T.boxes)} of the building is over ten years old. ${esc(titleCase(top.customer))} alone holds ${pc(top.boxes / T.boxes)}.`;

  main.innerHTML = `
  <div class="rt wh">
    ${tabs}
    <p class="lede">${say}</p>
    <div class="card">
      <div class="card-head"><h3>The building by who fills it: one square for every ${G.per.toLocaleString('en-US')} boxes</h3><small>hover or tap a group</small></div>
      <div class="gwrap"><div id="wh-grid"></div><div class="c-tip" hidden></div></div>
      <div class="wkey">${STATES.map(([k, l]) => `<span><i style="background:${k === 'inuse' ? 'color-mix(in srgb, var(--s-storage) 28%, var(--surface))' : k === 'old' ? 'var(--s-storage)' : k === 'eligible' ? 'var(--s-service)' : 'var(--ink-4)'}"></i>${l} ${k0(T[k])}</span>`).join('')}</div>
      <div class="src">VCK boxes in storage, all at one location (Chicago) · accounts largest first, those under ${G.per.toLocaleString('en-US')} boxes together at the end · eligible is review overdue less permanent and legal hold, at least est. · rack capacity is not in the data, so this shows what is held, not how full the building is</div>
    </div>
    <div class="cols">
      <div class="card">
        <div class="card-head"><h3>Shredding the eligible boxes would bill about ${moneyK(E.once)} once and end ${moneyK(E.lost)} a month of storage est.</h3></div>
        <div id="wh-elig"></div>
        <div class="src">Destruction at the book's median fee, $${(E.perBox || 0).toFixed(2)} a box; storage at each account's own rate per box (else the book's median) · "pays back" is the months of lost storage the destruction bill covers · <a href="#customers?view=destruction" style="color:var(--brand)">Overdue boxes by account ›</a></div>
      </div>
      <div class="card nb">
        <div class="card-head"><h3>${n0(SP.activeBoxes)} boxes at ${SP.active.length} current accounts are not on the ${NB.month ? mon(NB.month) : 'latest'} storage bill</h3></div>
        <p class="sub" style="margin:0 0 8px">${nbTop ? `${esc(titleCase(nbTop.customer))} alone has ${n0(nbTop.gap)}. ` : ''}Current means invoiced in the last twelve months. Another ${SP.dormant.length} dormant accounts hold ${n0(SP.dormantBoxes)} boxes; the filter shows them.${SP.internalBoxes ? ` R4's own and placeholder accounts (${n0(SP.internalBoxes)} boxes) are left out.` : ''} It may be timing or prepaid storage; Anne to confirm before anyone calls.</p>
        <div id="wh-nb"></div>
        <div class="src">Held: boxes in storage · billed: boxes on the latest month's storage bill</div>
      </div>
    </div>
    <div class="card" id="wh-trend" style="margin-top:14px"></div>
    <p class="foot"><a class="how-link" href="#how">How it's calculated ›</a></p>
  </div>`;

  // the grid, drawn at its width, with a hover per account block
  const gEl = main.querySelector('#wh-grid'), wrap = main.querySelector('.gwrap'), tip = main.querySelector('.c-tip');
  gEl.innerHTML = gridSvg(G, { width: Math.max(300, gEl.clientWidth || 900), size: (gEl.clientWidth || 900) < 600 ? 7 : 9 });
  const show = (bi, ev) => {
    const b = G.blocks[bi]; if (!b) return;
    gEl.querySelectorAll('.wc').forEach(c => c.classList.toggle('dim', +c.dataset.b !== bi));
    tip.innerHTML = `<b>${esc(titleCase(b.customer))}</b><span>${n0(b.boxes)} boxes, ${pc(b.boxes / T.boxes)} of the building</span><span>eligible to shred <b>${n0(b.eligible)}</b> est.</span><span>over ten years, review not due ${n0(b.old)} · protected ${n0(b.protected)}</span>${b.oldest ? `<span>oldest box received ${esc(b.oldest.slice(0, 4))}</span>` : ''}`;
    const r = wrap.getBoundingClientRect(), x = (ev.touches ? ev.touches[0] : ev).clientX - r.left, y = (ev.touches ? ev.touches[0] : ev).clientY - r.top;
    tip.hidden = false;
    tip.style.left = Math.max(110, Math.min(r.width - 110, x)) + 'px';
    tip.style.top = (y > r.height / 2 ? y - tip.offsetHeight - 12 : y + 14) + 'px';
  };
  gEl.addEventListener('mousemove', ev => { const c = ev.target.closest('.wc'); if (c) show(+c.dataset.b, ev); });
  gEl.addEventListener('click', ev => { const c = ev.target.closest('.wc'); if (c) show(+c.dataset.b, ev); });
  gEl.addEventListener('mouseleave', () => { tip.hidden = true; gEl.querySelectorAll('.dim').forEach(c => c.classList.remove('dim')); });

  const open = r => { location.hash = '#customer/' + r.level1; };
  const size = { k: 'size', l: 'Boxes held', options: [['a', 'Under 1,000'], ['b', '1,000 to 10,000'], ['c', 'Over 10,000']], test: (r, v) => { const b = r.boxes != null ? r.boxes : r.held; return v === 'a' ? b < 1000 : v === 'b' ? b >= 1000 && b < 10000 : b >= 10000; } };
  const nm = { k: 'customer', l: 'Account', name: true, text: true, get: r => titleCase(r.customer), fmt: r => `<a href="#customer/${r.level1}">${esc(titleCase(r.customer))}</a>` };
  dataTable(main.querySelector('#wh-elig'), { key: 'eligible', ns: 'e_', noun: 'accounts', who: whoAmI(), rows: E.rows, filters: [size], search: r => r.customer, placeholder: 'Find an account', onRow: open,
    cols: [nm,
      { k: 'eligible', l: 'Eligible boxes', short: 'Eligible', def: true, sorted: true, get: r => r.eligible, total: 'sum', fmt: r => n0(r.eligible) },
      { k: 'once', l: 'Bill once est.', def: true, get: r => r.once, total: 'sum', totalFmt: v => money0(v), fmt: r => money0(r.once) },
      { k: 'lost', l: 'Storage lost, a month', short: 'Lost a month', def: true, get: r => r.lost, total: 'sum', totalFmt: v => money0(v), fmt: r => money0(r.lost) },
      { k: 'boxes', l: 'Boxes held', get: r => r.boxes, total: 'sum', fmt: r => n0(r.boxes) },
      { k: 'months', l: 'Pays back, months', get: r => r.months, fmt: r => r.months != null ? Math.round(r.months) : '—' },
      { k: 'share', l: 'Of the building', get: r => r.share, fmt: r => (r.share * 100).toFixed(1) + '%' },
    ] });
  dataTable(main.querySelector('#wh-nb'), { key: 'notbilled', ns: 'n_', noun: 'accounts', who: whoAmI(), rows: nbRows, defaults: { status: 'current' }, filters: [{ k: 'status', l: 'Status', options: [['current', 'Current accounts'], ['dormant', 'Dormant accounts']], test: (r, v) => v === 'dormant' ? r.dormant : !r.dormant }, size], search: r => r.customer, placeholder: 'Find an account', onRow: open,
    cols: [nm,
      { k: 'gap', l: 'Boxes not billed', def: true, sorted: true, get: r => r.gap, total: 'sum', fmt: r => n0(r.gap) },
      { k: 'held', l: 'Held', get: r => r.held, total: 'sum', fmt: r => n0(r.held) },
      { k: 'billed', l: 'Billed', get: r => r.billed, total: 'sum', fmt: r => r.billed ? n0(r.billed) : 'none' },
    ] });

  if (m.length > 1) lineChart(main.querySelector('#wh-trend'), {
    title: yoy != null ? `The storage bill carried ${n0(last.boxes)} boxes in ${mon(last.month)}, ${yoy >= 0 ? 'up' : 'down'} ${(Math.abs(yoy) * 100).toFixed(1)}% on a year ago` : 'Boxes on the storage bill',
    series: [{ name: 'Boxes billed', cls: 'storage', points: m.map(x => ({ x: x.month, y: x.boxes })) }],
    yFormat: v => Math.round(v / 1000).toLocaleString('en-US') + 'K', height: 220,
    source: 'VCK · boxes on each month\'s storage bill',
  });
}
