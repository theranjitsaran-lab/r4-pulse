// The one drill for an account, from a Margin cell on Accounts or a line on the customer page: one drawer in four
// steps, keeping its place and its totals as it goes. The account's margin bridge and lines → one line's cost
// and every job in the period, uncapped → one job's cost build, with its route that day. What would improve it sits
// at each level, in dollars a year, each on its own. Every figure comes from margin.js: accountJobs shares the
// line's cost out to its jobs, so each level adds up to the one above.
//   openDrawer({ level1, name, R, row, B, family, woid, pill })   pill: the figures on what was tapped, so the head cannot disagree with it
//   bridgeHtml, linesHtml, leversHtml: the same blocks on the customer page
import * as Fmt from './format.js';
import { accountJobs, marginLevers, marginHead, marginFixes, fixChange, drawerPoints, costConfidence, ASK_NAMES, POINT_NAMES, costParts, PARTS, FAMILY_NAMES } from './margin.js';
import { drawPoints, ragLabel } from './lit.js';
import { OWNERS, ownerName } from './opps.js';
import { pricePosition } from './custbook.js';
import { allocate, loadRoadnet } from './routemap.js';
import { jobHtml, drawRouteBlock } from './jobview.js';
import { openPop, closePop } from './pop.js';
import { dataTable } from './datatable.js';
import { getJson, titleCase, esc } from './data.js';
import { costsVisible, whoAmI } from './access.js';
import { money0, moneyK } from './chart.js';

