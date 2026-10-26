// The gap to $1.0m as one bar: today's six-month average is spent, so the bar is only what is left,
// split by the levers that could close it (components/levers.js bridge()) and what new business must
// find. Each part is a row that opens its accounts. The ceiling (cross-sell ◇) is hatched; new
// business is open, not filled.
import { moneyK } from './chart.js';
import { esc } from './data.js';

export function gapHtml(B, { rows = true } = {}) {
  const gap = B.steps.reduce((t, s) => t + s.v, 0) + B.newBusiness;
  const parts = B.steps.map((s, i) => ({ ...s, cls: `l${Math.min(i + 1, 4)}${s.modelled ? ' ceil' : ''}` }))
    .concat([{ key: 'new', t: 'New business', s: 'what the levers leave to win', v: B.newBusiness, cls: 'newb', who: 'Trisha' }]);
  const pc = v => Math.round(v / gap * 100);
  const bar = `<div class="gap-bar" role="img" aria-label="${parts.map(p => `${p.t} ${moneyK(p.v)}`).join(', ')}">${parts.map((p, i) =>
    `<span class="gap-seg ${p.cls}" style="flex-grow:${p.v};--i:${i}"><em>${moneyK(p.v)}</em></span>`).join('')}</div>
    <div class="gap-ends"><span>${moneyK(B.today)} today</span><span>$1.0M</span></div>`;
  if (!rows) return bar;
  return bar + `<ul class="gap-rows">${parts.map(p => {
    const inner = `<i class="gap-sw ${p.cls}"></i><span class="gap-t">${esc(p.t)}<small>${esc(p.brief || p.s)}${p.who ? ' · ' + esc(p.who) : ''}</small></span>
      <span class="gap-v">+${moneyK(p.v)}${p.modelled ? ' ◇' : ''}<small>${pc(p.v)}%<span class="gap-wide"> of the gap${p.note ? ' · ' + esc(p.note) : ''}</span></small></span>`;
    return `<li>${p.href ? `<a href="${p.href}">${inner}<span class="go">›</span></a>` : `<div>${inner}<span></span></div>`}</li>`;
  }).join('')}</ul>`;
}
