// Builds public/data/basemap.json, the quiet outline of Chicagoland under every map (components/routemap.js
// baseLayer), from three public US Census files. Download them, unzip each into a folder, then:
//
//   node scripts/build_basemap.js <counties folder> <roads folder> <places .txt> public/data/basemap.json
//
//   counties  cb_2023_us_county_500k.zip       county outlines, cut at the shoreline: land, the lake by absence
//   roads     tl_2023_us_primaryroads.zip      the interstates (route type I)
//   places    2023_Gaz_place_national.zip      town names and their centres; the largest by land area named first
//
// Kept: the region R4 drives, about 100 miles around the yard. Coordinates to four decimals (about 10 m),
// lines simplified to about 150 m, which no map in the app is drawn finely enough to show.
'use strict';
const fs = require('fs');
const path = require('path');

const BOX = { s: 40.6, n: 43.4, w: -89.8, e: -85.9 };
const inBox = (lat, lon) => lat >= BOX.s && lat <= BOX.n && lon >= BOX.w && lon <= BOX.e;
const boxHits = (b) => !(b.n < BOX.s || b.s > BOX.n || b.e < BOX.w || b.w > BOX.e);

// ── a shapefile's shapes and its attribute table, read directly (no library) ──
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
        for (let j = a; j < b; j++) ring.push([buf.readDoubleLE(p0 + j * 16 + 8), buf.readDoubleLE(p0 + j * 16)]);   // [lat, lon]
        rings.push(ring);
      }
      out.push({ bbox, rings });
    } else out.push(null);
    o = c + len;
  }
  return out;
}
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

// ── simplification: Douglas-Peucker in degrees, then four decimals. A closed ring (first point equals
// last) has no baseline, so it is split at its farthest point and each half simplified. ──
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
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

function main() {
  const [countyDir, roadDir, placesTxt, out] = process.argv.slice(2);
  if (!out) { console.error('usage: node scripts/build_basemap.js <counties folder> <roads folder> <places .txt> <out.json>'); process.exit(1); }

  // land: every county in the box, each ring its own polygon; the lake is what is left uncovered
  const land = [];
  for (const sh of readShp(findExt(countyDir, '.shp'))) {
    if (!sh || !boxHits(sh.bbox)) continue;
    for (const r of sh.rings) { const s = simplify(r, 0.0015); if (s.length >= 4) land.push(s); }
  }

  // roads: the interstates, cut to the box (a line leaving it ends there)
  const roads = [], attrs = readDbf(findExt(roadDir, '.dbf')), shapes = readShp(findExt(roadDir, '.shp'));
  shapes.forEach((sh, i) => {
    if (!sh || attrs[i].RTTYP !== 'I' || !boxHits(sh.bbox)) return;
    for (const r of sh.rings) {
      let run = [];
      for (const p of r) { if (inBox(p[0], p[1])) run.push(p); else { if (run.length > 1) roads.push(run); run = []; } }
      if (run.length > 1) roads.push(run);
    }
  });
  const roadLines = roads.map(r => simplify(r, 0.002)).filter(r => r.length > 1);

  // places: active towns of four square miles or more, largest first, "city"/"village" dropped from the name
  const rows = fs.readFileSync(placesTxt, 'utf8').split(/\r?\n/), head = rows[0].split('\t').map(s => s.trim());
  const col = k => head.indexOf(k);
  const places = rows.slice(1).map(l => l.split('\t').map(s => s.trim())).filter(c => c.length > 5)
    .map(c => ({ st: c[col('USPS')], name: c[col('NAME')], f: c[col('FUNCSTAT')], sq: +c[col('ALAND_SQMI')], lat: +c[col('INTPTLAT')], lon: +c[col('INTPTLONG')] }))
    .filter(p => ['IL', 'IN', 'WI'].includes(p.st) && p.f === 'A' && p.sq >= 4 && inBox(p.lat, p.lon))
    .sort((a, b) => b.sq - a.sq)
    .map(p => [p.name.replace(/ (city|village|town|CDP)$/i, ''), Math.round(p.lat * 1e4) / 1e4, Math.round(p.lon * 1e4) / 1e4]);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ source: 'US Census 2023: cartographic county boundaries (500k), TIGER/Line primary roads, Gazetteer places', land, roads: roadLines, places }));
  const pts = land.reduce((t, r) => t + r.length, 0) + roadLines.reduce((t, r) => t + r.length, 0);
  console.log(`${land.length} land rings, ${roadLines.length} interstate lines, ${places.length} places, ${pts.toLocaleString('en-US')} points, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
main();
