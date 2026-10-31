// Reads a shapefile's lines and polygons and its attribute table directly, no library: what the map
// builders (build_basemap.js, build_roadnet.js) need from the US Census files, and nothing more.
'use strict';
const fs = require('fs');
const path = require('path');

// shapes: [{ bbox: { w, s, e, n }, rings: [[[lat, lon], ...], ...] }] in file order; null for other types
function readShp(file) {
  const buf = fs.readFileSync(file), out = [];
  let o = 100;
  while (o + 8 <= buf.length) {
    const len = buf.readInt32BE(o + 4) * 2, c = o + 8;
    const type = buf.readInt32LE(c);
    if (type === 3 || type === 5) {   // polyline, polygon
      const bbox = { w: buf.readDoubleLE(c + 4), s: buf.readDoubleLE(c + 12), e: buf.readDoubleLE(c + 20), n: buf.readDoubleLE(c + 28) };
      const nParts = buf.readInt32LE(c + 36), nPts = buf.readInt32LE(c + 40);
      const parts = []; for (let i = 0; i < nParts; i++) parts.push(buf.readInt32LE(c + 44 + i * 4));
      const p0 = c + 44 + nParts * 4, rings = [];
      for (let i = 0; i < nParts; i++) {
        const a = parts[i], b = i + 1 < nParts ? parts[i + 1] : nPts, ring = [];
        for (let j = a; j < b; j++) ring.push([buf.readDoubleLE(p0 + j * 16 + 8), buf.readDoubleLE(p0 + j * 16)]);
        rings.push(ring);
      }
      out.push({ bbox, rings });
    } else out.push(null);
    o = c + len;
  }
  return out;
}

// rows: [{ FIELD: 'text', ... }] in file order
function readDbf(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(4), headLen = buf.readUInt16LE(8), recLen = buf.readUInt16LE(10), fields = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) fields.push({ name: buf.toString('latin1', o, o + 11).replace(/\0.*$/, ''), len: buf[o + 16] });
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = headLen + i * recLen + 1; const r = {};
    for (const f of fields) { r[f.name] = buf.toString('latin1', o, o + f.len).trim(); o += f.len; }
    rows.push(r);
  }
  return rows;
}

const findExt = (dir, ext) => { const f = fs.readdirSync(dir).find(x => x.toLowerCase().endsWith(ext)); if (!f) throw new Error(`no ${ext} in ${dir}`); return path.join(dir, f); };

// Douglas-Peucker in degrees, then four decimals. A closed ring (first point equals last) has no
// baseline, so it is split at its farthest point and each half simplified.
function simplify(pts, tol) {
  if (pts.length < 3) return pts.map(([la, lo]) => [Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4]);
  const [fy, fx] = pts[0], [ly, lx] = pts[pts.length - 1];
  if (fy === ly && fx === lx) {
    let k = 1, best = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - fy, pts[i][1] - fx); if (d > best) { best = d; k = i; } }
    return simplify(pts.slice(0, k + 1), tol).concat(simplify(pts.slice(k), tol).slice(1));
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bi = -1;
    const [ay, ax] = pts[a], [by, bx] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][1] - ax) - dx * (pts[i][0] - ay)) / L; if (d > best) { best = d; bi = i; } }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]).map(([la, lo]) => [Math.round(la * 1e4) / 1e4, Math.round(lo * 1e4) / 1e4]);
}

// the region R4 drives: about 100 miles around the yard
const BOX = { s: 40.6, n: 43.4, w: -89.8, e: -85.9 };
const inBox = (lat, lon) => lat >= BOX.s && lat <= BOX.n && lon >= BOX.w && lon <= BOX.e;
const boxHits = b => !(b.n < BOX.s || b.s > BOX.n || b.e < BOX.w || b.w > BOX.e);

module.exports = { readShp, readDbf, findExt, simplify, BOX, inBox, boxHits };
