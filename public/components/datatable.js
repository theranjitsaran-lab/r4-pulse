// One table and one filter bar for every list. Search and up to six filters, each a removable chip with a
// count ("42 of 376"), all kept in the link; three or four columns by default and the rest behind Columns; sort
// by header; a total row worked out on the filtered rows; saved views; Download CSV of what is showing. 13px
// figures on 28px rows, with the header, name column and total row staying put. 50 rows, then Show all.
// With months, the columns are months, latest on the right, then YTD and 12 months past a rule; a 3 / 12 month
// switch, phones opening on 3; a month in progress is hatched and says est.
//
//   dataTable(el, { key, ns, noun, rows, cols, months, filters, search, onRow, views, say, page, inTotal, totalLabel })
//     cols     [{ k, l, short?, get, fmt?, csv?, def?, name?, text?, total? }], or (state) => that list; short is the phone's label
//              total: 'sum', or (rows) => html
//     filters  [{ k, l, options: [[value, label]], test: (row, value, state) => boolean, hidden?, chips? }]
//              chips: a row of buttons, not a select; hidden: in the link and the chips below, not the bar
//              seg: a switch, always on one of its options (give it a default in defaults); never a removable chip
//     months   { list: [every month, oldest first], est: [months in progress], get: (row, month) => value,
//                cell?: (row, month) => html, flag?: false for no colour,
//                sumCell?: (row, months) => html, totalCell?: (rows, months) => html }
//     rest     true: what Show all would add is one 'All other' row, so the columns foot from the start
//     ref      { label, get: month => value }: a reference row under the total
//     expand   async row => [{ name, values: { month: value } }]: a tap opens the row's own rows
//     detail   row => html: a tap opens it under the row
//     ns       a prefix for the table's link state, where a page has more than one table
//     inTotal  which rows the total counts, where one is held apart
//     opens    the row opens something through onRow: it takes the keyboard too
//     plain    only search, filters and CSV: for a table inside a drawer
//     phone    'cards': at phone width each row is a card, using these same columns; col.card 'lead' is the value beside the name, 'full' a line of its own
import * as Fmt from './format.js';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// a month's figure in the months' columns: $K, no unit on each cell
export const kOnly = Fmt.thousands;
const FAILED = 'failed';   // a row whose own rows could not be read: never drawn as a row with none
const monthName = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + ' ' + m.slice(2, 4);
const kCell = v => v ? kOnly(v) : '—';

