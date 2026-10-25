// The Ledger register table: 28px rows, hairline rules, tabular figures, rows that open in place.
// Under 640px each row restacks as label–value pairs.
//
//   ledgerTable(el, { columns, rows, detail, onOpen })
//     columns  [{ key, label, num, fmt, cls(row), sub(row) }]   num right-aligns in figures
//     detail   (row, td) => void   if given, a row opens beneath itself on click; one open at a time
'use strict';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function ledgerTable(el, o) {
  if (!el) return;
  const cols = o.columns, open = typeof o.detail === 'function';
  const cell = (c, r) => {
    const v = c.fmt ? c.fmt(r[c.key], r) : esc(r[c.key]);
    const cls = [c.num ? 'n' : '', c.cls ? c.cls(r) || '' : ''].join(' ').trim();
    const sub = c.sub ? `<span class="sub">${esc(c.sub(r))}</span>` : '';
    return `<td class="${cls}" data-label="${esc(c.label)}">${v}${sub}</td>`;
  };
  el.innerHTML = `<table class="ltable">
    <thead><tr>${open ? '<th></th>' : ''}${cols.map(c => `<th class="${c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${o.rows.map((r, i) => `<tr data-i="${i}" class="${open ? 'can-open' : ''}">${open ? '<td class="opener">›</td>' : ''}${cols.map(c => cell(c, r)).join('')}</tr>`).join('')}</tbody>
  </table>`;
  if (!open) return;
  el.querySelector('tbody').addEventListener('click', ev => {
    const tr = ev.target.closest('tr[data-i]');
    if (!tr) return;
    const was = tr.classList.contains('row-open');
    el.querySelectorAll('tr.detail').forEach(d => d.remove());
    el.querySelectorAll('tr.row-open').forEach(d => { d.classList.remove('row-open'); d.querySelector('.opener').textContent = '›'; });
    if (was) return;
    tr.classList.add('row-open');
    tr.querySelector('.opener').textContent = '⌄';
    const d = document.createElement('tr');
    d.className = 'detail';
    d.innerHTML = `<td colspan="${cols.length + 1}"></td>`;
    tr.after(d);
    o.detail(o.rows[+tr.dataset.i], d.firstElementChild);
    if (o.onOpen) o.onOpen(o.rows[+tr.dataset.i]);
  });
}
