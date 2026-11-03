// What every map shares with Home's (components/homemap.js): postcode districts shaded by R4's done services over
// twelve months, so a district is the same colour wherever it appears; routes as a marching dashed line that draws out
// from the yard; a marker going round and each stop pulsing as it is reached; nothing moving off screen, and under
// reduced motion the end state as drawn. No imports: routemap.js draws with it, and the server reads routemap.js.
//   loadZones() once, then bookShading(A, Z) → { zones, shade, label }
//   districtLayer(shading, P) · routeLayer(n, line, cls) · maskFor(id, W, H, routes) · playMap(svg, opts) · vanLoop
//   zoneKey() the legend
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SHADES = 5, REVEAL_MS = 2200, REVEAL_GAP = 250, LOOP_MIN = 7000, LOOP_MAX = 30000, PX_PER_SEC = 90;
const NS = 'http://www.w3.org/2000/svg';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const pathD = line => line.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('');
export const seg = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const ringsD = (rings, P) => rings.map(r => { let d = '', last = null; for (const p of r) { const [x, y] = P(p); if (last && Math.abs(x - last[0]) < 1 && Math.abs(y - last[1]) < 1) continue; d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); last = [x, y]; } return d + 'Z'; }).join('');

let ZONES = null, zonesP = null;
export function loadZones() {
  if (!zonesP) zonesP = fetch('/data/zones.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null).then(z => { ZONES = z; return z; });
  return zonesP;
}

// rows busiest first → each postcode's shade, 1 to 5, in equal counts: the one rule for every map
export function shadesOf(rows) {
  const asc = rows.slice().reverse();
  return new Map(asc.map((p, i) => [p.postcode, 1 + Math.floor(i / asc.length * SHADES)]));
}
// The whole book's shading, from the same postcodes Home reads. Null until the districts have loaded.
export function bookShading(A, Z) {
  if (!ZONES || !A) return null;
  const rows = (A.postcodes || []).filter(p => Z[p.postcode] && !p.billing_only).sort((a, b) => b.services - a.services);
  const by = new Map(rows.map(p => [p.postcode, p]));
  return { zones: ZONES, shade: shadesOf(rows), label: c => { const p = by.get(c); return p ? `${c}: ${p.services.toLocaleString('en-US')} services in twelve months, ${p.customers} customer${p.customers === 1 ? '' : 's'}` : c; } };
}
export function districtLayer(S, P) {
  if (!S) return '';
  let out = '', i = 0;
  for (const [code, z] of [...S.shade.entries()]) {
    const rings = S.zones[code]; if (!rings) continue;
    out += `<path class="hm-z z${z}" style="--i:${i++}" d="${ringsD(rings, P)}"><title>${esc(S.label(code))}</title></path>`;
  }
  return out;
}
export const zoneKey = () => `<div class="hm-key"><span>Fewer services</span>${[1, 2, 3, 4, 5].map(i => `<i class="z${i}"></i>`).join('')}<span>More, across R4 in twelve months</span></div>`;

// One route, masked so it can draw out from the yard: the casing and the dashes go in the masked group.
export const routeLayer = (n, line, cls = '', title = '') => { const d = pathD(line); return `<path class="hm-case ${cls}" data-n="${n}" d="${d}"/><path class="hm-route ${cls}" data-n="${n}" d="${d}">${title ? `<title>${esc(title)}</title>` : ''}</path>`; };
export const maskFor = (id, W, H, lines) => `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" class="hm-mask-off"/>${lines.map((l, n) => `<path class="hm-rv" data-n="${n}" d="${pathD(l)}"/>`).join('')}</mask></defs>`;
let maskN = 0;
export const maskId = () => 'mm' + (++maskN);

// A marker per route, out and back; each stop pulses as it is reached; nothing moves off screen or in a hidden tab.
// drawn: [{ route, path, len, van, hits: [{ at, dot }], T, offset, prev }]
export const loopTime = len => Math.max(LOOP_MIN, Math.min(LOOP_MAX, len / PX_PER_SEC * 1000));
export function vanLoop(svg, live, lit = () => true) {
  const S = { drawn: [], from: 0, seen: false };
  let raf = null;
  const still = reduced();
  const frame = now => {
    raf = null;
    if (!live()) { document.removeEventListener('visibilitychange', S.wake); return; }
    if (now >= S.from) for (const r of S.drawn) {
      if (!r.van || !r.len) continue;
      const p = (((now - S.from) / r.T) + r.offset) % 1, q = r.path.getPointAtLength(p * r.len);
      r.van.setAttribute('cx', q.x.toFixed(1)); r.van.setAttribute('cy', q.y.toFixed(1));
      if (lit(r)) for (const h of r.hits) if (h.dot && r.prev < h.at && p >= h.at) { h.dot.classList.remove('hit'); h.dot.getBoundingClientRect(); h.dot.classList.add('hit'); }
      r.prev = p;
    }
    if (S.seen && !document.hidden) raf = requestAnimationFrame(frame);
  };
  S.wake = () => { svg.classList.toggle('paused', !S.seen || document.hidden); if (!still && S.seen && !document.hidden && raf == null) raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', S.wake);
  return S;
}

// Sets a drawn map going. Markup comes from routeLayer and maskFor; a stop that pulses carries data-n (its route) and
// data-at (how far along it). reveal: the districts fade in and the routes draw out; else they are simply there.
export function playMap(svg, { reveal = true, vans = Infinity, fade = true } = {}) {
  if (!svg) return;
  const still = reduced(), routes = [...svg.querySelectorAll('.hm-route')];
  const animate = reveal && !still;
  if (animate && fade) svg.classList.add('fade');
  const live = () => svg.isConnected;
  const loop = vanLoop(svg, live);
  let g = svg.querySelector('.hm-vans');
  if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'hm-vans'); svg.appendChild(g); }
  loop.drawn = routes.map((path, i) => {
    const n = path.dataset.n, len = path.getTotalLength(), mask = svg.querySelector(`.hm-rv[data-n="${n}"]`), order = reveal ? i : 0;
    if (mask) {
      mask.setAttribute('stroke-dasharray', len.toFixed(1));
      mask.setAttribute('stroke-dashoffset', animate ? len.toFixed(1) : '0');
      if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { mask.style.transition = `stroke-dashoffset ${REVEAL_MS}ms var(--ease-io) ${order * REVEAL_GAP}ms`; mask.setAttribute('stroke-dashoffset', '0'); }));
    }
    let van = null;
    if (!still && i < vans) {
      van = document.createElementNS(NS, 'circle');
      const start = path.getPointAtLength(0);
      for (const [k, v] of Object.entries({ class: `hm-van ${path.classList.contains('dim') ? 'dim' : ''}`, r: 5, cx: start.x.toFixed(1), cy: start.y.toFixed(1) })) van.setAttribute(k, v);
      g.appendChild(van);
    }
    const hits = [...svg.querySelectorAll(`[data-at][data-n="${n}"]`)].map(s => ({ at: +s.dataset.at, dot: s.tagName === 'circle' ? s : s.querySelector('circle') }));
    return { path, len, van, hits, T: loopTime(len), offset: i * 0.11, prev: 0 };
  });
  loop.from = performance.now() + (animate ? REVEAL_MS : 0);
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(es => { if (!live()) { io.disconnect(); return; } loop.seen = es[es.length - 1].isIntersecting; loop.wake(); }, { threshold: 0.1 });
    io.observe(svg);
  } else { loop.seen = true; loop.wake(); }
}
