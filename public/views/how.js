// How it's calculated: where the screens' figures come from, in plain words, so the working
// stays off the screens themselves. Box codes come from the storage data; the rest is fixed text.
import * as Fmt from '/components/format.js';
import { esc } from '/components/data.js';
import { LABELS } from '/components/metrics.js';
import { costsVisible } from '/components/access.js';

const SECTIONS = () => [
  ['Sales', [
    `${LABELS.invoiced} means posted invoices, dated by invoice date. The month reconciles to QuickBooks within about 0.4%.`,
    'Storage bills in advance and service in arrears, so a month\'s bill is that month\'s storage and the month before\'s work.',
    'Core is storage and service. Citadel is held apart from every total and can run negative, because credits are carried as they fall.',
  ]],
  ['Next month\'s bill', [
    `Finished work from Veri-Shred, priced at each account's own latest price, or the median of R4's accounts if it has never bought that service. Figures worked out this way say "est."; charts hatch them.`,
    'Jobs far larger than anything the account has bought are left out and named as jobs to check. Flat bin fees, deliveries and pound shredding only appear when the run posts.',
  ]],
  ['Accounts', [
    `Slipping: ${LABELS.slipping}.`,
    `Active: ${LABELS.activeAccounts.replace(/^active accounts /, '').replace(/[()]/g, '')}.`,
    `Cross-sell: ${LABELS.crossSell}.`,
    '"The book" is what R4\'s own accounts pay: under the book means under their median. R4\'s price list is not in the data yet.',
  ]],
  ['Operations', [
    `${LABELS.veriShred} Booked work is not counted until it is done.`,
    `Normal for a day is that weekday's median over 8 weeks; ${LABELS.normalRoute} is the route's own 8-week median.`,
    'The order drivers made their stops in was never recorded, so a route on a map is the shortest likely round between its postcodes, along the main roads. A far area\'s cost is its share of the real route days it was served on, by minutes; its revenue is the bin and ITAD work billed at that site.',
    'Distances are miles from the 35th Street yard, measured from the centre of each postcode, or along main roads where a route is drawn. Drivers\' GPS was never captured.',
  ]],
  ['Warehouse', [
    'Boxes in storage are those VCK shows as currently held, all at one location in Chicago. Boxes out, withdrawn or destroyed are not counted until R4 confirms what their codes mean.',
    'Eligible boxes are past their retention review, with no permanent or hold flag. "Not billed" compares boxes held with those on the latest storage bill.',
    'An account counts as dormant when it has no invoice in the last twelve months. R4\'s own accounts and placeholders are left out.',
  ]],
  ...(costsVisible() ? [['Costs (admins only)', [
    'Every cost is an estimate from a named rate, on Settings with the assumptions behind it, and all are provisional until the ledger is restated over the same twelve months.',
  ]]] : []),
];

export async function render(main, S) {
  if (!main) return;
  const types = new Map();
  for (const r of (S && S.rows) || []) types.set(r.boxtype, (types.get(r.boxtype) || 0) + (r.boxes || 0));
  const total = [...types.values()].reduce((t, v) => t + v, 0);
  const codes = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  main.innerHTML = `<div class="how">
    <h1>How it's calculated</h1>
    <p class="how-lede">Refreshed daily from VCK (billing and pricing) and Veri-Shred (operations).</p>
    ${SECTIONS().map(([h, ps]) => `<section class="h2-card"><div class="h2-ch"><h2>${esc(h)}</h2></div>${ps.map(p => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}
    ${codes.length ? `<section class="h2-card"><div class="h2-ch"><h2>Box types, as VCK holds them</h2><small>the share of boxes; R4 has still to name these codes</small></div><p>${codes.map(([k, v]) => `${esc(k || 'none')} ${Fmt.pct(v / total)}`).join(' · ')}</p></section>` : ''}
  </div>`;
}
