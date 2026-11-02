// Home's Chicago map: postcode districts shaded by twelve months of done services, and last week's real routes moving
// out from the yard and back. Shading: activity.postcodes on the Census districts in public/data/zones.json. Routes:
// done orders in recorded stop order (activity.orders), joined along the main roads; not GPS, which was never captured
// (data rule 8). Counts: activity.routeDays. busiest, lastWeek, periodRoutes, districtActivity and busiestFacts have
// no DOM, for the tests. The note is written from busiestFacts and checked like every other summary.
import { YARD, miles, roadPath, loadRoadnet, loadBasemap } from './routemap.js';
import { areaFrame, landLayer, yardMark, scaleBar } from './areamap.js';
import { getJson, esc, titleCase } from './data.js';
import { checkNumbers } from './summary.js';
import * as Fmt from './format.js';
import { shadesOf, ringsD as zoneD, pathD, seg, vanLoop, loopTime } from './mapkit.js';

const NEAR_TOWN = 6;      // miles: further than this, a postcode names no town
const NEAR_YARD = 10;
const PLACEHOLDER = /single invoice/i;
const REVEAL_MS = 2200, REVEAL_GAP = 250;
const nearest = (pt, places) => { let best = null, d = NEAR_TOWN; for (const [name, lat, lon] of places || []) { const m = miles(pt, [lat, lon]); if (m < d) { d = m; best = name; } } return best; };
const utc = d => new Date(d + 'T12:00:00Z');
const dayShort = d => utc(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
const dayLong = d => utc(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
const realRoute = r => r && r !== '--';
const addDays = (d, n) => { const t = utc(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const where = p => `${p.postcode}${p.town ? ` near ${p.town}` : ''}`;
const namesOf = p => (p.names || '').split(', ').filter(n => n && !PLACEHOLDER.test(n)).map(titleCase);

// Every postcode with a real site address, largest first, each with its share of the services
export function busiest(A, Z, places = []) {
  const rows = (A.postcodes || []).filter(p => Z[p.postcode] && !p.billing_only).map(p => ({ ...p, pt: Z[p.postcode] })).sort((a, b) => b.services - a.services);
  const total = rows.reduce((t, p) => t + p.services, 0);
  for (const p of rows) { p.share = total ? p.services / total : 0; p.town = nearest(p.pt, places); }
  const within = rows.filter(p => miles(YARD, p.pt) <= NEAR_YARD).reduce((t, p) => t + p.services, 0);
  return { rows, total, count: rows.length, near: total ? within / total : 0, top3: rows.slice(0, 3).reduce((t, p) => t + p.share, 0) };
}

// The last complete Monday to Friday in the data: its dates that ran, oldest first
export function lastWeek(A) {
  const latest = A.latestDone; if (!latest) return [];
  const dow = utc(latest).getUTCDay();      // 0 Sunday
  const monday = addDays(latest, dow === 0 ? -6 : dow >= 5 ? 1 - dow : -6 - dow);
  const ran = new Set((A.routeDays || []).filter(r => realRoute(r.route) && r.services_done > 0).map(r => r.date));
  return [0, 1, 2, 3, 4].map(i => addDays(monday, i)).filter(d => ran.has(d));
}

// The routes over some dates, busiest first: services from routeDays, and for each date its stops in recorded order,
// consecutive stops in one postcode as one. A route that ran the same stops on two days is drawn once.
export function periodRoutes(A, Z, dates) {
  const on = new Set(dates), by = new Map();
  for (const r of A.routeDays || []) {
    if (!on.has(r.date) || !realRoute(r.route) || !(r.services_done > 0)) continue;
    const x = by.get(r.route) || { route: r.route, services: 0, days: [] };
    x.services += r.services_done; by.set(r.route, x);
  }
  const orders = new Map();
  for (const o of A.orders || []) {
    if (!on.has(o.date) || !o.done || !by.has(o.route)) continue;
    const k = o.date + '|' + o.route; (orders.get(k) || orders.set(k, []).get(k)).push(o);
  }
  for (const x of by.values()) {
    const seen = new Set();
    for (const date of dates) {
      const stops = [];
      for (const o of (orders.get(date + '|' + x.route) || []).slice().sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9))) if (Z[o.postcode] && stops[stops.length - 1] !== o.postcode) stops.push(o.postcode);
      const key = stops.join();
      if (stops.length && !seen.has(key)) { seen.add(key); x.days.push({ date, stops }); }
    }
  }
  return [...by.values()].sort((a, b) => b.services - a.services);
}

// What happened in a district over some dates: its services, and the routes that did them
export function districtActivity(A, dates, postcode) {
  const on = new Set(dates), routes = new Map(); let services = 0;
  for (const o of A.orders || []) {
    if (!on.has(o.date) || !o.done || o.postcode !== postcode || !realRoute(o.route)) continue;
    services++; routes.set(o.route, (routes.get(o.route) || 0) + 1);
  }
  return { services, routes: [...routes.entries()].sort((a, b) => b[1] - a[1]).map(([route, n]) => ({ route, n })) };
}

// What the note may say, every figure as the panel shows it
export function busiestFacts(B) {
  const t = B.rows[0]; if (!t) return [];
  const names = namesOf(t);
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
const NS = 'http://www.w3.org/2000/svg';
const ringsD = (rings, F) => zoneD(rings, F.P);

// A route over its days: yard, stops, yard, day after day, along the main roads. Where each stop falls along the line.
function routeLine(r, Z, F) {
  const yard = F.P(YARD), line = [yard], stops = []; let at = 0;
  const push = q => { at += seg(line[line.length - 1], q); line.push(q); };
  for (const d of r.days) {
    const way = [YARD, ...d.stops.map(c => Z[c]), YARD];
    for (let i = 1; i < way.length; i++) {
      const rp = roadPath(way[i - 1], way[i]);
      for (const q of rp ? rp.pts.slice(1) : [way[i]]) push(F.P(q));
      if (i < way.length - 1) stops.push({ code: d.stops[i - 1], pt: F.P(way[i]), at });
    }
  }
  return { line, stops, len: at };
}

export async function drawHomeMap(root, { play = false } = {}) {
  const stage = root.querySelector('#hm-svg'); if (!stage) return;
  let A, Z, base, zones;
  try {
    const json = u => fetch(u, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {});
    [A, Z, base, zones] = await Promise.all([getJson('activity'), json('/data/zcta.json'), loadBasemap(), json('/data/zones.json'), loadRoadnet().catch(() => null)]);
  } catch (e) { stage.innerHTML = '<div class="pending">The map is not available just now.</div>'; return; }
  const B = busiest(A, Z, (base && base.places) || []), week = lastWeek(A);
  if (!B.rows.length) { stage.innerHTML = '<div class="pending">No postcodes on done orders in this window.</div>'; return; }
  const t = B.rows[0], max = t.services, byCode = new Map(B.rows.map(p => [p.postcode, p]));
  root.querySelector('#hm-title').textContent = `Busiest in ${where(t)}: ${Fmt.pct(t.share)} of the year's services`;

  // the note: the facts now, Claude's when it passes the check
  const facts = busiestFacts(B), say = root.querySelector('#hm-say');
  say.textContent = facts.map(f => f.line).join(' ');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'map', sheet: facts }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, facts).ok && say.isConnected) say.textContent = j.text; })
    .catch(() => {});
  root.querySelector('#hm-top').innerHTML = B.rows.slice(0, 5).map((p, i) => `<li data-pc="${esc(p.postcode)}"><span><b>${esc(p.postcode)}</b>${p.town ? ` ${esc(p.town)}` : ''}<small>${esc(p.customers === 1 ? '1 customer' : `${p.customers} customers`)}</small></span><b>${Fmt.num(p.services)}</b><span>${Fmt.pct(p.share)}</span><i class="hm-barlet" style="--s:${(p.services / max).toFixed(3)};--i:${i}"></i></li>`).join('');

  // the map itself, drawn once: land, districts darker the busier, top labels, the yard; routes go between
  const W = Math.max(300, Math.min(1100, stage.clientWidth || 700)), H = Math.round(W < 500 ? W * 1.1 : W * 0.66);
  const F = areaFrame(B.rows.map(p => p.pt), W, H, { pad: 20, trim: .12 }), still = reduced();
  const asc = B.rows.slice().reverse(), shade = shadesOf(B.rows);
  let districts = '';
  asc.forEach((p, i) => {
    const rings = zones[p.postcode]; if (!rings) return;
    const label = `${where(p)}: ${Fmt.num(p.services)} services, ${p.customers} customer${p.customers === 1 ? '' : 's'}`;
    districts += `<path class="hm-z z${shade.get(p.postcode)}" data-pc="${esc(p.postcode)}" style="--i:${i}" d="${ringsD(rings, F)}"><title>${esc(label)}</title></path>`;
  });
  const taken = []; let labels = '';
  for (const p of B.rows.slice(0, 5)) {
    const [x, y] = F.P(p.pt);
    if (!F.inside([x, y]) || taken.some(q => Math.abs(q[0] - x) < 60 && Math.abs(q[1] - y) < 16)) continue;
    taken.push([x, y]);
    labels += `<text class="hm-lab" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${esc(p.postcode)}</text>`;
  }
  stage.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="hm-map${play && !still ? ' fade' : ''}" role="img" aria-label="Postcode districts shaded by services over twelve months, and last week's routes from the yard">
    ${landLayer(base, F)}<g id="hm-zones">${districts}</g><defs><mask id="hm-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" class="hm-mask-off"/><g id="hm-reveal"></g></mask></defs>
    <g id="hm-routesvg" mask="url(#hm-mask)"></g><g id="hm-stops"></g><g id="hm-vans"></g>${labels}${yardMark(F)}${scaleBar(F)}</svg>`;
  const svg = stage.querySelector('svg'), gRoutes = svg.querySelector('#hm-routesvg'), gReveal = svg.querySelector('#hm-reveal'), gStops = svg.querySelector('#hm-stops'), gVans = svg.querySelector('#hm-vans');
  root.querySelector('#hm-key').innerHTML = `<span>Fewer services</span>${[1, 2, 3, 4, 5].map(i => `<i class="z${i}"></i>`).join('')}<span>More</span>`;

  // ── the period, the routes, and what is drawn for them ──
  const st = { day: 'week', route: null };
  const periodDates = () => st.day === 'week' ? week : [st.day];
    const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  const loop = vanLoop(svg, () => root.isConnected, r => !st.route || st.route === r.route);
  const drawRoutes = animate => {
    gRoutes.textContent = ''; gReveal.textContent = ''; gStops.textContent = ''; gVans.textContent = '';
    const routes = periodRoutes(A, Z, periodDates());
    loop.drawn = routes.filter(r => r.days.length).map((r, n) => {
      const { line, stops, len } = routeLine(r, Z, F), d = pathD(line);
      el('path', { class: 'hm-case', d, 'data-r': r.route }, gRoutes);
      const path = el('path', { class: 'hm-route', d, 'data-r': r.route }, gRoutes);
      const mask = el('path', { class: 'hm-rv', d, 'stroke-dasharray': len.toFixed(1), 'stroke-dashoffset': animate ? len.toFixed(1) : '0' }, gReveal);
      const seen = new Set(), dots = [];
      for (const s of stops) { if (seen.has(s.code)) continue; seen.add(s.code); dots.push(el('circle', { class: 'hm-stop', cx: s.pt[0].toFixed(1), cy: s.pt[1].toFixed(1), r: 3.5, 'data-r': r.route }, gStops)); }
      const van = still ? null : el('circle', { class: 'hm-van', r: 5, cx: line[0][0].toFixed(1), cy: line[0][1].toFixed(1), 'data-r': r.route }, gVans);
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { mask.style.transition = `stroke-dashoffset ${REVEAL_MS}ms var(--ease-io) ${n * REVEAL_GAP}ms`; mask.setAttribute('stroke-dashoffset', '0'); }));
      const hits = stops.map(s => ({ at: len ? s.at / len : 0, dot: dots[[...seen].indexOf(s.code)] }));
      return { route: r.route, services: r.services, path, len, van, hits, T: loopTime(len), offset: n * 0.11, prev: 0 };
    });
    loop.from = performance.now() + (animate ? REVEAL_MS : 0);
    return routes;
  };

  const sum = root.querySelector('#hm-sum'), chips = root.querySelector('#hm-chips');
  const drawControls = routes => {
    const services = routes.reduce((a, r) => a + r.services, 0), label = st.day === 'week' ? `Last week, ${dayShort(week[0])} to ${dayLong(week[week.length - 1])}` : dayLong(st.day);
    sum.textContent = `${label}: ${Fmt.num(services)} services on ${routes.length} route${routes.length === 1 ? '' : 's'}`;
    if (st.route && !routes.some(r => r.route === st.route)) st.route = null;
    chips.innerHTML = `<button type="button" data-r="" aria-pressed="${!st.route}">All ${routes.length} routes</button>${routes.map(r => `<button type="button" data-r="${esc(r.route)}" aria-pressed="${st.route === r.route}">${esc(routeName(r.route))} ${Fmt.num(r.services)}</button>`).join('')}`;
    root.querySelector('#hm-days').innerHTML = `<button type="button" data-d="week" aria-pressed="${st.day === 'week'}">Last week</button>${week.map(d => `<button type="button" data-d="${d}" aria-pressed="${st.day === d}">${esc(dayShort(d))}</button>`).join('')}`;
  };
  const dim = () => { for (const e of svg.querySelectorAll('#hm-routesvg [data-r], #hm-stops [data-r], #hm-vans [data-r]')) e.classList.toggle('dim', !!st.route && e.dataset.r !== st.route); };

  const redraw = animate => { const routes = drawRoutes(animate && !still); drawControls(routes); dim(); };
  root.querySelector('#hm-days').addEventListener('click', ev => { const b = ev.target.closest('button[data-d]'); if (b && b.dataset.d !== st.day) { st.day = b.dataset.d; redraw(true); } });
  chips.addEventListener('click', ev => { const b = ev.target.closest('button[data-r]'); if (!b) return; st.route = b.dataset.r || null; drawControls(periodRoutes(A, Z, periodDates())); dim(); });

  // ── hover or tap a district, or a row of the list: what's going on there ──
  const tip = root.querySelector('#hm-tip'), stageBox = root.querySelector('.hm-stage');
  let hot = null;
  const mark = code => { if (hot) hot.classList.remove('hot'); hot = code ? svg.querySelector(`.hm-z[data-pc="${code}"]`) : null; if (hot) { hot.classList.add('hot'); hot.parentNode.appendChild(hot); } };
  const showTip = (code, x, y) => {
    const p = byCode.get(code); if (!p) return;
    const a = districtActivity(A, periodDates(), code), names = namesOf(p), period = st.day === 'week' ? 'Last week' : dayLong(st.day);
    tip.innerHTML = `<b>${esc(where(p))}</b><span>${Fmt.num(p.services)} services in twelve months, ${Fmt.pct(p.share)} of the total</span><span>${p.customers} customer${p.customers === 1 ? '' : 's'}${names.length ? `, including ${esc(names.slice(0, 2).join(' and '))}` : ''}</span><span class="now">${esc(period)}: ${a.services ? `${Fmt.num(a.services)} service${a.services === 1 ? '' : 's'} by ${esc(a.routes.slice(0, 3).map(r => routeName(r.route)).join(', '))}` : 'no services'}</span>`;
    const box = stageBox.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(box.width - w, x - box.left - w / 2)) + 'px';
    tip.style.top = Math.max(0, y - box.top - h - 12) + 'px';
    tip.classList.add('on');
  };
  const hideTip = () => { tip.classList.remove('on'); mark(null); };
  svg.addEventListener('mousemove', ev => { const z = ev.target.closest && ev.target.closest('.hm-z'); if (!z) { hideTip(); return; } if (z !== hot) mark(z.dataset.pc); showTip(z.dataset.pc, ev.clientX, ev.clientY); });
  svg.addEventListener('mouseleave', hideTip);
  svg.addEventListener('click', ev => { const z = ev.target.closest && ev.target.closest('.hm-z'); if (z) { mark(z.dataset.pc); showTip(z.dataset.pc, ev.clientX, ev.clientY); } else hideTip(); });
  const listTip = li => { if (!li) return; mark(li.dataset.pc); const r = hot && hot.getBoundingClientRect(); if (r) showTip(li.dataset.pc, r.left + r.width / 2, r.top + r.height / 2); };
  const list = root.querySelector('#hm-top');
  list.addEventListener('mouseover', ev => listTip(ev.target.closest('li[data-pc]')));
  list.addEventListener('mouseleave', hideTip);
  list.addEventListener('click', ev => listTip(ev.target.closest('li[data-pc]')));

  // the routes wait until the map is in view: the first draw is what plays
  let started = false;
  const begin = () => { if (started) return; started = true; redraw(play); };
  if (typeof IntersectionObserver === 'function') new IntersectionObserver(es => { loop.seen = es[es.length - 1].isIntersecting; if (loop.seen) begin(); loop.wake(); }, { threshold: 0.1 }).observe(stage);
  else { loop.seen = true; begin(); loop.wake(); }
}
