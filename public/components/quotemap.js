// The Quote screen's map (views/pricing.js): Home's land and district shading, every postcode tappable, then for the
// place chosen a pin, a two-mile ring, the nearest route day drawn out from the yard with its stops, and the line from
// the nearest stop, or a dotted line from the yard when no route is near. Postcode centres along main roads: no GPS was
// ever captured. A fresh draw each time; the old map's marker loop ends with it (mapkit.js).
import { YARD, miles, roadPath } from './routemap.js';
import { areaFrame, landLayer, yardMark, scaleBar } from './areamap.js';
import { ringsD, routeLayer, maskFor, maskId, seg, playMap } from './mapkit.js';
import { esc } from './data.js';
import * as Fmt from './format.js';

const RING_MILES = 2;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// a line along the main roads, in the frame, where the roads give a way
const along = (a, b, F) => { const r = roadPath(a, b); return (r ? r.pts : [a, b]).map(F.P); };

export function drawQuoteMap(el, { Z, base, zones, shading, postcode, near, useRoute, onPick, moved = false, first = false }) {
  if (!el) return;
  const W = Math.max(300, Math.min(1100, el.clientWidth || 700)), H = Math.round(W < 500 ? W * 1.05 : W * 0.72);
  const book = [...shading.shade.keys()].map(c => Z[c]).filter(Boolean), pt = postcode ? Z[postcode] : null;
  let F = areaFrame(book, W, H, { pad: 20, trim: .12 });
  if (pt && !F.inside(F.P(pt), -20)) F = areaFrame([...book, pt], W, H, { pad: 28, trim: 0 });
  // every district with a boundary near the frame: shaded where R4 works, plain where it does not yet, all tappable
  let zs = '', i = 0;
  for (const [code, rings] of Object.entries(zones)) {
    const q = F.P(rings[0][0]); if (q[0] < -220 || q[0] > W + 220 || q[1] < -220 || q[1] > H + 220) continue;
    const z = shading.shade.get(code);
    zs += `<path class="hm-z ${z ? 'z' + z : 'q-z0'}${code === postcode ? ' sel' : ''}" data-pc="${esc(code)}" style="--i:${i++}" d="${ringsD(rings, F.P)}"><title>${esc(z ? shading.label(code) : code)}</title></path>`;
  }
  // the route day: yard, its stops, yard; how far along each stop falls, for its pulse
  let route = '', stops = '', leg = '';
  if (near && near.day && (near.carries || useRoute)) {
    const geo = near.day.stops.filter(c => Z[c]), way = [YARD, ...geo.map(c => Z[c]), YARD], line = [F.P(YARD)], ats = [];
    let run = 0;
    for (let n = 1; n < way.length; n++) { for (const xy of along(way[n - 1], way[n], F).slice(1)) { run += seg(line[line.length - 1], xy); line.push(xy); } if (n < way.length - 1) ats.push(run); }
    const id = maskId();
    route = maskFor(id, W, H, [line]) + `<g mask="url(#${id})">${routeLayer(0, line)}</g>`;
    stops = geo.map((c, n) => { const [x, y] = F.P(Z[c]); return `<circle class="hm-stop q-stop" style="--i:${n}" data-n="0" data-at="${(run ? ats[n] / run : 0).toFixed(4)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"/>`; }).join('');
  }
  let pin = '';
  if (pt) {
    const [x, y] = F.P(pt), r = RING_MILES * F.milePx, right = x > W - 130;
    const from = useRoute && near && near.carries ? Z[near.postcode] : YARD, ride = from !== YARD;
    if (from.join() !== pt.join()) { const d = along(from, pt, F).map((q, n) => `${n ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(''); leg = `<path class="q-leg ${ride ? 'detour' : 'solo'}" d="${d}"/>`; }
    pin = `<circle class="q-ring${moved ? ' go' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>
      ${leg}<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><g class="q-pin${moved ? ' drop' : ''}"><path d="M0 0C-9-12-9-24 0-24C9-24 9-12 0 0Z"/><circle cx="0" cy="-16" r="3.5"/></g></g>
      <text class="h2-maplab" x="${(right ? x - 12 : x + 12).toFixed(1)}" y="${(y - 26).toFixed(1)}" text-anchor="${right ? 'end' : 'start'}">${esc(postcode)}, ${Fmt.fixed(miles(YARD, pt), 1)} mi from the yard</text>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="hm-map mm q-map${moved ? ' moved' : ''}" role="img" aria-label="Chicago-area postcodes with the yard, the nearest route day and the place chosen">${landLayer(base, F)}<g>${zs}</g>${route}${stops}${pin}${yardMark(F)}${scaleBar(F)}</svg>`;
  const svg = el.querySelector('svg');
  const sel = svg.querySelector('.hm-z.sel'); if (sel) sel.parentNode.appendChild(sel);
  svg.addEventListener('click', e => { const z = e.target.closest && e.target.closest('.hm-z[data-pc]'); if (z) onPick(z.dataset.pc); });
  playMap(svg, { reveal: moved || first, fade: first });
  // the line from the stop draws itself once the pin has landed
  const l = svg.querySelector('.q-leg.detour');
  if (l && moved && !reduced()) {
    const len = l.getTotalLength();
    l.style.strokeDasharray = len; l.style.strokeDashoffset = len;
    requestAnimationFrame(() => requestAnimationFrame(() => { l.style.transition = 'stroke-dashoffset 600ms var(--ease-io) 350ms'; l.style.strokeDashoffset = 0; }));
  }
}
