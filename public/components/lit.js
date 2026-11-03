// What every Accounts view and customer page shares. Three lit points (Home's pattern: green on track, amber worth a
// look, red needs attention), KPI tiles with a change chip, the RAG margin pill and its key, and the small bar chart.
// Points are written from computed fields; Claude may reword them, and any number not on the sheet throws its words away.
import * as Fmt from './format.js';
import { esc } from './data.js';
import { checkNumbers, parseQuote } from './summary.js';
import { marginBand } from './margin.js';

const LIGHT = { g: 'On track', a: 'Worth a look', r: 'Needs attention' };
const liHtml = (p, text, i) => `<li style="--n:${i}"><i class="light ${p.tone}" role="img" aria-label="${LIGHT[p.tone]}"></i><div>${text}</div></li>`;
export const pointsHtml = pts => `<ul class="lit">${pts.map((p, i) => liHtml(p, `<b>${esc(p.lead)}</b> ${esc(p.rest)}`, i)).join('')}</ul>`;

// the plain version at once; Claude's when it is back and every number in it is on the sheet
export function drawPoints(el, pts) {
  if (!el) return;
  el.innerHTML = pointsHtml(pts);
  const sheet = pts.map(p => ({ key: p.key, line: `${p.lead} ${p.rest}` }));
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'points', sheet }) })
    .then(r => r.ok ? r.json() : null).then(j => {
      if (!j || j.source !== 'claude' || !el.isConnected) return;
      const T = parseQuote(j.text, sheet);
      if (T && checkNumbers(j.text, sheet).ok) el.innerHTML = `<ul class="lit">${pts.map((p, i) => liHtml(p, esc(T[p.key]), i)).join('')}</ul>`;
    }).catch(() => {});
}
export const litCard = (id, by = 'Pulse summary, from the figures below') => `<section class="h2-card lit-card" data-in><div id="${id}"></div><small class="lit-by">${esc(by)}</small></section>`;

// a change: blue up, red down, grey flat
export function chip(pct) {
  if (pct == null) return '';
  const cls = pct >= .01 ? 'up' : pct <= -.01 ? 'down' : 'flat';
  return `<span class="kchip ${cls}">${esc(Fmt.change(pct))}</span>`;
}
export const chipText = (text, cls = 'flat') => `<span class="kchip ${cls}">${esc(text)}</span>`;

const sparkBars = v => { const m = Math.max(1, ...v.map(x => Math.abs(x))); return `<svg class="kspk" width="${v.length * 6}" height="22" aria-hidden="true">${v.map((x, i) => { const h = Math.max(1.5, Math.abs(x) / m * 22); return `<rect class="${i === v.length - 1 ? 'f' : ''}" x="${i * 6}" y="${(22 - h).toFixed(1)}" width="4" height="${h.toFixed(1)}"/>`; }).join('')}</svg>`; };
// o: { label, big, sub (html), lead, spark, href, margin: { cls, id } , d }
export function tile(o) {
  const tag = o.href ? 'a' : o.margin ? 'button' : 'div', attrs = o.href ? ` href="${esc(o.href)}"` : o.margin ? ` type="button" data-margin-tile="1"` : '';
  return `<${tag} class="kt${o.lead ? ' lead' : ''}${o.margin ? ` rag-${o.margin.cls}` : ''}"${attrs} data-in style="--d:${o.d || 0}ms"><span class="kl"><span>${esc(o.label)}</span>${o.margin ? '<em class="chev">Breakdown</em>' : ''}</span><b${o.still ? '' : ` data-count data-delay="${o.d || 0}"`}>${esc(o.big)}</b><span class="kc">${o.sub || ''}</span>${o.spark && o.spark.length > 1 ? sparkBars(o.spark) : ''}</${tag}>`;
}

// the pill: the app's one definition of a margin (margin.js marginBand). Tap for the pop-out.
export function ragPill(R, pc, text, attrs = '', i = 0) {
  const b = marginBand(R, pc);
  return `<button type="button" class="rag ${b.cls}" style="--i:${Math.min(i, 30)}" aria-label="Margin ${esc(text)}, ${esc(b.word)}, open breakdown" ${attrs}><i></i>${esc(text)}</button>`;
}
export const ragLabel = (R, pc) => { const b = marginBand(R, pc); return `<span class="rag static ${b.cls}"><i></i>${esc(b.word)}</span>`; };
export function ragKey(R) {
  const S = R.SETTINGS, p = v => Fmt.pct(v);
  return `<span class="rag static g"><i></i>Healthy, ${p(S.marginHealthy)} or more</span><span class="rag static a"><i></i>Normal, ${p(S.marginThin)} or more</span><span class="rag static r"><i></i>Thin, under ${p(S.marginThin)}</span>`;
}

// Twelve months as bars on one axis, an own-run line if given. rows: [{ m: 'YYYY-MM-01', v, attrs }]
const short = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
export function barsSvg(rows, { ref = null, refLabel = '', est = false, height = 140, fmt = v => Fmt.money(v, { short: true }), label = '' } = {}) {
  const W = 560, H = height, base = H - 18, top = 12, m = Math.max(1, ...rows.map(r => r.v), ref || 0), step = (W - 34) / rows.length, bw = Math.min(24, step * .62), y = v => base - Math.max(0, v) / m * (base - top);
  let g = `<line class="b-ax" x1="34" x2="${W}" y1="${base}" y2="${base}"/><text class="b-t" x="30" y="${top + 4}" text-anchor="end">${esc(fmt(m))}</text><text class="b-t" x="30" y="${base + 3}" text-anchor="end">$0</text>`;
  rows.forEach((r, i) => {
    const x = 34 + i * step + (step - bw) / 2, h = Math.max(1, base - y(r.v));
    g += `<rect class="${i === rows.length - 1 ? (est ? 'e' : 'f') : 'c'}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="--i:${i}" ${r.attrs || ''}><title>${esc(short(r.m))}: ${esc(Fmt.money(r.v))}</title></rect>`;
    if (i % 2 === 0 || i === rows.length - 1) g += `<text class="b-t" x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(short(r.m))}</text>`;
  });
  if (ref != null) g += `<line class="b-ref" x1="34" x2="${W}" y1="${y(ref).toFixed(1)}" y2="${y(ref).toFixed(1)}"/><text class="b-rl" x="38" y="${(y(ref) - 4).toFixed(1)}">${esc(refLabel)}</text>`;
  return `<svg class="kbars" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">${g}</svg>`;
}