// ── what can be tested without a page ──
// A month earns colour only when it is more than 25% and $5K from its row's own 12-month average.
export function monthFlag(v, year) {
  const base = year.reduce((t, x) => t + (Number(x) || 0), 0) / (year.length || 1), d = (Number(v) || 0) - base;
  if (Math.abs(d) <= 5000 || Math.abs(d) <= Math.abs(base) * .25) return '';
  return d < 0 ? 'dn' : 'upx';
}
// the months shown, then the year to date and the last twelve, whatever the switch shows
export function monthCols(M, span) {
  const last12 = M.list.slice(-12), year = M.list[M.list.length - 1].slice(0, 4), ytd = M.list.filter(m => m.startsWith(year));
  const over = (r, ms) => ms.reduce((t, m) => t + (Number(M.get(r, m)) || 0), 0);
  const sum = (k, l, ms, extra) => ({ k, l, ms, fixed: true, sum: true, get: r => over(r, ms), fmt: r => M.sumCell ? M.sumCell(r, ms) : kCell(over(r, ms)), total: 'sum', totalFmt: kOnly, totalHtml: M.totalCell ? rows => M.totalCell(rows, ms) : null, ...extra });
  return [
    ...M.list.slice(-span).map(m => ({
      k: m, l: monthName(m), month: m, fixed: true, est: !!(M.est && M.est.includes(m)), get: r => M.get(r, m), total: 'sum', totalFmt: kOnly, totalHtml: M.totalCell ? rows => M.totalCell(rows, [m]) : null,
      fmt: r => M.cell ? M.cell(r, m) : kCell(M.get(r, m)),
      cellCls: M.flag === false ? null : r => { const c = M.cls ? M.cls(r, m) : null; return c != null ? c : monthFlag(M.get(r, m), last12.map(x => M.get(r, x))); },
    })),
    sum('ytd', 'YTD', ytd, { first: true }),
    sum('l12', '12 months', last12, { sorted: true }),
  ];
}
export function filterRows(rows, o, st) {
  const q = (st.q || '').trim().toLowerCase();
  return rows.filter(r => (!q || !o.search || o.search(r).toLowerCase().includes(q))
    && (o.filters || []).every(f => !st.f[f.k] || f.test(r, st.f[f.k], st)));
}
export function sortRows(rows, col, dir) {
  if (!col || !col.get) return rows;
  return rows.slice().sort((a, b) => {
    const x = col.get(a), y = col.get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = col.text ? String(x).localeCompare(String(y)) : x - y;
    return dir === 1 ? c : -c;
  });
}
export const sumOf = (rows, col) => rows.reduce((t, r) => t + (Number(col.get(r)) || 0), 0);
export function toCsv(rows, cols) {
  const cell = v => { if (v == null) return ''; const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map(c => cell(c.l)).join(','), ...rows.map(r => cols.map(c => cell(c.csv ? c.csv(r) : c.get ? c.get(r) : '')).join(','))].join('\r\n');
}
// the table's state to and from the link
export function readState(p = {}, o = {}) {
  const ns = o.ns || '', f = {};
  for (const x of o.filters || []) if (p[ns + 'f_' + x.k]) f[x.k] = p[ns + 'f_' + x.k];
  return { q: p[ns + 'q'] || '', f, sort: p[ns + 'sort'] || null, dir: p[ns + 'dir'] === 'up' ? 1 : -1, cols: p[ns + 'cols'] ? p[ns + 'cols'].split(',') : null, span: p[ns + 'span'] === '3' ? 3 : p[ns + 'span'] === '12' ? 12 : null };
}
export function stateQuery(st, ns = '') {
  const u = new URLSearchParams();
  if (st.q) u.set(ns + 'q', st.q);
  for (const [k, v] of Object.entries(st.f)) if (v) u.set(ns + 'f_' + k, v);
  if (st.sort) { u.set(ns + 'sort', st.sort); if (st.dir === 1) u.set(ns + 'dir', 'up'); }
  if (st.cols) u.set(ns + 'cols', st.cols.join(','));
  if (st.span) u.set(ns + 'span', String(st.span));
  return u.toString();
}
// this table's state in a link, leaving everything else in it alone
export function withState(hash, st, ns = '') {
  const [h, qs] = hash.split('?'), u = new URLSearchParams(qs || '');
  const mine = k => ns ? k.startsWith(ns) : ['q', 'sort', 'dir', 'cols', 'span'].includes(k) || k.startsWith('f_');
  for (const k of [...u.keys()]) if (mine(k)) u.delete(k);
  for (const [k, v] of new URLSearchParams(stateQuery(st, ns))) u.set(k, v);
  const out = u.toString();
  return h + (out ? '?' + out : '');
}

// ── saved views, on this device for this person ──
const SAVED = (who, key) => `r4-views|${who || ''}|${key}`;
const loadSaved = (who, key) => { try { return JSON.parse(localStorage.getItem(SAVED(who, key))) || []; } catch { return []; } };
const keepSaved = (who, key, v) => { try { localStorage.setItem(SAVED(who, key), JSON.stringify(v)); } catch {} };

