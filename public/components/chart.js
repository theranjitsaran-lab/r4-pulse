// One-axis line and bar charts on a 900-wide viewBox. Every chart carries a conclusion title
// and a source line; there is never a second axis. Colour comes from components.css classes.
//
//   lineChart(el, { title, sub, source, series, band, notes, marks, yFormat, xFormat })
//     series  [{ name, cls: '' | 's-2', points: [{ x: 'YYYY-MM-DD', y }] }]   first one is ink
//     band    { name, points: [{ x, lo, hi }] }   a lighter band (Citadel within service); may go below zero
//     notes   [{ x, y, text, cls }]               labelled points (a peak, a credit run)
//     marks   [{ x, text }]                       vertical dotted markers (the July 2025 step)
//   barChart(el, { title, sub, source, bars: [{ label, value, cls, note }], yFormat })
'use strict';

// Drawn 900 wide on a desktop and 420 on a phone, so the text stays legible when it scales.
const widthFor = (el, o) => o.width || ((el.clientWidth && el.clientWidth < 600) ? 420 : 900);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const money0 = v => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
export const moneyK = v => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'm' : a >= 1000 ? Math.round(a / 1000) + 'k' : String(Math.round(a));
  return (v < 0 ? '−$' : '$') + s;
};
const monthLabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

