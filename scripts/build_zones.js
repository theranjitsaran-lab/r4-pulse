// Builds public/data/zones.json, the postcode districts Home's map shades, from a public US Census file. Download
// cb_2020_us_zcta520_500k.zip from www2.census.gov/geo/tiger/GENZ2020/shp/, unzip it, then:
//
//   node scripts/build_zones.js <folder> public/data/zones.json
//
// Kept: postcodes in the box Home's map can show. Coordinates to four decimals, lines simplified to about 100 m, which no
// map in the app is drawn finely enough to show. { postcode: [[[lat, lon], ...], ...] }
'use strict';
const fs = require('fs');
const path = require('path');
const { readShp, readDbf, findExt, simplify } = require('./shapefile');

const [dir, out] = process.argv.slice(2);
if (!out) { console.error('usage: node scripts/build_zones.js <folder> <out.json>'); process.exit(1); }
const keep = p => /^(60|61|46|53)\d{3}$/.test(p);
const BOX = { s: 41.0, n: 42.7, w: -89.0, e: -86.8 };
const inView = rings => rings.some(r => r.some(([la, lo]) => la >= BOX.s && la <= BOX.n && lo >= BOX.w && lo <= BOX.e));
const shapes = readShp(findExt(dir, '.shp')), attrs = readDbf(findExt(dir, '.dbf')), zones = {};
const r4 = v => Math.round(v * 1e4) / 1e4;
shapes.forEach((sh, i) => {
  const code = attrs[i].ZCTA5CE20 || attrs[i].GEOID20;
  if (!sh || !keep(code) || !inView(sh.rings)) return;
  const rings = sh.rings.map(r => simplify(r, 0.001).map(p => [r4(p[0]), r4(p[1])])).filter(r => r.length >= 4);
  if (rings.length) zones[code] = rings;
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(zones));
console.log(Object.keys(zones).length, 'postcodes,', fs.statSync(out).size, 'bytes; 60426 has', (zones['60426'] || []).length, 'ring(s)');