const CLS = { space: 'p-space', handling: 'p-hand', route: 'p-route', plant: 'p-plant', labour: 'p-lab' };
const NS = 'jb_';
const pc = (rev, cost) => rev > 0 ? Fmt.pct((rev - cost) / rev).replace('-', '−') : '—';
const famName = f => FAMILY_NAMES[f] || f;
const day = t => new Date(t + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
// a line with no money on it says nothing
const hasMoney = x => Math.abs(x.revenue) >= 0.5 || Math.abs(x.cost) >= 0.5;
export const linesOf = F => Object.values(F.fams).filter(hasMoney).sort((a, b) => b.revenue - a.revenue);

// Revenue, then each kind of cost stepping down from it, to what is left. Drawn on one scale; below zero it says so.
export const bridgeHtml = (revenue, lines) => bridgeParts(revenue, costParts(lines));
export function bridgeParts(revenue, parts) {
  const rows = PARTS.filter(p => (parts || {})[p[0]] > 0.5).map(p => ({ k: p[0], name: p[1], v: parts[p[0]] }));
  const cost = rows.reduce((t, r) => t + r.v, 0), left = revenue - cost, lo = Math.min(0, left), hi = Math.max(revenue, 1), span = hi - lo;
  const at = v => (v - lo) / span * 100;
  let run = revenue;
  const row = (name, from, to, cls, label, i) => `<li><span>${esc(name)}</span><div class="md-track">${lo < 0 ? `<u style="left:${at(0).toFixed(2)}%"></u>` : ''}<i class="${cls}" style="left:${at(Math.min(from, to)).toFixed(2)}%;width:${Math.max(.4, Math.abs(at(from) - at(to))).toFixed(2)}%;--i:${i}"></i></div><b>${label}</b></li>`;
  const out = [row('Revenue', 0, revenue, 'p-rev', money0(revenue), 0)];
  rows.forEach((r, i) => { out.push(row(r.name, run, run - r.v, CLS[r.k], `−${money0(r.v)}`, i + 1)); run -= r.v; });
  out.push(row(left >= 0 ? 'Left est.' : 'Short est.', 0, left, left >= 0 ? 'p-left' : 'p-loss', left < 0 ? `−${money0(-left)}` : money0(left), rows.length + 1));
  return `<ul class="md-bridge" role="img" aria-label="Revenue ${esc(money0(revenue))}, cost ${esc(money0(cost))}, ${left >= 0 ? 'left' : 'short'} ${esc(money0(Math.abs(left)))}">${out.join('')}</ul>`;
}

export function linesHtml(F, showCosts, noLine) {
  const rows = linesOf(F);
  return `<div class="md-lines ${showCosts ? '' : 'plain'}">
    <div class="md-lh"><span>Line</span><span>Revenue</span>${showCosts ? '<span>Cost est.</span><span>Margin est.</span>' : ''}</div>
    ${rows.map(x => `<button type="button" class="md-line" data-f="${esc(x.family)}"><span>${esc(famName(x.family))}</span><span>${money0(x.revenue)}</span>${showCosts ? `<span>${x.cost ? money0(x.cost) : '—'}</span><span class="${x.revenue - x.cost < 0 ? 'is-bad' : ''}">${x.family === 'other' ? '—' : `${x.revenue - x.cost < 0 ? '−' : ''}${moneyK(Math.abs(x.revenue - x.cost))} <small>${pc(x.revenue, x.cost)}</small>`}</span>` : ''}</button>`).join('') || '<p class="sub">No priced lines in the last twelve months.</p>'}
    ${Math.abs(noLine) >= 1 ? `<div class="md-line none"><span>Invoiced, no line in this period<small>work and its invoice fall in different months, or a charge with no cost behind it</small></span><span>${noLine < 0 ? '−' : ''}${money0(Math.abs(noLine))}</span>${showCosts ? '<span>—</span><span>—</span>' : ''}</div>` : ''}
  </div>`;
}

export function leversHtml(levers, limit = 6) {
  const list = levers.filter(l => l.worth >= 250).slice(0, limit);
  if (!list.length) return '<p class="sub">Nothing sized above $250 a year.</p>';
  return `<ul class="md-levers">${list.map(l => `<li><span><i class="md-kind">${l.kind === 'price' ? 'Price' : 'Operations'}</i><b>${esc(l.title)}</b><small>${esc(l.say)}</small></span><em>+${moneyK(l.worth)}</em></li>`).join('')}</ul>
    <p class="src">A year est., each on its own. They overlap, so they do not add up.</p>`;
}

// the account's jobs, once per opening of the page
const cache = new Map();
async function loadJobs(level1) {
  if (!cache.has(level1)) cache.set(level1, fetch(`/api/customer/${level1}/jobs`, { credentials: 'same-origin' }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; }).catch(e => { cache.delete(level1); throw e; }));
  return cache.get(level1);
}
const zcta = () => fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
const clearLink = () => { const [h, q] = location.hash.split('?'), u = new URLSearchParams(q || ''); for (const k of [...u.keys()]) if (k.startsWith(NS)) u.delete(k); history.replaceState(null, '', h + (u.toString() ? '?' + u : '')); };

