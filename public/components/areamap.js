// The Chicagoland map Home and Routes draw on: a projection fitted to the points that matter, the
// county outline and interstates under them (public/data/basemap.json, US Census), the yard as a
// square. Straight lines only: GPS was never captured (data rule 8). SVG strings; no DOM.
import { YARD } from './routemap.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// a frame on the yard and the middle nine-tenths of the points, so one far stop never shrinks the city
export function areaFrame(pts, W, H, { pad = 18, trim = .04 } = {}) {
  const lat = pts.map(p => p[0]).sort((a, b) => a - b), lon = pts.map(p => p[1]).sort((a, b) => a - b);
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
  const box = [Math.min(q(lat, trim), YARD[0]), Math.max(q(lat, 1 - trim), YARD[0]), Math.min(q(lon, trim), YARD[1]), Math.max(q(lon, 1 - trim), YARD[1])];
  const k = Math.cos((box[0] + box[1]) / 2 * Math.PI / 180);
  const s = Math.min((W - pad * 2) / ((box[3] - box[2]) * k || 1), (H - pad * 2) / (box[1] - box[0] || 1));
  const cx = (box[2] + box[3]) / 2, cy = (box[0] + box[1]) / 2;
  const P = ([la, lo]) => [W / 2 + (lo - cx) * k * s, H / 2 - (la - cy) * s];
  const inside = ([x, y], m = 10) => x > -m && x < W + m && y > -m && y < H + m;
  return { P, W, H, inside, milePx: s / 69 };
}

// land and roads, points closer than a pixel dropped
export function landLayer(base, F) {
  if (!base) return '';
  const path = (ring, close) => { let out = '', last = null; for (const p of ring) { const [x, y] = F.P(p); if (last && Math.abs(x - last[0]) < 1.2 && Math.abs(y - last[1]) < 1.2) continue; out += (out ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); last = [x, y]; } return out + (close ? 'Z' : ''); };
  return `<path class="h2-land" d="${(base.land || []).map(r => path(r, true)).join('')}"/><path class="h2-road" d="${(base.roads || []).map(r => path(r.l || r, false)).join('')}"/>`;
}

export function yardMark(F) {
  const [x, y] = F.P(YARD);
  return `<rect class="h2-yard" x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2"/><text class="h2-maplab" x="${x + 10}" y="${y + 4}">Yard</text>`;
}

// every postcode R4 visits, sized by visits a year; one-customer postcodes as rings
export function postcodeLayer(points, F) {
  const maxV = Math.max(...points.map(p => p.visits || 0), 1), rad = v => 2 + 9 * Math.sqrt((v || 0) / maxV);
  return points.slice().sort((a, b) => b.visits - a.visits).map(p => {
    const [x, y] = F.P(p.pt); if (!F.inside([x, y])) return '';
    return `<circle class="h2-pt${p.customers === 1 ? ' single' : ''}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad(p.visits).toFixed(1)}"><title>${esc(p.postcode)}: ${p.visits} visits, ${p.customers} customer${p.customers === 1 ? '' : 's'}</title></circle>`;
  }).join('');
}

export function scaleBar(F) {
  const bar = F.milePx * 10 < F.W / 3 ? 10 : 5;
  return `<g transform="translate(${F.W - 18 - bar * F.milePx},${F.H - 12})"><line class="rm-scale" x1="0" x2="${(bar * F.milePx).toFixed(1)}" y1="0" y2="0"/><text class="h2-maplab" x="${(bar * F.milePx / 2).toFixed(1)}" y="-5" text-anchor="middle">${bar} miles</text></g>`;
}
