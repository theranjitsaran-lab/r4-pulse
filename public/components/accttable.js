// The full account table, one component for All accounts and Month grid: account, margin button, months, YTD and 12
// months. % margin: a RAG pill. $K margin: the months show margin, a month's revenue at the account's 12-month rate,
// because the cost model is annual and holds no real monthly margin; the key says so. Revenue months keep the rule:
// shaded blue or red when more than 25% and $5K from the row's own 12-month average (datatable.js).
import { dataTable, kOnly } from './datatable.js';
import { accountFilters } from './acctfilters.js';
import { titleCase, esc } from './data.js';
import { costsVisible, whoAmI, myRole } from './access.js';
import { LABELS } from './metrics.js';
import { CITADEL } from './levers.js';
import { moneyK } from './chart.js';
import * as Fmt from './format.js';
import { ragPill, ragKey } from './lit.js';
import { openMargin, weakest } from './marginpop.js';

const signedK = v => v == null ? '—' : (v < 0 ? '−' : '') + moneyK(Math.abs(v));
const pctS = v => { const t = Fmt.pct(Math.abs(v)); return (v < 0 && t !== '0%' ? '−' : '') + t; };

// the account's margin pop-out, from its row in the book
export function marginFromRow(R, B, r, family = null) {
  const f = family && r.mfam ? r.mfam[family] : null;
  openMargin({ R, name: titleCase(r.customer), revenue: r.revenue, cost: r.cost, parts: r.parts, weak: f ? { family, revenue: f.revenue, cost: f.cost } : weakest(r.mfam), level1: r.level1, row: r, B, family });
}