export async function openDrawer({ level1, name, R, row = null, B = null, family = null, woid = null, pill = null }) {
  const title = titleCase(name), costs = costsVisible(), wrap = { wide: !costs, size: costs ? 'mid' : null }, subLine = costs ? 'Margin, last twelve months, est.' : 'Last twelve months';
  const position = B ? (r, k) => pricePosition(B, r, k) : null;
  const headOf = (revenue, cost) => { const h = marginHead(R, revenue, cost), conf = costConfidence(R), signed = h.pc == null ? '—' : `${h.pc < 0 ? '−' : ''}${Fmt.pct(Math.abs(h.pc))}`; return `<div class="mdh"><div class="mdh-row"><div class="mdh-v"><b class="${h.band.cls}">${signed}</b>${ragLabel(R, h.pc)}</div><div class="mdh-k"><span><small>Revenue</small><b>${moneyK(h.revenue)}</b></span><span><small>Cost</small><b>${moneyK(h.cost)}</b></span><span><small>${h.left < 0 ? 'Short' : 'Left'}</small><b>${moneyK(Math.abs(h.left))}</b></span></div></div><span class="cd-conf c${conf === 3 ? 3 : 1}"><span class="cd-dots" aria-hidden="true">${[1, 2, 3].map(i => `<i class="${i <= conf ? 'on' : ''}"></i>`).join('')}</span>${conf === 3 ? 'Costs modelled' : 'Costs modelled, provisional'}</span></div>`; };
  openPop({ title, sub: subLine, ...wrap, html: `${costs && pill ? headOf(pill.revenue, pill.cost) : ''}<p class="sub">Reading its jobs…</p>`, ask: `Why is ${title}'s margin what it is, and how do we improve it?`, onClose: clearLink });
  let J;
  try { J = await loadJobs(level1); }
  catch (e) { return openPop({ title, sub: subLine, ...wrap, html: `${costs && pill ? headOf(pill.revenue, pill.cost) + (pill.parts ? bridgeParts(pill.revenue, pill.parts) : '') : ''}<div class="pending">${esc(e.message)}</div>`, onClose: clearLink }); }
  const F = accountJobs(R, J.acct, J.lines, J.orders, costs ? { daily: J.daily, moveDaily: J.moveDaily } : {});
  const svc = new Map(Object.entries(J.services || {}));
  const revenue = pill && !family ? pill.revenue : (J.acct.storage_revenue || 0) + (J.acct.service_revenue || 0);
  const cost = pill && !family ? pill.cost : Object.values(F.fams).reduce((t, x) => t + x.cost, 0);
  const moves = costs ? await fetch(`/api/view/opportunities?level1=${level1}`, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => (j && j.data && j.data.rows) || []).catch(() => []) : [];
  const body = () => document.querySelector('.pop .pop-b');
  const totals = (rev, c, label) => `<div class="md-tot"><span><small>${esc(label)}</small><b>${money0(rev)}</b></span>${costs ? `<span><small>Cost est.</small><b>${money0(c)}</b></span><span><small>${rev - c >= 0 ? 'Left est.' : 'Short est.'}</small><b class="${rev - c < 0 ? 'is-bad' : ''}">${money0(Math.abs(rev - c))}</b></span><span><small>Margin est.</small><b class="${rev - c < 0 ? 'is-bad' : ''}">${pc(rev, c)}</b></span>` : ''}</div>`;
  const crumb = (parts) => `<nav class="md-crumb" aria-label="Where you are">${parts.map((p, i) => i < parts.length - 1 ? `<button type="button" data-go="${esc(p.go)}">${esc(p.t)}</button><span aria-hidden="true">›</span>` : `<b>${esc(p.t)}</b>`).join('')}</nav>`;
  let depth = 0;
  const paint = (html, d) => { const b = body(); if (!b || b.closest('.pop').hidden) return null; b.innerHTML = `<div class="md-step ${d < depth ? 'back' : ''}">${html}</div>`; depth = d; b.scrollTop = 0; return b.firstElementChild; };

  // ── step 1: the account ──
  // what it could do about its margin, and where each fix can be sent
  const fixes = costs ? marginFixes(marginLevers(R, J.acct, J.lines, F, { row, position }), moves, F, J.lines) : { real: [], hard: [] };
  const fixKey = f => f.key || (f.kind === 'ops' ? `route:${level1}:${f.family}` : `price:${level1}:fix-${f.family}`);
  const sendFix = async (f, owner, btn) => {
    btn.disabled = true;
    const res = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: fixKey(f), level1, status: 'open', owner, value: Math.round(f.worth), note: `${f.title}: about ${moneyK(f.worth)} a year est.` }) }).catch(() => null);
    if (!res || !res.ok) { btn.disabled = false; btn.textContent = 'That did not save. Try again'; return; }
    const done = document.createElement('span'); done.className = 'cd-sent'; done.textContent = `With ${ownerName(owner)} on Opportunities.`; btn.replaceWith(done);
  };
  const fixRow = (f, i) => `<div class="md-fx${f.best ? ' best' : ''}${f.ask === 'no' ? ' hard' : ''}"><button type="button" class="md-fxh" aria-expanded="false" data-fx="${f.ask === 'no' ? 'h' : 'r'}${i}"><span class="md-fxt">${esc(f.title)}${f.best ? '<i>Best</i>' : ''}</span><span class="md-ask ${f.ask}">${ASK_NAMES[f.ask]}</span><span class="md-fxv"><b>+${moneyK(f.worth)}</b><small>${esc(fixChange(f))}</small></span></button><div class="md-fxb" hidden><p>${esc(f.say)}</p>${f.ask === 'no' ? '' : `<div class="md-fxa">${f.code ? `<a class="pq-btn cd-a" href="#pricing?level1=${level1}&code=${esc(f.code)}">Price it in Quote</a>` : ''}<button type="button" class="pq-btn" data-send="${i}">Send to Opportunities</button></div>`}</div></div>`;
  function account() {
    clearLink();
    if (!costs) { const el = paint(`${crumb([{ t: title }])}${totals(revenue, cost, 'Revenue')}<h3>Its lines, tap one for every job</h3>${linesHtml(F, costs, F.noLine)}`, 0); if (el) el.querySelectorAll('button.md-line').forEach(b => b.addEventListener('click', () => line(b.dataset.f))); return; }
    const all = Object.values(F.fams), lines = all.flatMap(x => x.working), rows = linesOf(F).slice().sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost));
    const top = Math.max(1, ...rows.map(x => Math.max(x.revenue, x.cost)));
    const lineRow = (x, i) => { const left = x.revenue - x.cost, none = x.family === 'other' || !x.cost, pct = x.revenue > 0 ? left / x.revenue : null; return `<button type="button" class="md-ln${left < 0 ? ' loss' : ''}" data-f="${esc(x.family)}" style="--i:${i}"><span class="md-nm">${esc(POINT_NAMES[x.family] || famName(x.family))}</span><span class="md-tr"><i class="rv" style="width:${(x.revenue / top * 100).toFixed(1)}%"></i>${x.cost ? `<i class="cs" style="width:${(x.cost / top * 100).toFixed(1)}%"></i>` : ''}</span><span class="md-lf"><b>${left < 0 ? '−' : ''}${moneyK(Math.abs(left))}</b>${none ? '<small>no cost</small>' : `<span class="rag static ${marginHead(R, x.revenue, x.cost).band.cls}"><i></i>${pct < 0 && Fmt.pct(Math.abs(pct)) !== '0%' ? '−' : ''}${Fmt.pct(Math.abs(pct))}</span>`}</span></button>`; };
    const parts = costParts(lines), pools = PARTS.map(p => ({ k: p[0], name: p[1], v: parts[p[0]] || 0 })).filter(p => p.v >= .5).sort((a, b) => b.v - a.v), poolAll = pools.reduce((t, p) => t + p.v, 0);
    const byLine = `<div class="md-lns">${rows.map(lineRow).join('')}</div><div class="md-lkey"><span><i class="rv"></i>billed</span><span><i class="cs"></i>cost to serve</span><span><i class="ls"></i>costs more than it bills</span><span>Tap a line for its jobs</span></div>${Math.abs(F.noLine) >= 1 ? `<p class="md-odd">${F.noLine < 0 ? 'Less' : 'Plus'} ${money0(Math.abs(F.noLine))} billed with no matching work this period, timing.</p>` : ''}`;
    const byCost = pools.length ? `<div class="md-pools" aria-hidden="true">${pools.map((p, i) => `<i class="p${i + 1}" style="flex:${p.v.toFixed(0)} 0 0;--i:${i}"></i>`).join('')}</div><div class="md-pkey">${pools.map((p, i) => `<span><i class="p${i + 1}"></i>${esc(p.name)}<b>${moneyK(p.v)}</b></span>`).join('')}</div><p class="md-odd">${moneyK(poolAll)} to serve in all. ${esc(pools[0].name)} is ${Fmt.pct(pools[0].v / poolAll)}${pools[0].k === 'space' && J.acct.boxes ? `: the rent and racking for ${Fmt.grouped(Math.round(J.acct.boxes))} boxes` : ''}.</p>` : '<p class="sub">No costed lines in the period.</p>';
    const el = paint(`${headOf(revenue, cost)}<div id="md-pts"></div>
      <section class="md-sec"><div class="md-sh"><h3>Where the margin is made and lost</h3><span class="seg" role="group" aria-label="Break down by"><button type="button" data-v="lines" class="on" aria-pressed="true">By line</button><button type="button" data-v="cost" aria-pressed="false">By cost type</button></span></div><div id="md-view">${byLine}</div></section>
      <section class="md-sec"><div class="md-sh"><h3>Ways to improve it, a year est.</h3><small>They overlap, so they do not add up</small></div>
        ${fixes.real.length ? `<div class="md-fixes">${fixes.real.map(fixRow).join('')}</div>` : '<p class="sub">Nothing sized above what would matter.</p>'}
        ${fixes.hard.length ? `<button type="button" class="linkbtn md-more" aria-expanded="false">Show ${fixes.hard.length} not realistic as a price</button><div class="md-fixes" id="md-hard" hidden>${fixes.hard.map(fixRow).join('')}</div>` : ''}
        ${F.flat ? `<p class="md-odd">Billed as a flat fee of ${money0(F.flat)}: read the line, not each job.</p>` : ''}
      </section>`, 0);
    if (!el) return;
    drawPoints(el.querySelector('#md-pts'), drawerPoints(F, fixes, moneyK));
    const view = el.querySelector('#md-view');
    el.addEventListener('click', ev => {
      const seg = ev.target.closest('.seg button[data-v]');
      if (seg) { seg.parentElement.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b === seg); b.setAttribute('aria-pressed', String(b === seg)); }); view.innerHTML = seg.dataset.v === 'cost' ? byCost : byLine; return; }
      const ln = ev.target.closest('.md-ln'); if (ln) { line(ln.dataset.f); return; }
      const more = ev.target.closest('.md-more'); if (more) { const box = el.querySelector('#md-hard'); box.hidden = !box.hidden; more.setAttribute('aria-expanded', String(!box.hidden)); more.textContent = box.hidden ? `Show ${fixes.hard.length} not realistic as a price` : 'Hide the unrealistic ones'; return; }
      const send = ev.target.closest('[data-send]'); if (send) { const owner = (document.querySelector('.pop-x [data-md-owner]') || {}).value || OWNERS[0]; sendFix(fixes.real[+send.dataset.send], owner, send); return; }
      const fx = ev.target.closest('.md-fxh'); if (fx) { const b = fx.nextElementSibling; b.hidden = !b.hidden; fx.setAttribute('aria-expanded', String(!b.hidden)); }
    });
    const foot = document.querySelector('.pop .pop-x');
    if (foot) {
      foot.innerHTML = fixes.real[0] ? `<label class="cd-owner">Owner <select data-md-owner>${OWNERS.map(o => `<option value="${o}"${o === whoAmI() ? ' selected' : ''}>${esc(ownerName(o))}</option>`).join('')}</select></label><button type="button" class="pq-btn cd-go" data-md-top>Send the top fix to Opportunities</button>` : '';
      const go = foot.querySelector('[data-md-top]');
      if (go) go.addEventListener('click', () => sendFix(fixes.real[0], foot.querySelector('[data-md-owner]').value, go));
    }
  }

  // ── step 2: one line, every job ──
  let line = function (f, keep) {
    if (!keep) clearLink();
    const x = F.fams[f]; if (!x) return account();
    const jobs = x.jobs.filter(j => Math.abs(j.revenue) >= 0.005 || Math.abs(j.cost) >= 0.005), empty = x.jobs.length - jobs.length;
    const name2 = famName(f), flat = F.flat && f === 'bin';
    const jRev = jobs.reduce((t, j) => t + j.revenue, 0), jCost = jobs.reduce((t, j) => t + j.cost, 0);
    const short = jobs.filter(j => j.margin < 0 && !j.flatFee).length;
    const say = f === 'storage' ? `Billed monthly, so it has no jobs: ${Fmt.grouped(Math.round(J.acct.boxes))} boxes a month, on ${money0(x.revenue)} of invoices.`
      : flat ? `Billed as a flat fee of ${money0(F.flat)}, with rotations at $0: each rotation costs money and bills nothing, so read the line's total, not each job.`
      : costs && jobs.length ? `${Fmt.grouped(jobs.length)} jobs, ${Fmt.grouped(short)} of them cost more to serve than they billed est.` : `${Fmt.grouped(jobs.length)} jobs.`;
    const lv = costs ? marginLevers(R, J.acct, J.lines, F, { row, position, family: f }) : [];
    const el = paint(`${crumb([{ t: title, go: 'account' }, { t: name2 }])}${totals(x.revenue, x.cost, 'Revenue')}
      <p class="md-say">${esc(say)}</p>
      ${costs && x.working.length ? `<h3>How the cost is worked out est.</h3>${bridgeHtml(x.revenue, x.working)}<details class="md-how"><summary>The working, line by line</summary><div class="md-work">${x.working.map(l => `<div><span>${esc(l[0])}${l[3] ? ' est.' : ''}</span><b>${money0(l[1])}</b><p>${esc(l[2])}</p></div>`).join('')}</div></details>` : ''}
      ${lv.length ? `<h3>What would improve it</h3>${leversHtml(lv)}` : ''}
      ${f === 'storage' ? '' : `<h3>Every job in the period${costs ? ', worst first' : ''}</h3><div id="md-jobs"></div>
      <p class="md-tie">Jobs ${money0(jRev)} billed${costs ? `, ${money0(jCost)} cost` : ''}${costs && Math.abs(x.unallocated) >= 0.5 ? `, plus ${money0(x.unallocated)} not on any job, comes to the line's ${money0(x.cost)}.` : `, the line is ${money0(x.revenue)}${costs ? ` and ${money0(x.cost)}` : ''}.`}${empty ? ` ${Fmt.grouped(empty)} more orders carry no money on this line.` : ''}</p>
      ${x.why.length ? `<p class="src">${x.why.map(esc).join(' ')}</p>` : ''}
      <p class="src">Boxes and barcodes inside a job are not in the database: VCK's work-order detail is not in the daily push.</p>`}`, 1);
    if (!el || f === 'storage') return;
    const top = j => { const i = j.items[0]; return i ? `${Fmt.grouped(Math.round((i.units || 0) * 10) / 10)} ${titleCase(String(svc.get(i.code) || i.code))}${j.items.length > 1 ? ` +${j.items.length - 1}` : ''}` : ''; };
    const cols = [
      { k: 'date', l: 'Date', name: true, text: true, get: r => r.date, fmt: r => esc(day(r.date)), total: null, ...(costs && !flat ? {} : { sorted: true, asc: false }) },
      { k: 'what', l: 'Job', text: true, def: true, get: r => r.woid, fmt: r => `${esc(top(r))} <small>${esc(r.woid)}</small>` },
      { k: 'rev', l: 'Billed', def: true, get: r => r.revenue, fmt: r => r.flatFee ? 'flat fee' : money0(r.revenue), total: 'sum', totalFmt: money0 },
      ...(costs ? [
        { k: 'cost', l: 'Cost est.', def: true, get: r => r.cost, fmt: r => r.cost ? money0(r.cost) : '—', total: 'sum', totalFmt: money0 },
        { k: 'left', l: 'Left est.', def: true, get: r => r.margin, ...(flat ? {} : { sorted: true, asc: true }), fmt: r => r.flatFee ? '—' : `<span class="${r.margin < 0 ? 'is-bad' : ''}">${r.margin < 0 ? '−' : ''}${money0(Math.abs(r.margin))}</span>`, total: 'sum', totalFmt: v => (v < 0 ? '−' : '') + money0(Math.abs(v)) },
      ] : []),
    ];
    const list = flat ? jobs.slice().sort((a, b) => a.date < b.date ? 1 : -1) : jobs;
    dataTable(el.querySelector('#md-jobs'), { key: 'jobs', ns: NS, noun: 'jobs', plain: true, opens: true, rows: list, cols, search: r => `${r.woid} ${day(r.date)} ${r.items.map(i => svc.get(i.code) || i.code).join(' ')}`, placeholder: 'Find a job or date',
      filters: costs && !flat ? [{ k: 'short', l: 'Show', chips: true, options: [['yes', 'Cost more than billed']], test: r => r.margin < 0 }] : [],
      onRow: r => job(f, r) });
  };

  // ── step 3: one job ──
  function job(f, j) {
    const x = F.fams[f], rev = j.revenue, c = { lines: j.lines, total: j.cost, route: j.route, real: !!j.real };
    const basis = !costs || !j.route && !j.noRoute ? '' : j.noRoute ? ` No stop is recorded for this account on ${day(j.date)}, so this job carries no route cost.` : j.real ? ' Its route cost is its real share of the route that day, below.' : " Its route cost is the model's average visit: this line has no route days to read.";
    const breakeven = costs && !j.flatFee && j.margin < 0 && j.items.length && j.items[0].units > 0 ? `<li><span><i class="md-kind">Price</i><b>To cover this job</b><small>${esc(titleCase(String(svc.get(j.items[0].code) || j.items[0].code)))} at ${Fmt.money((j.items[0].revenue - j.margin) / j.items[0].units, { dp: 2 })} a unit, against ${Fmt.money(j.items[0].revenue / j.items[0].units, { dp: 2 })} today.</small></span><em>+${money0(-j.margin)}</em></li>` : '';
    const el = paint(`${crumb([{ t: title, go: 'account' }, { t: famName(f), go: 'line' }, { t: `${j.woid}, ${day(j.date)}` }])}${totals(rev, j.cost, 'Billed')}
      ${costs ? jobHtml({ o: j, items: j.items, c, svcName: svc, basis }) : `<div class="jv">${j.items.map(i => `<div class="jv-row"><span>${esc(titleCase(String(svc.get(i.code) || i.code)))} <small>${esc(i.code)}, ${Fmt.count(i.units)}</small></span><span class="num">${money0(i.revenue)}</span></div>`).join('')}</div>`}
      ${breakeven ? `<h3>What would improve it</h3><ul class="md-levers">${breakeven}</ul>` : ''}
      <p class="src">One job of ${Fmt.grouped(x.jobs.length)} on this line. Boxes and barcodes inside it are not in the database: VCK's work-order detail is not in the daily push.</p>`, 2);
    if (!el || !costs || !j.real) return;
    const box = el.querySelector('.jv-route');
    if (box) drawDay(box, j.date);
  }

  // the job's route that day, as it was costed: deliveries placed, and the account's busiest route if it was on two
  async function drawDay(box, date) {
    box.innerHTML = '<p class="sub">Reading the route…</p>';
    try {
      const [r, A, Z] = await Promise.all([fetch(`/api/customer/${level1}/routeday/${date}`, { credentials: 'same-origin' }).then(x => x.json()), getJson('activity').catch(() => null), zcta(), loadRoadnet()]);
      const mine = d => d.stops.filter(s => s.level1 === level1).reduce((t, s) => t + (s.services || 0), 0);
      const d = (r.routes || []).sort((a, b) => mine(b) - mine(a))[0];
      if (!box.isConnected) return;
      if (!d || !A) { box.innerHTML = ''; return; }
      const dayObj = { date: d.date, route: d.route, routes: r.routes.length, source: 'drill', stops: d.stops.map(s => ({ ...s, pt: Z[s.postcode] || null, mine: s.level1 === level1 })) };
      drawRouteBlock(box, { day: dayObj, alloc: allocate(R, dayObj) }, { R, A, Z });
    } catch (e) { if (box.isConnected) box.innerHTML = ''; }
  }

  // crumbs
  const b0 = body();
  if (b0 && !b0.dataset.md) { b0.dataset.md = '1'; }
  if (b0) b0.onclick = e => { const b = e.target.closest('[data-go]'); if (!b) return; if (b.dataset.go === 'account') account(); else line(current.f); };
  const current = { f: family };
  const line0 = line; line = (f, k) => { current.f = f; line0(f, k); };
  if (family && woid) { current.f = family; const hit = (F.fams[family] || { jobs: [] }).jobs.find(j => j.woid === woid); if (hit) return job(family, hit); }
  if (family) return line(family);
  account();
}
export { closePop };
