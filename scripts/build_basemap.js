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

const { readShp, readDbf, findExt, simplify, inBox, boxHits } = require('./shapefile');

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
