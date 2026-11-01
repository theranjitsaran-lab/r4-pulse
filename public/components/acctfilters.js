// The account filters every account list shares: line of business, size, trend, and under the book (a saved
// view rather than a chip). By level1, so a list with its own row shape can use them. No DOM.
import { FAMS } from './custbook.js';
import { slippingAccounts, risingAccounts } from './levers.js';
import { SIZE_BANDS, inBand } from './metrics.js';

export function accountFilters(VW, C) {
  const book = new Map(VW.rows.map(r => [r.level1, r]));
  const ltm = new Map(VW.am ? VW.am.rows.map(a => [a.level1, a.m.slice(-12).reduce((t, v) => t + v, 0)]) : []);
  const slip = slippingAccounts(C), slipIds = new Set(slip.map(s => s.level1)), slip2k = new Set(slip.filter(s => s.move.d <= -2000).map(s => s.level1));
  const rising = new Set(risingAccounts(C).map(s => s.level1));
  const trend = (id, v) => v === 'slip2k' ? slip2k.has(id) : v === 'slip' ? slipIds.has(id) : v === 'rise' ? rising.has(id) : !slipIds.has(id) && !rising.has(id);
  return [
    { k: 'line', l: 'Line of business', options: FAMS.map(f => [f.key, f.name]), test: (r, v) => { const b = book.get(r.level1); return !!(b && b.fam && b.fam[v]); } },
    { k: 'size', l: 'Size', options: SIZE_BANDS.map(b => [b[0], b[1]]), test: (r, v) => inBand(v, ltm.get(r.level1) || 0) },
    { k: 'trend', l: 'Trend', options: [['slip', 'Slipping'], ['slip2k', 'Slipping over $2K a month'], ['rise', 'Rising'], ['steady', 'Neither']], test: (r, v) => trend(r.level1, v) },
    { k: 'book', l: 'Against the book', hidden: true, options: [['under', 'Under the book']], test: r => { const b = book.get(r.level1); return !!(b && b.gap > 0); } },
  ];
}

// What a tab keeps as you move: search and account filters between the account lists; the months switch
// wherever there are months. A list that has no use for one leaves it in the link and ignores it.
const ACCOUNT_LISTS = new Set(['customers', 'opportunities']), MONTH_LISTS = new Set(['customers', 'numbers']);
export function carryHash(target, from) {
  const route = h => h.replace(/^#/, '').split(/[/?]/)[0];
  const was = new URLSearchParams(from.split('?')[1] || ''), to = route(target), [base, qs] = target.split('?'), u = new URLSearchParams(qs || '');
  for (const [k, v] of was) {
    const filter = k === 'q' || /^f_(line|size|trend|book)$/.test(k);
    if ((filter && ACCOUNT_LISTS.has(route(from)) && ACCOUNT_LISTS.has(to)) || (k === 'span' && MONTH_LISTS.has(route(from)) && MONTH_LISTS.has(to))) if (!u.has(k)) u.set(k, v);
  }
  return base + (u.toString() ? '?' + u : '');
}
