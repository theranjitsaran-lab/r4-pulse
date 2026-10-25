// The core bar: a straight bar from $0 to the target, the measured average filled in ink, the
// month in progress as a dashed range, and a grey tick for a reference figure. No dial.
//
//   meter(el, { label, value, delta, target, range: [lo, hi], rangeLabel, tick, tickLabel })
//     delta  { text, cls: 'is-bad' | '' }   e.g. ▼ 17% against early 2025
'use strict';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const money0 = v => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
const moneyM = v => '$' + (v / 1e6).toFixed(1) + 'm';

export function meter(el, o) {
  if (!el) return;
  const pct = v => Math.max(0, Math.min(100, v / o.target * 100));
  const range = o.range ? `<div class="meter-range" style="left:${pct(o.range[0])}%;width:${pct(o.range[1]) - pct(o.range[0])}%" title="${esc(o.rangeLabel || '')}"></div>` : '';
  const tick = o.tick != null ? `<div class="meter-tick" style="left:${pct(o.tick)}%" title="${esc(o.tickLabel || '')}"></div>` : '';
  el.classList.add('meter');
  el.innerHTML = `
    <div class="meter-top">
      <span class="meter-lab">${esc(o.label)}</span>
      <span class="meter-val num">${money0(o.value)}${o.delta ? `<span class="delta ${o.delta.cls || ''}">${esc(o.delta.text)}</span>` : ''}</span>
    </div>
    <div class="meter-track" role="img" aria-label="${esc(o.label)} ${money0(o.value)} of a ${moneyM(o.target)} target">
      <div class="meter-fill" style="width:${pct(o.value)}%"></div>${range}${tick}<div class="meter-target"></div>
    </div>
    <div class="meter-foot"><span>${o.rangeLabel ? `<span class="modelled">${esc(o.rangeLabel)}</span>` : ''}</span><span>target ${moneyM(o.target)}</span></div>`;
}
