// The pricing distribution strip: every account's rate for one service as a dot, with cost to
// serve, the median, the list price and your price marked. Ported from docs/r4_pricing.html with
// the fixes from the design review:
//   1. one dot per real account (the prototype drew a population through the percentiles)
//   2. edge labels stay inside the plot: the anchor swings to start or end near the edges
//   3. accounts beyond the scale are counted ("33 accounts above $49"), never stacked at the edge
//   4. sound prices are neutral ink; only below cost (red) and below median (amber) carry colour
//
//   const stats = strip(el, { values: [{ v, name }], cost, list, price, named: [name], fmt })
//   stats: { n, min, p10, p25, median, p75, p90, max, below(price) }  — share of accounts cheaper
'use strict';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q, a = Math.floor(i), b = Math.ceil(i);
  return sorted[a] + (sorted[b] - sorted[a]) * (i - a);
}

// With weights (values carry w, e.g. boxes), the quantiles are of the weight, not of the accounts:
// the rate the typical box pays rather than the typical account.
export function stripStats(values) {
  const pts = values.filter(x => Number.isFinite(x.v)).sort((a, b) => a.v - b.v), s = pts.map(x => x.v);
  const weighted = pts.some(x => x.w > 0);
  const total = weighted ? pts.reduce((t, x) => t + (x.w || 0), 0) : pts.length;
  const wq = q => { let acc = 0; for (const x of pts) { acc += x.w || 0; if (acc >= q * total) return x.v; } return s[s.length - 1]; };
  const qf = weighted ? wq : q => quantile(s, q);
  return {
    n: s.length, min: s[0], max: s[s.length - 1], weighted,
    p10: qf(.10), p25: qf(.25), median: qf(.5), p75: qf(.75), p90: qf(.90),
    // share of the book below a price, with accounts at exactly that price counted half on each side,
    // so the median itself reads "cheaper than half", not "cheaper than 91%" when many sit on it
    below: weighted ? (p) => pts.reduce((t, x) => t + (x.v < p ? 1 : x.v === p ? 0.5 : 0) * (x.w || 0), 0) / (total || 1)
                    : (p) => s.reduce((t, v) => t + (v < p ? 1 : v === p ? 0.5 : 0), 0) / (s.length || 1),
  };
}

