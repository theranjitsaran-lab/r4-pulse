// Home's Chicago map: where the work is over twelve months, and one day's routes moving out from the yard and back.
// The heat is done services by postcode (activity.postcodes). A route is its done orders in recorded stop order
// (activity.orders, about three weeks), along the main roads: not GPS, which was never captured (data rule 8).
// The note is written from busiestFacts and checked like every other summary. busiest, dayRoutes and busiestFacts
// have no DOM; the server and the tests can read them.
import { YARD, miles, roadPath, loadRoadnet, loadBasemap } from './routemap.js';
import { areaFrame, landLayer, yardMark, scaleBar } from './areamap.js';
import { getJson, esc, titleCase } from './data.js';
import { checkNumbers } from './summary.js';
import * as Fmt from './format.js';

const NEAR_TOWN = 6;      // miles: further than this, a postcode names no town
const NEAR_YARD = 10;
const PLACEHOLDER = /single invoice/i;
const nearest = (pt, places) => { let best = null, d = NEAR_TOWN; for (const [name, lat, lon] of places || []) { const m = miles(pt, [lat, lon]); if (m < d) { d = m; best = name; } } return best; };
const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const realRoute = r => r && r !== '--';

// Every postcode with a real site address, largest first, each with its share of the services
export function busiest(A, Z, places = []) {
  const rows = (A.postcodes || []).filter(p => Z[p.postcode] && !p.billing_only).map(p => ({ ...p, pt: Z[p.postcode] })).sort((a, b) => b.services - a.services);
  const total = rows.reduce((t, p) => t + p.services, 0);
  for (const p of rows) { p.share = total ? p.services / total : 0; p.town = nearest(p.pt, places); }
  const within = rows.filter(p => miles(YARD, p.pt) <= NEAR_YARD).reduce((t, p) => t + p.services, 0);
  return { rows, total, count: rows.length, near: total ? within / total : 0, top3: rows.slice(0, 3).reduce((t, p) => t + p.share, 0) };
}

// The dates the route orders cover, oldest first
export const routeDates = A => [...new Set((A.orders || []).filter(o => o.done && realRoute(o.route)).map(o => o.date))].sort();

// One day's routes: each its done orders in stop order, consecutive stops in a postcode as one
export function dayRoutes(A, Z, date) {
  const by = new Map();
  for (const o of A.orders || []) {
    if (o.date !== date || !o.done || !realRoute(o.route)) continue;
    (by.get(o.route) || by.set(o.route, []).get(o.route)).push(o);
  }
  return [...by.entries()].map(([route, list]) => {
    const stops = [];
    for (const o of list.slice().sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9))) if (Z[o.postcode] && stops[stops.length - 1] !== o.postcode) stops.push(o.postcode);
    return { route, services: list.length, stops };
  }).sort((a, b) => b.services - a.services);
}

const where = p => `${p.postcode}${p.town ? ` near ${p.town}` : ''}`;

// What the note may say, every figure as the panel shows it
export function busiestFacts(B) {
  const t = B.rows[0]; if (!t) return [];
  // a placeholder such as Single Invoice Customer isn't a customer to name
  const names = (t.names || '').split(', ').filter(n => n && !PLACEHOLDER.test(n)).map(titleCase);
  const who = t.customers <= 2 && names.length === 1 ? `${names[0]} is the customer there.` : t.customers === 2 && names.length === 2 ? `${names.join(' and ')} are the customers there.` : `It has ${t.customers} customers.`;
  return [
    { key: 'top', line: `${where(t)} is the busiest postcode: ${Fmt.num(t.services)} services in the last twelve months, ${Fmt.pct(t.share)} of the ${Fmt.num(B.total)} across ${B.count} postcodes. ${who}` },
    { key: 'three', line: `The three busiest, ${B.rows.slice(0, 3).map(p => p.postcode).join(', ')}, take ${Fmt.pct(B.top3)}.` },
    { key: 'near', line: `${Fmt.pct(B.near)} of the services are within ten miles of the yard.` },
  ];
}

// ── the card ──
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const routeName = r => /\d/.test(r) ? r : titleCase(r);
const pathD = line => line.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
const lengthOf = line => line.reduce((t, q, i) => i ? t + Math.hypot(q[0] - line[i - 1][0], q[1] - line[i - 1][1]) : 0, 0);