export function dataTable(el, o) {
  if (!el) return;
  const ns = o.ns || '';
  const st = readState(Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || '')), o);
  for (const [k, v] of Object.entries(o.defaults || {})) if (!st.f[k]) st.f[k] = v;
  const PAGE = o.page || 50, index = new Map(o.rows.map((r, i) => [r, i])), opened = new Map();
  let shown = PAGE;
  const spanNow = () => st.span || (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 3 : 12);
  const colsAll = () => [...(typeof o.cols === 'function' ? o.cols(st) : o.cols), ...(o.months ? monthCols(o.months, spanNow()) : [])];
  const colsOn = () => colsAll().filter(c => c.name || c.fixed || (st.cols ? st.cols.includes(c.k) : c.def));
  const views = () => [...(o.views || []), ...loadSaved(o.who, o.key)];
  el.classList.add('dt');
  if (o.plain) el.classList.add('dt-plain');
  if (o.phone === 'cards') el.classList.add('dt-cards');
  el.innerHTML = `<div class="dt-tools">
      ${o.search ? `<input class="dt-find" type="search" placeholder="${esc(o.placeholder || 'Find')}" aria-label="${esc(o.placeholder || 'Find')}" value="${esc(st.q)}">` : ''}
      <button type="button" class="dt-ftoggle" aria-expanded="false">More</button>
      ${(o.filters || []).filter(f => f.seg).map(f => `<span class="seg dt-seg" role="group" aria-label="${esc(f.l)}">${f.options.map(([v, l]) => `<button type="button" data-k="${f.k}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</span>`).join('')}
      ${(o.filters || []).filter(f => !f.hidden && f.chips).map(f => `<span class="dt-types" role="group" aria-label="${esc(f.l)}">${f.options.map(([v, l]) => `<button type="button" class="dt-type" data-k="${f.k}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</span>`).join('')}
      ${(o.filters || []).filter(f => !f.hidden && !f.chips && !f.seg).map(f => `<select class="dt-f" data-k="${f.k}" aria-label="${esc(f.l)}"><option value="">${esc(f.l)}</option>${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`).join('')}
      ${o.months ? '<span class="seg dt-span" role="group" aria-label="Months shown"><button type="button" data-span="3">3 months</button><button type="button" data-span="12">12 months</button></span>' : ''}
      <details class="dt-cols"><summary>Columns</summary><div class="dt-colbox"></div></details>
      <details class="dt-menu"><summary aria-label="Saved views and download">⋯</summary><div class="dt-menubox"><select class="dt-views" aria-label="Saved views"></select><button type="button" class="dt-csv">Download CSV</button></div></details>
    </div>
    <div class="dt-chips"></div>
    <div class="dt-scroll"><table class="dt-t"></table></div>
    <div class="dt-more"></div>
    ${o.months && o.months.flag !== false ? `<div class="dt-legend">${o.months.est && o.months.est.length ? '<span><i class="est"></i>est.: not billed yet</span>' : ''}<span><i class="dn"></i>more than 25% and $5K below the row\u2019s own 12-month average</span><span><i class="upx"></i>more than 25% and $5K above it</span></div>` : ''}`;
  const $ = s => el.querySelector(s), table = $('.dt-t');
  const keep = () => history.replaceState(null, '', withState(location.hash, st, ns));

  function draw() {
    const all = colsAll(), cols = colsOn(), refNow = typeof o.ref === 'function' ? o.ref(st) : o.ref;
    const rows = filterRows(o.rows, o, st);
    const col = cols.find(c => c.k === st.sort && c.get) || cols.find(c => c.sorted) || cols.find(c => c.get && !c.name) || cols[0];
    const sorted = sortRows(rows, col, st.sort ? st.dir : col.asc || (col.text && col.asc !== false) ? 1 : -1);
    // the filter bar: selects and chips say the same thing
    el.querySelectorAll('.dt-f').forEach(s => { s.value = st.f[s.dataset.k] || ''; s.classList.toggle('on', !!s.value); });
    const chips = (o.filters || []).filter(f => st.f[f.k] && !f.seg).map(f => { const lab = (f.options.find(([v]) => v === st.f[f.k]) || [])[1] || st.f[f.k]; return `<button type="button" class="dt-chip" data-k="${f.k}">${esc(lab)} ×</button>`; });
    if (st.q) chips.unshift(`<button type="button" class="dt-chip" data-k="__q">“${esc(st.q)}” ×</button>`);
    $('.dt-chips').innerHTML = `<b>${Fmt.grouped(rows.length)}${rows.length !== o.rows.length ? ` of ${Fmt.grouped(o.rows.length)}` : ''}</b>${o.say || o.noun ? ` <span>${esc(o.say ? o.say(st, rows) : o.noun)}</span>` : ''}${chips.join('')}`;
    el.querySelectorAll('.dt-span button').forEach(b => b.classList.toggle('on', +b.dataset.span === spanNow()));
    el.querySelectorAll('.dt-seg button').forEach(b => { const on = st.f[b.dataset.k] === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    el.querySelectorAll('.dt-type').forEach(b => { const on = st.f[b.dataset.k] === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    $('.dt-cols').hidden = !all.some(c => !c.name && !c.fixed);
    $('.dt-colbox').innerHTML = all.filter(c => !c.name && !c.fixed).map(c => `<label><input type="checkbox" data-c="${c.k}" ${cols.some(x => x.k === c.k) ? 'checked' : ''}> ${esc(c.l)}</label>`).join('');
    const vs = views(), cur = stateQuery({ ...st, cols: null, sort: null }, ns);
    $('.dt-views').innerHTML = `<option value="">Saved views</option>${vs.map((v, i) => `<option value="${i}" ${v.q === cur && cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}${(o.filters || []).length || st.q ? '<option value="save">Save this view…</option>' : ''}`;
    // the table
    const tdCls = c => `${c.text || c.name ? 'tl' : ''}${c.est ? ' est' : ''}${c.first ? ' dt-sum' : ''}${c.cls ? ' ' + c.cls : ''}${c.card ? ' c-' + c.card : ''}`;
    const lab = c => o.phone === 'cards' && !c.name ? ` data-l="${esc(c.short || c.l)}"` : '';
    const label = c => c.short ? `<span class="dt-l">${esc(c.l)}</span><span class="dt-p">${esc(c.short)}</span>` : esc(c.l);
    const head = cols.map(c => `<th class="${tdCls(c)}${c === col ? ' on' : ''}" data-k="${esc(c.k)}" ${c.month ? `data-m="${c.month}"` : ''} ${c.get ? `data-s="${c.k}" tabindex="0"` : ''}>${label(c)}${c.est ? ' <span class="dt-est">est.</span>' : ''}${c === col ? ((st.sort ? st.dir : col.text ? 1 : -1) === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const num = v => v == null || v === '' || isNaN(v) ? '' : ` data-v="${Number(v)}"`;
    const childCell = (c, ch) => { const v = c.month ? ch.values[c.month] || 0 : c.ms ? c.ms.reduce((t, m) => t + (ch.values[m] || 0), 0) : null; return `<td class="${tdCls(c)}"${v == null ? '' : num(v)}>${c.name ? esc(ch.name) : v == null ? '' : v ? kOnly(v) : '—'}</td>`; };
    const body = sorted.slice(0, shown).map(r => {
      const open = opened.get(r), kids = open && o.detail ? `<tr class="dt-detail"><td colspan="${cols.length}">${o.detail(r, st)}</td></tr>` : open === FAILED ? `<tr class="dt-detail"><td colspan="${cols.length}">These lines could not be read just now. Close this row and open it again to retry.</td></tr>` : Array.isArray(open) ? open.map(ch => `<tr class="dt-child">${cols.map(c => childCell(c, ch)).join('')}</tr>`).join('') : '';
      return `<tr data-i="${index.get(r)}"${o.inTotal && !o.inTotal(r) ? ' data-out="1"' : ''}${o.expand || o.detail ? ` tabindex="0" aria-expanded="${!!open}"` : o.opens ? ' tabindex="0" class="dt-opens"' : ''}>${cols.map(c => `<td${lab(c)} class="${tdCls(c)}${c.cellCls ? ' ' + c.cellCls(r) : ''}"${c.cellStyle ? ` style="${c.cellStyle(r)}"` : ''}${c.name && c.get ? ` title="${esc(c.get(r))}"` : ''}${c.total === 'sum' ? num(c.get(r)) : ''}>${c.name && (o.expand || o.detail) ? `<span class="dt-caret">${open ? '▾' : '▸'}</span>` : ''}${c.fmt ? c.fmt(r) : esc(c.get ? c.get(r) ?? '—' : '')}</td>`).join('')}</tr>${kids}`;
    }).join('');
    const restRows = o.rest ? sorted.slice(shown) : [], restCounted = o.inTotal ? restRows.filter(o.inTotal) : restRows;
    const rest = restRows.length ? `<tr class="dt-rest" data-rest="1">${cols.map(c => `<td class="${tdCls(c)}"${c.total === 'sum' ? num(sumOf(restCounted, c)) : ''}>${c.name ? `All other ${esc(o.noun || 'rows')} (${Fmt.grouped(restRows.length)})` : c.total === 'sum' ? (c.totalFmt ? c.totalFmt(sumOf(restCounted, c)) : Fmt.grouped(sumOf(restCounted, c))) : ''}</td>`).join('')}</tr>` : '';
    const hasTotal = cols.some(c => c.total), counted = o.inTotal ? rows.filter(o.inTotal) : rows;
    const foot = hasTotal ? `<tfoot><tr>${cols.map((c, i) => `<td${c.total ? lab(c) : ''} class="${tdCls(c)}"${c.total === 'sum' ? num(sumOf(counted, c)) : ''}>${i === 0 ? esc(o.totalLabel || 'Total') : c.totalHtml ? c.totalHtml(counted) : c.total === 'sum' ? (c.totalFmt ? c.totalFmt(sumOf(counted, c)) : Fmt.grouped(sumOf(counted, c))) : typeof c.total === 'function' ? c.total(counted) : ''}</td>`).join('')}</tr>${refNow ? `<tr class="dt-ref">${cols.map(c => { const v = c.month ? refNow.get(c.month) : c.ms ? c.ms.reduce((t, m) => t + (refNow.get(m) || 0), 0) : null; return `<td class="${tdCls(c)}"${v == null ? '' : num(v)}>${c.name ? esc(refNow.label) : v == null ? '' : kOnly(v)}</td>`; }).join('')}</tr>` : ''}</tfoot>` : '';
    table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body ? body + rest : `<tr><td class="tl" colspan="${cols.length}">Nothing matches these filters.</td></tr>`}</tbody>${foot}`;
    $('.dt-more').innerHTML = rows.length > shown ? `<button type="button" class="linkbtn">Show all ${Fmt.grouped(rows.length)} ›</button>` : '';
    if (o.onDraw) o.onDraw(st, rows);
  }

  el.querySelectorAll('.dt-span button').forEach(b => b.addEventListener('click', () => { st.span = +b.dataset.span; if (st.sort && !colsAll().some(c => c.k === st.sort)) st.sort = null; keep(); draw(); }));
  el.querySelectorAll('.dt-seg button').forEach(b => b.addEventListener('click', () => { st.f[b.dataset.k] = b.dataset.v; keep(); draw(); }));
  el.querySelectorAll('.dt-type').forEach(b => b.addEventListener('click', () => { const k = b.dataset.k; st.f[k] = st.f[k] === b.dataset.v ? '' : b.dataset.v; shown = PAGE; keep(); draw(); }));
  const find = $('.dt-find');
  $('.dt-ftoggle').addEventListener('click', e => e.target.setAttribute('aria-expanded', String(el.classList.toggle('dt-open'))));
  if (find) find.addEventListener('input', () => { st.q = find.value.trim(); shown = PAGE; keep(); draw(); });
  el.querySelectorAll('.dt-f').forEach(s => s.addEventListener('change', () => { st.f[s.dataset.k] = s.value; shown = PAGE; if (o.onFilter) o.onFilter(st); keep(); draw(); }));
  $('.dt-chips').addEventListener('click', e => {
    const b = e.target.closest('.dt-chip'); if (!b) return;
    if (b.dataset.k === '__q') { st.q = ''; if (find) find.value = ''; } else delete st.f[b.dataset.k];
    keep(); draw();
  });
  $('.dt-colbox').addEventListener('change', e => { const t = e.target; if (!t.dataset.c) return; const on = colsOn().filter(c => !c.name).map(c => c.k); st.cols = t.checked ? [...on, t.dataset.c] : on.filter(k => k !== t.dataset.c); keep(); draw(); });
  $('.dt-views').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'save') {
      const name = window.prompt('Name this view');
      if (name) { const list = loadSaved(o.who, o.key).concat({ name: name.slice(0, 40), q: stateQuery({ ...st, cols: null, sort: null }, ns) }).slice(-3); keepSaved(o.who, o.key, list); }
    } else if (v !== '') {
      const p = Object.fromEntries(new URLSearchParams(views()[+v].q)), s = readState(p, o);
      st.q = s.q; st.f = s.f; if (find) find.value = st.q; keep();
    }
    draw();
  });
  $('.dt-csv').addEventListener('click', () => {
    const rows = sortRows(filterRows(o.rows, o, st), colsOn().find(c => c.k === st.sort), st.dir);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(rows, colsAll().filter(c => colsOn().includes(c)))], { type: 'text/csv' }));
    a.download = `r4-pulse-${o.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('.dt-more').addEventListener('click', e => { if (e.target.closest('button')) { shown = Infinity; draw(); } });
  // a row that opens: tap to show its own rows, fetched once
  const toggle = async tr => {
    const r = o.rows[+tr.dataset.i], open = opened.get(r);
    if (open) { opened.delete(r); draw(); return; }
    opened.set(r, true); draw();
    if (o.detail) return;
    const kids = await o.expand(r).catch(() => FAILED);
    if (opened.get(r)) { opened.set(r, kids); draw(); }
  };
  table.addEventListener('click', e => {
    const th = e.target.closest('th[data-s]');
    if (th) { const k = th.dataset.s; st.dir = st.sort === k ? -st.dir : -1; st.sort = k; keep(); draw(); return; }
    const tr = e.target.closest('tbody tr[data-i]');
    if (!tr || (e.target.closest('a') && !e.target.closest('[data-x]'))) return;
    if ((o.expand || o.detail) && !e.target.closest('button, select, input, label, [data-inv-id]')) { toggle(tr); return; }
    if (o.onRow) o.onRow(o.rows[+tr.dataset.i], e);
  });
  table.addEventListener('keydown', e => {
    const th = e.target.closest('th[data-s]'); if (th && e.key === 'Enter') th.click();
    const go = e.target.closest && e.target.closest('tbody tr[data-i]'); if (o.opens && o.onRow && go && e.target === go && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); o.onRow(o.rows[+go.dataset.i], e); return; }
    const tr = e.target.closest && e.target.closest('tbody tr[data-i]'); if ((o.expand || o.detail) && tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(tr); }
  });
  draw();
  return { state: st, draw, set: (k, v) => { st.f[k] = v; shown = PAGE; keep(); draw(); } };
}
