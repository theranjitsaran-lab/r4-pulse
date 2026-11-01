// One table and one filter bar for every list. Search and up to six filters, each a removable chip with a
// count ("42 of 376"), all kept in the link; three or four columns by default and the rest behind Columns; sort
// by header; a total row worked out on the filtered rows; saved views; Download CSV of what is showing. 13px
// figures on 30px rows, with the header, name column and total row staying put. 50 rows, then Show all.
// With months, the columns are months, latest on the right, then YTD and 12 months past a rule; a 3 / 12 month
// switch, phones opening on 3; a month in progress is hatched and says est.
//
//   dataTable(el, { key, ns, noun, rows, cols, months, filters, search, onRow, views, say, page, inTotal, totalLabel })
//     cols     [{ k, l, short?, get, fmt?, csv?, def?, name?, text?, total? }], or (state) => that list; short is the phone's label
//              total: 'sum', or (rows) => html
//     filters  [{ k, l, options: [[value, label]], test: (row, value) => boolean }]
//     months   { list: [every month, oldest first], est: [months in progress], get: (row, month) => value,
//                cell?: (row, month) => html, cellCls?, cellStyle? (row, month) => string,
//                sumCell?: (row, months) => html, totalCell?: (rows, months) => html }
//     ns       a prefix for the table's link state, where a page has more than one table
//     inTotal  which rows the total counts, where one is held apart
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// a month's figure in the months' columns: $K, no unit on each cell
export const kOnly = v => { const r = Math.round((v || 0) / 1000); return (r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US'); };
const monthName = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) + ' ' + m.slice(2, 4);
const kCell = v => v ? kOnly(v) : '—';

// ── what can be tested without a page ──
// the months shown, then the year to date and the last twelve, whatever the switch shows
export function monthCols(M, span) {
  const last12 = M.list.slice(-12), year = M.list[M.list.length - 1].slice(0, 4), ytd = M.list.filter(m => m.startsWith(year));
  const over = (r, ms) => ms.reduce((t, m) => t + (Number(M.get(r, m)) || 0), 0);
  const sum = (k, l, ms, extra) => ({ k, l, fixed: true, sum: true, get: r => over(r, ms), fmt: r => M.sumCell ? M.sumCell(r, ms) : kCell(over(r, ms)), total: 'sum', totalFmt: kOnly, totalHtml: M.totalCell ? rows => M.totalCell(rows, ms) : null, ...extra });
  return [
    ...M.list.slice(-span).map(m => ({
      k: m, l: monthName(m), month: m, fixed: true, est: !!(M.est && M.est.includes(m)), get: r => M.get(r, m), total: 'sum', totalFmt: kOnly, totalHtml: M.totalCell ? rows => M.totalCell(rows, [m]) : null,
      fmt: r => M.cell ? M.cell(r, m) : kCell(M.get(r, m)),
      cellCls: M.cellCls ? r => M.cellCls(r, m) : null, cellStyle: M.cellStyle ? r => M.cellStyle(r, m) : null,
    })),
    sum('ytd', 'YTD', ytd, { first: true }),
    sum('l12', '12 months', last12, { sorted: true }),
  ];
}
export function filterRows(rows, o, st) {
  const q = (st.q || '').trim().toLowerCase();
  return rows.filter(r => (!q || !o.search || o.search(r).toLowerCase().includes(q))
    && (o.filters || []).every(f => !st.f[f.k] || f.test(r, st.f[f.k])));
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
  if (!Object.keys(st.f).length && !st.q && o.defaults) Object.assign(st.f, o.defaults);
  const PAGE = o.page || 50;
  let shown = PAGE;
  const spanNow = () => st.span || (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 3 : 12);
  const colsAll = () => [...(typeof o.cols === 'function' ? o.cols(st) : o.cols), ...(o.months ? monthCols(o.months, spanNow()) : [])];
  const colsOn = () => colsAll().filter(c => c.name || c.fixed || (st.cols ? st.cols.includes(c.k) : c.def));
  const views = () => [...(o.views || []), ...loadSaved(o.who, o.key)];
  el.classList.add('dt');
  el.innerHTML = `<div class="dt-tools">
      ${o.search ? `<input class="dt-find" type="search" placeholder="${esc(o.placeholder || 'Find')}" aria-label="${esc(o.placeholder || 'Find')}" value="${esc(st.q)}">` : ''}
      <button type="button" class="dt-ftoggle" aria-expanded="false">${(o.filters || []).length ? 'Filters' : 'Options'}</button>
      ${(o.filters || []).map(f => `<select class="dt-f" data-k="${f.k}" aria-label="${esc(f.l)}"><option value="">${esc(f.l)}</option>${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`).join('')}
      ${o.months ? '<span class="seg dt-span" role="group" aria-label="Months shown"><button type="button" data-span="3">3 months</button><button type="button" data-span="12">12 months</button></span>' : ''}
      <details class="dt-cols"><summary>Columns</summary><div class="dt-colbox"></div></details>
      <select class="dt-views" aria-label="Saved views"></select>
      <button type="button" class="dt-csv">Download CSV</button>
    </div>
    <div class="dt-chips"></div>
    <div class="dt-scroll"><table class="dt-t"></table></div>
    <div class="dt-more"></div>`;
  const $ = s => el.querySelector(s), table = $('.dt-t');
  const keep = () => history.replaceState(null, '', withState(location.hash, st, ns));

  function draw() {
    const all = colsAll(), cols = colsOn();
    const rows = filterRows(o.rows, o, st);
    const col = cols.find(c => c.k === st.sort && c.get) || cols.find(c => c.sorted) || cols.find(c => c.get && !c.name) || cols[0];
    const sorted = sortRows(rows, col, st.sort ? st.dir : col.text ? 1 : -1);
    // the filter bar: selects and chips say the same thing
    el.querySelectorAll('.dt-f').forEach(s => { s.value = st.f[s.dataset.k] || ''; });
    const chips = (o.filters || []).filter(f => st.f[f.k]).map(f => { const lab = (f.options.find(([v]) => v === st.f[f.k]) || [])[1] || st.f[f.k]; return `<button type="button" class="dt-chip" data-k="${f.k}">${esc(lab)} ×</button>`; });
    if (st.q) chips.unshift(`<button type="button" class="dt-chip" data-k="__q">“${esc(st.q)}” ×</button>`);
    $('.dt-chips').innerHTML = `<b>${rows.length.toLocaleString('en-US')}${rows.length !== o.rows.length ? ` of ${o.rows.length.toLocaleString('en-US')}` : ''}</b>${o.say || o.noun ? ` <span>${esc(o.say ? o.say(st, rows) : o.noun)}</span>` : ''}${chips.join('')}`;
    el.querySelectorAll('.dt-span button').forEach(b => b.classList.toggle('on', +b.dataset.span === spanNow()));
    $('.dt-cols').hidden = !all.some(c => !c.name && !c.fixed);
    $('.dt-colbox').innerHTML = all.filter(c => !c.name && !c.fixed).map(c => `<label><input type="checkbox" data-c="${c.k}" ${cols.some(x => x.k === c.k) ? 'checked' : ''}> ${esc(c.l)}</label>`).join('');
    const vs = views(), cur = stateQuery({ ...st, cols: null, sort: null }, ns);
    $('.dt-views').innerHTML = `<option value="">Saved views</option>${vs.map((v, i) => `<option value="${i}" ${v.q === cur && cur ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}${(o.filters || []).length || st.q ? '<option value="save">Save this view…</option>' : ''}`;
    // the table
    const tdCls = c => `${c.text || c.name ? 'tl' : ''}${c.est ? ' est' : ''}${c.first ? ' dt-sum' : ''}`;
    const label = c => c.short ? `<span class="dt-l">${esc(c.l)}</span><span class="dt-p">${esc(c.short)}</span>` : esc(c.l);
    const head = cols.map(c => `<th class="${tdCls(c)}${c === col ? ' on' : ''}" data-k="${esc(c.k)}" ${c.month ? `data-m="${c.month}"` : ''} ${c.get ? `data-s="${c.k}" tabindex="0"` : ''}>${label(c)}${c.est ? ' <span class="dt-est">est.</span>' : ''}${c === col ? ((st.sort ? st.dir : col.text ? 1 : -1) === 1 ? ' ▲' : ' ▼') : ''}</th>`).join('');
    const num = v => v == null || v === '' || isNaN(v) ? '' : ` data-v="${Number(v)}"`;
    const body = sorted.slice(0, shown).map(r => `<tr data-i="${o.rows.indexOf(r)}"${o.inTotal && !o.inTotal(r) ? ' data-out="1"' : ''}>${cols.map(c => `<td class="${tdCls(c)}${c.cellCls ? ' ' + c.cellCls(r) : ''}"${c.cellStyle ? ` style="${c.cellStyle(r)}"` : ''}${c.name && c.get ? ` title="${esc(c.get(r))}"` : ''}${c.total === 'sum' ? num(c.get(r)) : ''}>${c.fmt ? c.fmt(r) : esc(c.get ? c.get(r) ?? '—' : '')}</td>`).join('')}</tr>`).join('');
    const hasTotal = cols.some(c => c.total), counted = o.inTotal ? rows.filter(o.inTotal) : rows;
    const foot = hasTotal ? `<tfoot><tr>${cols.map((c, i) => `<td class="${tdCls(c)}"${c.total === 'sum' ? num(sumOf(counted, c)) : ''}>${i === 0 ? esc(o.totalLabel || 'Total') : c.totalHtml ? c.totalHtml(counted) : c.total === 'sum' ? (c.totalFmt ? c.totalFmt(sumOf(counted, c)) : sumOf(counted, c).toLocaleString('en-US')) : typeof c.total === 'function' ? c.total(counted) : ''}</td>`).join('')}</tr></tfoot>` : '';
    table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td class="tl" colspan="${cols.length}">Nothing matches these filters.</td></tr>`}</tbody>${foot}`;
    $('.dt-more').innerHTML = rows.length > shown ? `<button type="button" class="linkbtn">Show all ${rows.length.toLocaleString('en-US')} ›</button>` : '';
    if (o.onDraw) o.onDraw(st, rows);
  }

  el.querySelectorAll('.dt-span button').forEach(b => b.addEventListener('click', () => { st.span = +b.dataset.span; if (st.sort && !colsAll().some(c => c.k === st.sort)) st.sort = null; keep(); draw(); }));
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
  table.addEventListener('click', e => {
    const th = e.target.closest('th[data-s]');
    if (th) { const k = th.dataset.s; st.dir = st.sort === k ? -st.dir : -1; st.sort = k; keep(); draw(); return; }
    const tr = e.target.closest('tbody tr[data-i]');
    if (!tr || (e.target.closest('a') && !e.target.closest('[data-x]')) || !o.onRow) return;
    o.onRow(o.rows[+tr.dataset.i], e);
  });
  table.addEventListener('keydown', e => { const th = e.target.closest('th[data-s]'); if (th && e.key === 'Enter') th.click(); });
  draw();
  return { state: st, draw };
}