// Rounded tick step so the axis reads in whole figures.
function ticks(lo, hi, n = 5) {
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  // from the step at or below the lowest value to the step at or above the highest
  const out = [], top = Math.ceil(hi / step) * step;
  for (let v = Math.floor(lo / step) * step; v <= top + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function frame(el, o, svg, key) {
  el.classList.add('chart');
  el.innerHTML = `
    <div class="chart-head">
      <div><h3 class="chart-title">${esc(o.title)}</h3>${o.sub ? `<p class="chart-sub">${esc(o.sub)}</p>` : ''}</div>
      ${key || ''}
    </div>
    <div class="chart-wrap">${svg}<div class="c-tip" hidden></div></div>
    ${o.source ? `<div class="src">${esc(o.source)}</div>` : ''}`;
}

export function lineChart(el, o) {
  if (!el) return;
  const W = widthFor(el, o), compact = W < 600;
  const H = o.height || (compact ? 260 : 320), L = compact ? 44 : 54, R = compact ? 8 : 18, T = 18, B = 30;
  const xs = [...new Set(o.series.flatMap(s => s.points.map(p => p.x)))].sort();
  const all = o.series.flatMap(s => s.points.map(p => p.y)).concat((o.band ? o.band.points : []).flatMap(p => [p.lo, p.hi]));
  const tk = ticks(Math.min(0, ...all), Math.max(...all));
  const lo = tk[0], hi = tk[tk.length - 1];
  const fx = x => L + (xs.indexOf(x) / Math.max(1, xs.length - 1)) * (W - L - R);
  const fy = y => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const yf = o.yFormat || moneyK, xf = o.xFormat || monthLabel;

  let g = '';
  for (const v of tk) g += `<line class="${v === 0 ? 'c-zero' : 'c-grid'}" x1="${L}" x2="${W - R}" y1="${fy(v)}" y2="${fy(v)}"/>
    <text class="c-axis" x="${L - 8}" y="${fy(v) + 4}" text-anchor="end">${yf(v)}</text>`;
  // x labels: first, last and every January, so the years read without crowding
  xs.forEach((x, i) => {
    const last = i === xs.length - 1, nearLast = !last && fx(xs[xs.length - 1]) - fx(x) < 70;
    const nearFirst = i > 0 && fx(x) - fx(xs[0]) < 70;
    const every = compact ? ['01'] : ['01', '07'];
    if (i === 0 || last || (!nearLast && !nearFirst && every.includes(x.slice(5, 7)))) {
      const anchor = i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle';
      g += `<text class="c-axis" x="${fx(x)}" y="${H - 8}" text-anchor="${anchor}">${xf(x)}</text>`;
    }
  });
  for (const m of o.marks || []) {
    g += `<line class="c-mark" x1="${fx(m.x)}" x2="${fx(m.x)}" y1="${T}" y2="${H - B}"/>
      ${compact ? '' : `<text class="c-note" x="${fx(m.x) + 6}" y="${T + 10}">${esc(m.text)}</text>`}`;
  }
  if (o.band) {
    const p = o.band.points.filter(q => xs.includes(q.x));
    const top = p.map(q => `${fx(q.x)},${fy(q.hi)}`), bot = p.slice().reverse().map(q => `${fx(q.x)},${fy(q.lo)}`);
    g += `<polygon class="c-band" points="${top.concat(bot).join(' ')}"/>`;
  }
  o.series.slice().reverse().forEach(s => {
    g += `<polyline class="c-line ${s.cls || ''}" points="${s.points.map(p => `${fx(p.x)},${fy(p.y)}`).join(' ')}"/>`;
  });
  for (const n of o.notes || []) {
    // above the point unless that would leave the plot, or the point sits in the lower half
    const below = n.y < (lo + hi) / 2 || fy(n.y) - 8 < T + 12;
    const anchor = fx(n.x) > W - 120 ? 'end' : fx(n.x) < L + 80 ? 'start' : 'middle';
    g += `<text class="c-note ${n.cls || ''}" x="${fx(n.x)}" y="${fy(n.y) + (below ? 16 : -8)}" text-anchor="${anchor}">${esc(n.text)}</text>`;
  }
  g += `<line class="c-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  g += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="c-hit"/>`;

  const key = `<div class="chart-key">${o.series.map((s, i) => `<span><i class="${i ? 'k-2' : ''}"></i>${esc(s.name)}</span>`).join('')}${o.band ? `<span><i class="k-band"></i>${esc(o.band.name)}</span>` : ''}</div>`;
  frame(el, o, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">${g}</svg>`, key);

  // crosshair: nearest month, every series' value in one tooltip
  const svg = el.querySelector('svg'), tip = el.querySelector('.c-tip'), cross = svg.querySelector('.c-cross');
  const wrap = el.querySelector('.chart-wrap');
  svg.querySelector('.c-hit').addEventListener('mousemove', ev => {
    const r = svg.getBoundingClientRect(), vx = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(xs.length - 1, Math.round((vx - L) / (W - L - R) * (xs.length - 1)))), x = xs[i];
    cross.setAttribute('x1', fx(x)); cross.setAttribute('x2', fx(x)); cross.setAttribute('visibility', 'visible');
    const rows = o.series.map(s => { const p = s.points.find(q => q.x === x); return p ? `${esc(s.name)} ${money0(p.y)}` : null; }).filter(Boolean);
    const b = o.band && o.band.points.find(q => q.x === x);
    if (b) rows.push(`${esc(o.band.name)} ${money0(b.hi - b.lo)}`);
    tip.innerHTML = `<b>${xf(x)}</b><br>${rows.join('<br>')}`;
    tip.style.left = (fx(x) / W * r.width) + 'px';
    tip.style.top = (T / H * r.height + (svg.getBoundingClientRect().top - wrap.getBoundingClientRect().top)) + 'px';
    tip.hidden = false;
  });
  svg.querySelector('.c-hit').addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

export function barChart(el, o) {
  if (!el) return;
  const W = widthFor(el, o);
  const H = o.height || 200, L = 8, R = 8, T = 22, B = 26, gap = 14;
  const max = Math.max(...o.bars.map(b => b.value), 0);
  const bw = (W - L - R - gap * (o.bars.length - 1)) / o.bars.length;
  const fy = v => T + (1 - v / (max || 1)) * (H - T - B);
  const yf = o.yFormat || (v => Math.round(v).toLocaleString('en-US'));
  let g = '';
  o.bars.forEach((b, i) => {
    const x = L + i * (bw + gap);
    g += `<rect class="c-bar ${b.cls || ''}" x="${x}" y="${fy(b.value)}" width="${bw}" height="${H - B - fy(b.value)}"><title>${esc(b.label)}: ${yf(b.value)}</title></rect>
      <text class="c-barval" x="${x + bw / 2}" y="${fy(b.value) - 6}" text-anchor="middle">${yf(b.value)}</text>
      <text class="c-axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  frame(el, o, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title)}">${g}</svg>`);
}
