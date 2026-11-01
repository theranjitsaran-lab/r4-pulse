// Two charts that began on Home and now sit on Numbers: the month's work against last month's, and what
// shredding the eligible boxes does to revenue.
import { moneyK } from './chart.js';
import { esc } from './data.js';
import { drawIn } from './motion.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monS = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ── this month's work against last month's, by working day: last month a faint line, this month
// green over a wash, its value at the latest day marked ──
export function trend(el, m) {
  if (!el || !m.thisMonth.length) return;
  const W = Math.max(300, Math.min(900, el.clientWidth || 600)), H = W < 500 ? 170 : 200, L = 6, Rr = W < 500 ? 46 : 56, T = 14, B = 22;
  const days = Math.max(m.workdays, m.lastMonth.length), top = Math.max(...m.lastMonth.map(p => p.y), ...m.thisMonth.map(p => p.y)) * 1.08;
  const step = top > 400e3 ? 100e3 : 50e3;
  const fx = d => L + (d - 1) / (days - 1) * (W - L - Rr), fy = y => T + (1 - y / top) * (H - T - B);
  let g = '';
  // a gridline's label gives way to the month's own end label beside it
  const endY = fy(m.thisMonth[m.thisMonth.length - 1].y);
  for (let v = step; v < top; v += step) g += `<line class="c-grid" x1="${L}" x2="${W - Rr}" y1="${fy(v)}" y2="${fy(v)}"/>${Math.abs(fy(v) - endY) < 16 ? '' : `<text class="c-axis" x="${W - Rr + 6}" y="${fy(v) + 4}">${moneyK(v)}</text>`}`;
  g += `<line class="c-zero" x1="${L}" x2="${W - Rr}" y1="${fy(0)}" y2="${fy(0)}"/>`;
  for (const d of [1, 10, days]) g += `<text class="c-axis" x="${fx(d)}" y="${H - 6}" text-anchor="${d === 1 ? 'start' : d === days ? 'end' : 'middle'}">${d === 1 ? 'day 1' : d}</text>`;
  const pts = p => p.map(q => `${fx(q.day).toFixed(1)},${fy(q.y).toFixed(1)}`).join(' ');
  g += `<polyline class="h2-ghost" points="${pts(m.lastMonth)}"/>`;
  const e = m.thisMonth[m.thisMonth.length - 1], le = m.lastMonth[m.lastMonth.length - 1];
  g += `<text class="h2-lab ghost" x="${fx(le.day) - 4}" y="${fy(le.y) + 16}" text-anchor="end">${esc(monS(m.prevMonth))} ${moneyK(le.y)}</text>`;
  g += `<polygon class="h2-wash" points="${fx(1)},${fy(0)} ${pts(m.thisMonth)} ${fx(e.day)},${fy(0)}"/><polyline class="h2-line" points="${pts(m.thisMonth)}"/>`;
  g += `<circle class="h2-dot" cx="${fx(e.day)}" cy="${fy(e.y)}" r="4.5"/><text class="h2-lab" x="${fx(e.day) + 8}" y="${fy(e.y) + 4}">${moneyK(e.y)} est.</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="This month's work by working day against last month's">${g}</svg>
    <div class="h2-key"><span><i class="k line"></i>${esc(mon(m.workMonth))}, to ${esc(dm(m.latestDone))}</span><span><i class="k ghost"></i>${esc(mon(m.prevMonth))}</span></div>`;
  drawIn(el.querySelector('svg'), { x: L, y: T, w: W - L, h: H - T - B });
}

// ── shredding the eligible boxes, over five years est.: the fee once, then the storage lost each month
// (space left empty), against the space refilled at the book's median rate ──
export function destChart(el, x) {
  if (!el) return;
  const W = Math.max(300, Math.min(900, el.clientWidth || 600)), H = 180, L = 6, Rr = W < 500 ? 52 : 64, T = 14, B = 22, N = 60;
  const lostM = x.lostYear / 12, refillM = (x.refilled - x.fee) / 12;
  const empty = t => x.fee - lostM * t, full = t => x.fee + refillM * t;
  const ys = [0, x.fee, empty(N), full(N)], lo = Math.min(...ys) * 1.1, hi = Math.max(...ys) * 1.1;
  const fx = t => L + t / N * (W - L - Rr), fy = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = `<line class="c-zero" x1="${L}" x2="${W - Rr}" y1="${fy(0)}" y2="${fy(0)}"/>`;
  for (const t of [0, 12, 24, 36, 48, 60]) g += `<text class="c-axis" x="${fx(t)}" y="${H - 6}" text-anchor="${t === 0 ? 'start' : t === N ? 'end' : 'middle'}">${t === 0 ? 'now' : `${t / 12} yr`}</text>`;
  const pts = f => Array.from({ length: N + 1 }, (_, t) => `${fx(t).toFixed(1)},${fy(f(t)).toFixed(1)}`).join(' ');
  g += `<polyline class="h2-line soft" points="${pts(full)}"/><polyline class="h2-line warn" points="${pts(empty)}"/>`;
  const be = x.fee / lostM;
  if (be <= N) g += `<circle class="h2-dot warn" cx="${fx(be)}" cy="${fy(0)}" r="4"/><text class="h2-lab" x="${fx(be)}" y="${fy(0) - 9}" text-anchor="middle">even at ${Math.round(be)} months</text>`;
  g += `<text class="h2-lab" x="${W - Rr + 6}" y="${fy(full(N)) + 4}">${moneyK(full(N))}</text><text class="h2-lab" x="${W - Rr + 6}" y="${fy(empty(N)) + 4}">${moneyK(empty(N))}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="Running effect on revenue of shredding the eligible boxes, over five years">${g}</svg>
    <div class="h2-key"><span><i class="k soft"></i>space refilled at the median</span><span><i class="k warn"></i>space left empty</span></div>`;
}

