// Routes › Warehouse — Mike and Anne. Who fills the building and in what state, what can be
// shredded and what that is worth, and boxes held that are not on a storage bill. From
// /api/storage (storage_retention, status I) with pricing (rates) and margin (for the drill link).
// Every box is at one location (CHI) and rack capacity is not in the data: no percent full.
import { lineChart, money0, moneyK } from '/components/chart.js';
import { getJson, titleCase, esc } from '/components/data.js';
import { byAccount, totals, cells, eligibleList, heldNotBilled, gridSvg, STATES } from '/components/storage.js';

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
  let S, PR;
  try { [S, PR] = await Promise.all([getJson('storage'), getJson('pricing')]); }
  catch (e) {
    main.innerHTML = `<div class="rt wh">${tabs}<div class="empty" style="border:1px dashed var(--rule-3);border-radius:var(--r);padding:18px"><b>Warehouse data is not in this snapshot yet.</b> It arrives with the next <code>npm run snapshot</code> on the PC (storage_retention, boxes in storage by account and state).</div></div>`;
    return;
  }
  const acc = byAccount(S), T = totals(acc), G = cells(acc, 1000);
  const E = eligibleList(acc, PR, T.boxes), NB = heldNotBilled(acc, PR);
  const m = S.months, last = m[m.length - 1], yearAgo = m[m.length - 13];
  const yoy = yearAgo ? last.boxes / yearAgo.boxes - 1 : null;
  const top = acc[0];
  const say = `${n0(T.boxes)} boxes in storage${yoy != null ? `; the storage bill carried ${yoy >= 0 ? 'up' : 'down'} ${pc(Math.abs(yoy))} on a year ago` : ''}. At least <b>${n0(T.eligible)}</b> (${pc(T.eligible / T.boxes)}) are past their retention review and could be shredded today ◇, and ${pc(T.ten / T.boxes)} of the building is over ten years old. ${esc(titleCase(top.customer))} alone holds ${pc(top.boxes / T.boxes)}.`;

  main.innerHTML = `
  <div class="rt wh">
    ${tabs}
    <p class="lede">${say}</p>
    <div class="card">
      <div class="card-head"><h3>The building by who fills it: one square for every ${G.per.toLocaleString('en-US')} boxes</h3><small>hover or tap a group</small></div>
      <div class="gwrap"><div id="wh-grid"></div><div class="c-tip" hidden></div></div>
      <div class="wkey">${STATES.map(([k, l]) => `<span><i style="background:${k === 'inuse' ? 'color-mix(in srgb, var(--s-storage) 28%, var(--surface))' : k === 'old' ? 'var(--s-storage)' : k === 'eligible' ? 'var(--s-service)' : 'var(--ink-4)'}"></i>${l} ${k0(T[k])}</span>`).join('')}</div>
      <div class="src">VCK storage_retention, boxes in storage (status I), all at one location (CHI) · accounts largest first, those under ${G.per.toLocaleString('en-US')} boxes together at the end · eligible is review overdue less permanent and legal hold, at least ◇ · rack capacity is not in the data, so this shows what is held, not how full the building is</div>
    </div>
    <div class="cols">
      <div class="card">
        <div class="card-head"><h3>Shredding the eligible boxes would bill about ${moneyK(E.once)} once and end ${moneyK(E.lost)} a month of storage ◇</h3></div>
        <div class="hd"><span>Account</span><span>Eligible</span><span>Billed once</span><span>Storage ends</span><span>Pays back</span><span>Of building</span><span></span></div>
        <div id="wh-elig"></div>
        <div class="src">Destruction at the book's median R3, $${(E.perBox || 0).toFixed(2)} a box; storage at each account's own rate per box (else the book's median) · "pays back" is the months of lost storage the destruction bill covers · <a href="#customers?view=destruction" style="color:var(--brand)">Overdue boxes by account ›</a></div>
      </div>
      <div class="card nb">
        <div class="card-head"><h3>${n0(NB.gap)} boxes are in storage but not on the ${NB.month ? mon(NB.month) : 'latest'} storage bill</h3></div>
        <p class="sub" style="margin:0 0 8px">${NB.none.length} accounts with ${n0(NB.none.reduce((t, r) => t + r.gap, 0))} boxes had no storage bill at all. It may be timing or prepaid storage; Anne to confirm before anyone calls.</p>
        <div class="hd"><span>Account</span><span>Held</span><span>Billed</span><span>Not billed</span><span></span></div>
        <div id="wh-nb"></div>
        <div class="src">Held: storage_retention, status I · billed: storage_rate_hist, boxes on the latest month's storage bill</div>
      </div>
    </div>
    <div class="card" id="wh-trend" style="margin-top:14px"></div>
    <p class="foot">Box types: ${Object.entries(acc.reduce((t, a) => { for (const [k, v] of Object.entries(a.types)) t[k] = (t[k] || 0) + v; return t; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${esc(k)} ${pc(v / T.boxes)}`).join(' · ')} (codes to confirm with Anne). Boxes out, withdrawn or destroyed carry other status codes and are not drawn until their meaning is confirmed.</p>
  </div>`;

  // the grid, drawn at its width, with a hover per account block
  const gEl = main.querySelector('#wh-grid'), wrap = main.querySelector('.gwrap'), tip = main.querySelector('.c-tip');
  gEl.innerHTML = gridSvg(G, { width: Math.max(300, gEl.clientWidth || 900), size: (gEl.clientWidth || 900) < 600 ? 7 : 9 });
  const show = (bi, ev) => {
    const b = G.blocks[bi]; if (!b) return;
    gEl.querySelectorAll('.wc').forEach(c => c.classList.toggle('dim', +c.dataset.b !== bi));
    tip.innerHTML = `<b>${esc(titleCase(b.customer))}</b><span>${n0(b.boxes)} boxes, ${pc(b.boxes / T.boxes)} of the building</span><span>eligible to shred <b>${n0(b.eligible)}</b> ◇</span><span>over ten years, review not due ${n0(b.old)} · protected ${n0(b.protected)}</span>${b.oldest ? `<span>oldest box received ${esc(b.oldest.slice(0, 4))}</span>` : ''}`;
    const r = wrap.getBoundingClientRect(), x = (ev.touches ? ev.touches[0] : ev).clientX - r.left, y = (ev.touches ? ev.touches[0] : ev).clientY - r.top;
    tip.hidden = false;
    tip.style.left = Math.max(110, Math.min(r.width - 110, x)) + 'px';
    tip.style.top = (y > r.height / 2 ? y - tip.offsetHeight - 12 : y + 14) + 'px';
  };
  gEl.addEventListener('mousemove', ev => { const c = ev.target.closest('.wc'); if (c) show(+c.dataset.b, ev); });
  gEl.addEventListener('click', ev => { const c = ev.target.closest('.wc'); if (c) show(+c.dataset.b, ev); });
  gEl.addEventListener('mouseleave', () => { tip.hidden = true; gEl.querySelectorAll('.dim').forEach(c => c.classList.remove('dim')); });

  const eRows = E.rows.slice(0, 25);
  main.querySelector('#wh-elig').innerHTML = eRows.map(r => `<a class="rw" href="#customers?view=margin&id=${r.level1}">
      <span class="nm">${esc(titleCase(r.customer))}<small>${n0(r.boxes)} boxes held</small></span>
      <span class="v el">${n0(r.eligible)}</span><span class="v on">${money0(r.once)}</span><span class="v lo">${money0(r.lost)}/mo</span>
      <span class="v mo">${r.months != null ? Math.round(r.months) + ' mo' : '—'}</span><span class="v sh">${(r.share * 100).toFixed(1)}%</span><span class="go">›</span></a>`).join('')
    + `<div class="rw tot"><span class="nm">${E.rows.length} accounts</span><span class="v el">${n0(E.eligible)}</span><span class="v on">${money0(E.once)}</span><span class="v lo">${money0(E.lost)}/mo</span><span class="v mo"></span><span class="v sh">${(E.eligible / T.boxes * 100).toFixed(0)}%</span><span></span></div>`;
  main.querySelector('#wh-nb').innerHTML = NB.rows.slice(0, 15).map(r => `<a class="rw" href="#customer/${r.level1}">
      <span class="nm">${esc(titleCase(r.customer))}${r.none ? '<small>no storage bill at all</small>' : ''}</span>
      <span class="v hl">${n0(r.held)}</span><span class="v bl">${r.billed ? n0(r.billed) + ' billed' : 'none billed'}</span><span class="v gp">${n0(r.gap)}</span><span class="go">›</span></a>`).join('');

  if (m.length > 1) lineChart(main.querySelector('#wh-trend'), {
    title: yoy != null ? `The storage bill carried ${n0(last.boxes)} boxes in ${mon(last.month)}, ${yoy >= 0 ? 'up' : 'down'} ${(Math.abs(yoy) * 100).toFixed(1)}% on a year ago` : 'Boxes on the storage bill',
    series: [{ name: 'Boxes billed', cls: 'storage', points: m.map(x => ({ x: x.month, y: x.boxes })) }],
    yFormat: v => Math.round(v / 1000).toLocaleString('en-US') + 'K', height: 220,
    source: 'VCK storage_rate_hist · boxes on each month\'s storage bill',
  });
}