export async function drawHomeMap(root) {
  const stage = root.querySelector('#hm-svg'); if (!stage) return;
  let A, Z, base;
  try {
    [A, Z, base] = await Promise.all([getJson('activity'), fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}), loadBasemap(), loadRoadnet().catch(() => null)]);
  } catch (e) { stage.innerHTML = '<div class="pending">The map is not available just now.</div>'; return; }
  const B = busiest(A, Z, (base && base.places) || []), dates = routeDates(A);
  if (!B.rows.length) { stage.innerHTML = '<div class="pending">No postcodes on done orders in this window.</div>'; return; }
  const t = B.rows[0], max = t.services;
  root.querySelector('#hm-title').textContent = `Busiest in ${where(t)}: ${Fmt.pct(t.share)} of the year's services`;

  // the note: the facts now, Claude's when it passes the check
  const facts = busiestFacts(B), say = root.querySelector('#hm-say');
  say.textContent = facts.map(f => f.line).join(' ');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'map', sheet: facts }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, facts).ok && say.isConnected) say.textContent = j.text; })
    .catch(() => {});
  root.querySelector('#hm-top').innerHTML = B.rows.slice(0, 5).map(p => `<li><span><b>${esc(p.postcode)}</b>${p.town ? ` ${esc(p.town)}` : ''}<small>${esc(p.customers === 1 ? '1 customer' : `${p.customers} customers`)}</small></span><b>${Fmt.num(p.services)}</b><span>${Fmt.pct(p.share)}</span></li>`).join('');

  const st = { i: dates.length - 1, route: null };
  const draw = () => {
    const date = dates[st.i], routes = date ? dayRoutes(A, Z, date) : [];
    if (st.route && !routes.some(r => r.route === st.route)) st.route = null;
    root.querySelector('#hm-day').textContent = date ? day(date) : 'No routes held';
    root.querySelector('#hm-prev').disabled = st.i <= 0;
    root.querySelector('#hm-next').disabled = st.i >= dates.length - 1;
    root.querySelector('#hm-routes').innerHTML = routes.length > 1 ? `<button type="button" data-r=""${st.route ? '' : ' class="on"'}>All ${routes.length} routes</button>${routes.map(r => `<button type="button" data-r="${esc(r.route)}"${st.route === r.route ? ' class="on"' : ''}>${esc(routeName(r.route))} ${r.services}</button>`).join('')}` : '';

    const W = Math.max(300, Math.min(1100, stage.clientWidth || 700)), H = Math.round(W < 500 ? W * 1.1 : W * 0.66);
    const F = areaFrame(B.rows.map(p => p.pt), W, H, { pad: 20, trim: .12 }), scale = W < 500 ? 13 : 22, big = [...B.rows].slice(0, 5).map(p => p.postcode);
    let g = landLayer(base, F);
    // the heat: area for services, darker the busier; postcode centres only, so no smoothed surface
    B.rows.slice().reverse().forEach((p, i) => {
      const [x, y] = F.P(p.pt); if (!F.inside([x, y])) return;
      const q = p.services / max, band = q > .5 ? 4 : q > .25 ? 3 : q > .1 ? 2 : 1;
      g += `<circle class="hm-h b${band}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + scale * Math.sqrt(q)).toFixed(1)}"><title>${esc(where(p))}: ${Fmt.num(p.services)} services, ${p.customers} customer${p.customers === 1 ? '' : 's'}</title></circle>`;
    });
    const still = reduced();
    routes.forEach((r, n) => {
      const geo = r.stops.map(c => Z[c]); if (!geo.length) return;
      const way = [YARD, ...geo, YARD], line = [F.P(YARD)];
      for (let i = 1; i < way.length; i++) { const rp = roadPath(way[i - 1], way[i]); line.push(...(rp ? rp.pts.slice(1) : [way[i]]).map(q => F.P(q))); }
      const cls = st.route === r.route ? ' on' : st.route ? ' dim' : '', d = pathD(line), dur = Math.max(6, Math.min(24, lengthOf(line) / 70)).toFixed(1);
      g += `<path class="hm-route${cls}" d="${d}"><title>${esc(routeName(r.route))}: ${r.services} services</title></path>`;
      g += geo.map(q => { const [x, y] = F.P(q); return `<circle class="hm-stop${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3"/>`; }).join('');
      if (!still && !(st.route && st.route !== r.route)) g += `<circle class="hm-van" r="4"><animateMotion dur="${dur}s" begin="-${(n * 0.7).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`;
    });
    const taken = [];
    for (const p of B.rows.filter(x => big.includes(x.postcode))) {
      const [x, y] = F.P(p.pt);
      if (!F.inside([x, y]) || taken.some(q => Math.abs(q[0] - x) < 60 && Math.abs(q[1] - y) < 16)) continue;
      taken.push([x, y]);
      g += `<text class="hm-lab" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${esc(p.postcode)}</text>`;
    }
    stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="hm-map" role="img" aria-label="Done services by postcode over twelve months, and the routes on ${esc(date ? day(date) : 'no day')}">${g}${yardMark(F)}${scaleBar(F)}</svg>`;
    watch();
  };
  // nothing moves off screen
  let seen = true;
  const apply = () => { const s = stage.querySelector('svg'); if (!s || !s.pauseAnimations) return; if (seen) s.unpauseAnimations(); else s.pauseAnimations(); s.classList.toggle('paused', !seen); };
  const watch = () => apply();
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(es => { seen = es[es.length - 1].isIntersecting; apply(); }).observe(stage);

  root.querySelector('#hm-prev').addEventListener('click', () => { st.i--; draw(); });
  root.querySelector('#hm-next').addEventListener('click', () => { st.i++; draw(); });
  root.querySelector('#hm-routes').addEventListener('click', ev => { const b = ev.target.closest('button[data-r]'); if (b) { st.route = b.dataset.r || null; draw(); } });
  draw();
}
