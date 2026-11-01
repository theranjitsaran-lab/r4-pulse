// An account's month, down to its invoices: number, date, what was on it, amount. Opened from any element
// with data-inv-id and data-inv-m (YYYY-MM-01). Anyone who knows an account can check it against VCK.
import { money0 } from './chart.js';
import { esc, titleCase, getJson } from './data.js';
import { openPop } from './pop.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const day = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const n = v => Math.round(v * 100) / 100;

export async function openInvoices(level1, month, name = '') {
  const title = `${name ? titleCase(name) + ' · ' : ''}${mon(month)}`;
  openPop({ title, sub: 'Invoices in VCK', html: '<p class="hint">Reading the invoices…</p>' });
  let d;
  try { d = await getJson(`view/invoices?level1=${encodeURIComponent(level1)}&month=${encodeURIComponent(month)}`); }
  catch (e) { openPop({ title, sub: 'Invoices in VCK', html: `<p>${e.status === 404 ? 'The invoices for this account are read live; they are not in this offline copy.' : 'The invoices could not be read just now.'}</p>` }); return; }
  const row = i => {
    const lines = (i.lines || []).map(l => `<tr><td class="tl">${esc(titleCase(l.service))}${l.units ? `<small>${n(l.units).toLocaleString('en-US')} at $${l.units ? (l.amount / l.units).toFixed(2) : '0.00'}</small>` : ''}</td><td>${money0(l.amount)}</td></tr>`).join('');
    const other = i.service - (i.lines || []).reduce((t, l) => t + l.amount, 0);
    return `<li class="inv"><div class="inv-h"><b>${esc(i.invoice_no)}</b><span>${day(i.date)}</span><b>${money0(i.total)}</b></div>
      <table class="p2-t"><tbody>${i.storage ? `<tr><td class="tl">Storage</td><td>${money0(i.storage)}</td></tr>` : ''}${lines}${Math.abs(other) >= 0.5 ? `<tr><td class="tl">Other service<small>on the invoice, no priced line</small></td><td>${money0(other)}</td></tr>` : ''}</tbody></table></li>`;
  };
  const shown = d.invoices.filter(i => i.total !== 0), zero = d.invoices.length - shown.length;
  openPop({ title, sub: `${money0(d.total)} on ${d.invoices.length} invoice${d.invoices.length === 1 ? '' : 's'} in VCK`,
    html: `<ul class="inv-l">${shown.map(row).join('') || '<li class="hint">No invoices with an amount this month.</li>'}</ul>
      ${zero ? `<p class="src">${zero} more at $0.00 not shown.</p>` : ''}
      <p class="src">Invoice date, posted invoices, tax included as on the invoice. Check any of these against VCK.</p>` });
}

// anywhere in the app: a figure carrying data-inv-id and data-inv-m opens its invoices
let wired = false;
export function wireInvoices() {
  if (wired) return; wired = true;
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-inv-id]'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    openInvoices(Number(t.dataset.invId), t.dataset.invM, t.dataset.invName || '');
  }, true);
}
