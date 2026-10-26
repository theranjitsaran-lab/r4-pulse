// Charts. One axis, always. Thin marks: 2px lines over a light area wash, bars no wider than 24px
// with 4px rounded ends, hairline grids. Colour follows the entity (storage blue, service orange,
// Citadel neutral) through classes in components.css; text never wears a series colour.
// A legend for two or more series; a crosshair and tooltip on every plot.
//
//   lineChart(el, { title, sub, source, series, band, notes, marks, yFormat, area, height })
//     series  [{ name, cls: 'storage' | 'service' | 'neutral', points: [{ x: 'YYYY-MM-DD', y }] }]
//     band    { name, points: [{ x, lo, hi }] }   Citadel held apart within a series
//   barChart(el, { title, sub, source, bars: [{ label, value, cls }], yFormat, height })
//   sparkline(values, { w, h, cls })  →  an SVG string, last point marked
'use strict';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const money0 = v => (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US');
export const moneyK = v => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'K' : String(Math.round(a));
  return (v < 0 ? '−$' : '$') + s;
};
const monthLabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', " '");
// Drawn at the width it is shown, so text keeps its true size in a half card or on a phone.
const widthFor = (el, o) => o.width || Math.max(300, Math.min(1000, el.clientWidth || 900));

// Clean tick values from the lowest step at or below the data to the step at or above it.
function ticks(lo, hi, n = 4) {
  const raw = (hi - lo) / n || 1, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const out = [], top = Math.ceil(hi / step) * step;
  for (let v = Math.floor(lo / step) * step; v <= top + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}

function frame(el, o, svg, key) {
  el.classList.add('chart');
  el.innerHTML = `
    ${o.title || key ? `<div class="chart-head"><div>${o.title ? `<h3 class="chart-title">${esc(o.title)}</h3>` : ''}${o.sub ? `<p class="chart-sub">${esc(o.sub)}</p>` : ''}</div>${key || ''}</div>` : ''}
    <div class="chart-wrap">${svg}<div class="c-tip" hidden></div></div>
    ${o.source ? `<div class="src">${esc(o.source)}</div>` : ''}`;
}

export function lineChart(el, o) {
  if (!el) return;
  const W = widthFor(el, o), compact = W < 600;
  const H = o.height || (compact ? 240 : 300), L = compact ? 44 : 52, R = compact ? 10 : 16, T = 14, B = 28;
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
  const every = compact ? 6 : 3;
  xs.forEach((x, i) => {
    const last = i === xs.length - 1;
    if (i % every === 0 && xs.length - 1 - i >= every * (compact ? 1 : 0.8) || last) {
      g += `<text class="c-axis" x="${fx(x)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : last ? 'end' : 'middle'}">${xf(x)}</text>`;
    }
  });
  for (const m of o.marks || []) {
    g += `<line class="c-mark" x1="${fx(m.x)}" x2="${fx(m.x)}" y1="${T}" y2="${H - B}"/>
      ${compact ? '' : `<text class="c-note" x="${fx(m.x) + 6}" y="${T + 10}">${esc(m.text)}</text>`}`;
  }
  if (o.band) {
    const p = o.band.points.filter(q => xs.includes(q.x));
    g += `<polygon class="c-band" points="${p.map(q => `${fx(q.x)},${fy(q.hi)}`).concat(p.slice().reverse().map(q => `${fx(q.x)},${fy(q.lo)}`)).join(' ')}"/>`;
  }
  const base = fy(Math.max(lo, 0));
  o.series.slice().reverse().forEach(s => {
    const pts = s.points.map(p => `${fx(p.x)},${fy(p.y)}`);
    if (o.area !== false) g += `<polygon class="c-area ${s.cls || ''}" points="${fx(s.points[0].x)},${base} ${pts.join(' ')} ${fx(s.points[s.points.length - 1].x)},${base}"/>`;
    g += `<polyline class="c-line ${s.cls || ''}" points="${pts.join(' ')}"/>`;
    const lp = s.points[s.points.length - 1];
    g += `<circle class="c-end ${s.cls || ''}" cx="${fx(lp.x)}" cy="${fy(lp.y)}" r="4"/>`;
  });
  for (const n of o.notes || []) {
    const below = n.y < (lo + hi) / 2 || fy(n.y) - 8 < T + 12;
    const anchor = fx(n.x) > W - 120 ? 'end' : fx(n.x) < L + 80 ? 'start' : 'middle';
    g += `<text class="c-note ${n.cls || ''}" x="${fx(n.x)}" y="${fy(n.y) + (below ? 16 : -9)}" text-anchor="${anchor}">${esc(n.text)}</text>`;
  }
  g += `<line class="c-cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  g += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="c-hit"/>`;

  const many = o.series.length > 1 || o.band;
  const key = many ? `<div class="chart-key">${o.series.map(s => `<span><i class="k ${s.cls || ''}"></i>${esc(s.name)}</span>`).join('')}${o.band ? `<span><i class="k band"></i>${esc(o.band.name)}</span>` : ''}</div>` : '';
  frame(el, o, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || o.series.map(s => s.name).join(' and '))}">${g}</svg>`, key);

  const svg = el.querySelector('svg'), tip = el.querySelector('.c-tip'), cross = svg.querySelector('.c-cross'), hit = svg.querySelector('.c-hit');
  const move = ev => {
    const pt = ev.touches ? ev.touches[0] : ev;
    const r = svg.getBoundingClientRect(), vx = (pt.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(xs.length - 1, Math.round((vx - L) / (W - L - R) * (xs.length - 1)))), x = xs[i];
    cross.setAttribute('x1', fx(x)); cross.setAttribute('x2', fx(x)); cross.setAttribute('visibility', 'visible');
    const rows = o.series.map(s => { const p = s.points.find(q => q.x === x); return p ? `<span><i class="k ${s.cls || ''}"></i>${esc(s.name)} <b>${money0(p.y)}</b></span>` : null; }).filter(Boolean);
    const b = o.band && o.band.points.find(q => q.x === x);
    if (b) rows.push(`<span><i class="k band"></i>${esc(o.band.name)} <b>${money0(b.hi - b.lo)}</b></span>`);
    tip.innerHTML = `<b>${xf(x)}</b>${rows.join('')}`;
    tip.style.left = Math.max(70, Math.min(r.width - 70, fx(x) / W * r.width)) + 'px';
    tip.hidden = false;
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
}

export function barChart(el, o) {
  if (!el) return;
  const W = widthFor(el, o), H = o.height || 200, L = 4, R = 4, T = 24, B = 26;
  const max = Math.max(...o.bars.map(b => b.value), 0) || 1;
  const slot = (W - L - R) / o.bars.length, bw = Math.min(W > 600 ? 30 : 18, slot * .6);   // ~24px on screen
  const fy = v => T + (1 - v / max) * (H - T - B);
  const yf = o.yFormat || (v => Math.round(v).toLocaleString('en-US'));
  const r = 4;
  let g = `<line class="c-zero" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
  o.bars.forEach((b, i) => {
    const cx = L + slot * (i + .5), x = cx - bw / 2, y = fy(b.value), h = H - B - y;
    const rr = Math.min(r, h);
    g += `<path class="c-bar ${b.cls || ''}" d="M${x},${H - B} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H - B} Z"><title>${esc(b.label)}: ${yf(b.value)}</title></path>`;
    if (b.label) g += `<text class="c-axis" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(b.label)}</text>`;
    if (b.showValue !== false) g += `<text class="c-barval" x="${cx}" y="${y - 7}" text-anchor="middle">${yf(b.value)}</text>`;
  });
  frame(el, o, `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.title || 'bar chart')}">${g}</svg>`);
}

// A sparkline: one series, no axes, the last point marked. Returns an SVG string for a table cell.
export function sparkline(values, o = {}) {
  const w = o.w || 120, h = o.h || 32, pad = 3;
  const v = values.map(x => Number(x) || 0);
  const lo = Math.min(0, ...v), hi = Math.max(...v, 1);
  const fx = i => pad + i / Math.max(1, v.length - 1) * (w - pad * 2);
  const fy = y => pad + (1 - (y - lo) / (hi - lo)) * (h - pad * 2);
  const pts = v.map((y, i) => `${fx(i).toFixed(1)},${fy(y).toFixed(1)}`).join(' ');
  const last = v.length - 1;
  return `<svg class="spark ${o.cls || ''}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    <polygon class="sp-area" points="${fx(0)},${fy(Math.max(lo, 0))} ${pts} ${fx(last)},${fy(Math.max(lo, 0))}"/>
    <polyline class="sp-line" points="${pts}"/>
    <circle class="sp-end" cx="${fx(last)}" cy="${fy(v[last])}" r="2.6"/></svg>`;
}