export function accountTable(host, { key, VW, C, R, B, P, extra = [], series = false, ns = '' }) {
  if (!host) return null;
  const costs = costsVisible();
  const byBook = new Map(VW.rows.map(r => [r.level1, r])), am = VW.am, at = new Map(am.months.map((m, i) => [m, i]));
  const rows = am.rows.filter(a => a.level1 !== CITADEL && a.m.some(Boolean)).map(a => ({ ...(byBook.get(a.level1) || {}), level1: a.level1, customer: a.customer, m: a.m, s: a.s, ltm: a.m.slice(-12).reduce((t, v) => t + v, 0) }));
  // the state the cells read: filled by cols(st) on every draw, before the months are built
  let mode = 'pc', which = 'all';
  const base = (r, m) => { const i = at.get(m), t = r.m[i] || 0; return which === 'storage' ? (r.s ? r.s[i] : 0) : which === 'service' ? t - (r.s ? r.s[i] : 0) : t; };
  const monthMargin = (r, m) => r.pc == null ? 0 : base(r, m) * r.pc;
  const maxK = Math.max(1, ...rows.flatMap(r => r.pc == null ? [] : am.months.slice(-12).map(m => Math.abs((r.m[at.get(m)] || 0) * r.pc))));
  const name = { k: 'customer', l: 'Account', name: true, text: true, get: r => titleCase(r.customer), fmt: r => `<a data-tour="account-link" href="#customer/${r.level1}">${esc(titleCase(r.customer))}</a>` };
  const marginCol = (st) => {
    const k = st.f.mv === 'k', list = st.f.line;
    const of = r => { const f = list && r.fam ? r.fam[list] : null; return list ? (f ? { m: f.revenue - f.cost, rev: f.revenue } : null) : r.pc == null ? null : { m: r.margin, rev: r.revenue }; };
    let i = 0;
    return { k: 'pc', l: `${k ? '$K margin' : 'Margin'} est.`, short: k ? '$K' : 'Margin', def: true, cls: 'dt-rag', get: r => { const v = of(r); return !v ? null : k ? v.m : v.rev > 0 ? v.m / v.rev : null; }, csv: r => { const v = of(r); return !v ? '' : k ? v.m : v.rev > 0 ? v.m / v.rev : ''; },
      fmt: r => { const v = of(r); if (!v) return '—'; const p = v.rev > 0 ? v.m / v.rev : null; return ragPill(R, p, k ? signedK(v.m) : p == null ? '—' : pctS(p), `class-x data-tour="margin" data-x="margin" data-id="${r.level1}"`, i++); },
      totalHtml: list2 => { const t = list2.reduce((a, r) => { const v = of(r); return v ? { m: a.m + v.m, rev: a.rev + v.rev } : a; }, { m: 0, rev: 0 }); return k ? signedK(t.m) : t.rev > 0 ? pctS(t.m / t.rev) : '—'; } };
  };
  const cols = st => { mode = st.f.mv === 'k' ? 'k' : 'pc'; which = st.f.sv || 'all'; return [name, ...(costs ? [marginCol(st)] : []), ...extra]; };
  const core = new Map(P.monthly.map(x => [x.month, x.core]));
  const role = myRole();
  const views = [
    ...(role === 'owner' || role === 'admin' ? [{ name: 'Slipping over $2K a month', q: 'f_trend=slip2k' }] : []),
    ...(role === 'billing' || role === 'admin' ? [{ name: 'Storage under book', q: 'f_line=storage&f_book=under' }] : []),
  ];
  const filters = [...(costs ? [{ k: 'mv', l: 'Show margin as', seg: true, options: [['pc', '% margin'], ['k', '$K margin']], test: () => true }] : []), ...(series ? [{ k: 'sv', l: 'Which lines', seg: true, options: [['all', 'Storage and service'], ['storage', 'Storage'], ['service', 'Service']], test: () => true }] : []), ...accountFilters(VW, C)];
  const key2 = document.createElement('div'); key2.className = 'ragkey'; host.parentNode.insertBefore(key2, host);
  const bucket = v => Math.max(1, Math.min(5, Math.ceil(Math.min(1, Math.abs(v) / maxK * 2.2) * 5)));
  return dataTable(host, { key, ns, who: whoAmI(), rows, filters, views, placeholder: 'Find an account', noun: 'accounts', rest: true, defaults: { ...(costs ? { mv: 'pc' } : {}), ...(series ? { sv: 'all' } : {}) },
    ref: st => st.f.mv === 'k' || (st.f.sv && st.f.sv !== 'all') ? null : { label: LABELS.invoiced + ', core', get: m => core.get(m) },
    months: { list: am.months, get: (r, m) => mode === 'k' ? monthMargin(r, m) : base(r, m),
      cls: (r, m) => { if (mode !== 'k') return null; const v = monthMargin(r, m); return !v ? '' : `${v < 0 ? 'mkn' : 'mk'}${bucket(v)}`; },
      cell: (r, m) => { const v = mode === 'k' ? monthMargin(r, m) : base(r, m); if (!v) return '—'; return mode === 'k' ? kOnly(v) : `<span data-inv-id="${r.level1}" data-inv-m="${m}" data-inv-name="${esc(r.customer)}">${kOnly(v)}</span>`; } },
    search: r => r.customer, cols,
    say: st => st.f.mv === 'k' ? 'accounts, margin by month est., $K' : st.f.line ? 'accounts buying this line, invoiced by month, $K' : 'accounts, invoiced by month billed, $K',
    expand: VW.lines ? VW.lines : undefined,
    onDraw: st => {
      host.classList.toggle('k-mode', st.f.mv === 'k');
      key2.innerHTML = !costs ? '' : st.f.mv === 'k' ? '<span>$K margin a month est.: a month\'s revenue at the account\'s 12-month rate, because the cost model holds no real monthly margin. Darker green earns more, red loses money.</span>' : `<span>Margin est.:</span>${ragKey(R)}<span>Tap a margin for its breakdown.</span>`;
      host.querySelectorAll('[class-x]').forEach(b => b.classList.add('c2-x'));
    },
    onRow: (r, e) => { const b = e.target.closest('.c2-x'); if (!b) return; if (b.dataset.x === 'margin') { if (r.revenue) marginFromRow(R, B, r, (new URLSearchParams(location.hash.split('?')[1] || '')).get('f_line') || null); return; } if (VW.explain) VW.explain(b, r); },
  });
}