export function strip(el, o) {
  if (!el) return null;
  const st = stripStats(o.values);
  const fmt = o.fmt || (v => '$' + v.toFixed(2));
  const W = 900, H = 236, L = 18, R = 18, TOP = 62, BOT = 56, iw = W - L - R;
  const cost = Number.isFinite(o.cost) ? o.cost : null, list = Number.isFinite(o.list) ? o.list : null;
  const price = Number.isFinite(o.price) ? o.price : null;
  const lo = Math.min(st.min, cost ?? Infinity, price ?? Infinity) * 0.9;
  const hi = Math.max(Math.min(st.p90 * 1.2, st.max), (price ?? 0) * 1.08, (list ?? 0) * 1.05, (cost ?? 0) * 1.1);
  const x = v => L + Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * iw;
  const band = (TOP + H - BOT) / 2;
  const state = v => (cost != null && v < cost) ? 'is-bad' : v < st.median ? 'is-warn' : '';
  let sd = 991; const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  let g = '';

  if (cost != null) g += `<rect class="s-costzone" x="${L}" y="${TOP - 8}" width="${Math.max(0, x(cost) - L)}" height="${H - BOT - TOP + 16}"/>`;

  const named = new Set(o.named || []);
  let over = 0;
  for (const p of o.values) {
    if (p.v > hi) { over++; continue; }
    if (named.has(p.name)) continue;
    g += `<circle class="s-dot ${state(p.v)}" cx="${x(p.v).toFixed(1)}" cy="${(band + (rnd() - .5) * 48).toFixed(1)}" r="4"><title>${esc(p.name || '')} ${fmt(p.v)}</title></circle>`;
  }
  // counted on the axis row at the right, clear of the name lanes
  if (over) g += `<text class="s-over" x="${W - R}" y="${H - BOT + 30}" text-anchor="end">${over} account${over > 1 ? 's' : ''} above ${fmt(hi)} →</text>`;

  // Named accounts: labels packed into four lanes, two above the swarm and two below, so close
  // rates do not print on top of each other. The anchor swings at the edges (fix 2).
  const lanes = [[], [], [], []], laneY = [TOP + 6, TOP + 21, H - BOT - 19, H - BOT - 4];
  o.values.filter(p => named.has(p.name) && p.v <= hi).sort((a, b) => a.v - b.v).forEach(p => {
    // VCK names run long and in capitals: cut at 24 characters and size the label for capitals
    const nm = p.name.length > 24 ? p.name.slice(0, 23).trimEnd() + '…' : p.name;
    const cx = x(p.v), label = `${nm} ${fmt(p.v)}`, half = label.length * 3.6 + 6;
    const anc = cx - half < L ? 'start' : cx + half > W - R ? 'end' : 'middle';
    const tx = anc === 'start' ? L : anc === 'end' ? W - R : cx;
    const x0 = anc === 'start' ? L : anc === 'end' ? W - R - half * 2 : cx - half, x1 = x0 + half * 2;
    let ln = lanes.findIndex(l => l.every(r => x1 < r[0] - 6 || x0 > r[1] + 6));
    if (ln < 0) return;   // no clear lane: the dot stays, unlabelled, rather than print over another name
    lanes[ln].push([x0, x1]);
    const cy = laneY[ln], up = ln < 2;
    g += `<line class="s-lead" x1="${cx}" y1="${up ? cy + 4 : cy - 10}" x2="${cx}" y2="${band}"/>
      <circle class="s-dot named ${state(p.v)}" cx="${cx}" cy="${band}" r="5.5"><title>${esc(label)}</title></circle>
      <text class="s-name" x="${tx}" y="${cy}" text-anchor="${anc}">${esc(label)}</text>`;
  });

  const ref = (v, lab, cls) => {
    if (v == null || v < lo || v > hi) return '';
    const anc = x(v) < L + 40 ? 'start' : x(v) > W - R - 40 ? 'end' : 'middle';
    return `<line class="s-ref ${cls}" x1="${x(v)}" y1="${TOP - 16}" x2="${x(v)}" y2="${H - BOT + 6}"/>
      <text class="s-reflab ${cls}" x="${x(v)}" y="${TOP - 22}" text-anchor="${anc}">${esc(lab)}</text>`;
  };
  g += ref(cost, 'cost ' + (cost != null ? fmt(cost) : ''), 'cost');
  g += ref(st.median, 'median ' + fmt(st.median), 'median');
  g += ref(list, 'list ' + (list != null ? fmt(list) : ''), 'list');

  if (price != null && price >= lo && price <= hi) {
    const px = x(price), lbl = 'You ' + fmt(price), w = Math.max(66, lbl.length * 7.5 + 20);
    const bx = Math.max(L, Math.min(W - R - w, px - w / 2));
    g += `<line class="s-you" x1="${px}" y1="${TOP - 34}" x2="${px}" y2="${H - BOT + 12}"/>
      <rect class="s-youbox" x="${bx}" y="${H - BOT + 16}" width="${w}" height="21" rx="3"/>
      <text class="s-youlab" x="${bx + w / 2}" y="${H - BOT + 30.5}" text-anchor="middle">${esc(lbl)}</text>`;
  }

  // Axis ticks sit inside the range and give way to the price badge.
  g += `<line class="s-axis" x1="${L}" y1="${H - BOT + 6}" x2="${W - R}" y2="${H - BOT + 6}"/>`;
  [.2, .5].forEach(f => {
    const v = lo + (hi - lo) * f, tx = x(v);
    if (price != null && Math.abs(tx - x(price)) < 56) return;
    g += `<text class="s-tick" x="${tx}" y="${H - BOT + 52}" text-anchor="middle">${fmt(v)}</text>`;
  });

  el.classList.add('strip');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Rates across ${st.n} accounts, with cost to serve, median${list != null ? ', list' : ''}${price != null ? ' and your price' : ''} marked`)}">${g}</svg>`;
  return st;
}
