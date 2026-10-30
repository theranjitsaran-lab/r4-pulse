// Rebuilds public/data/zcta.json, the postcode centres Routes and the route maps use, from the US
// Census 2020 ZCTA Gazetteer (public): download 2020_Gaz_zcta_national.zip from census.gov, unzip it,
// then:  node scripts/build_zcta.js <path to 2020_Gaz_zcta_national.txt> public/data/zcta.json
// Keeps Illinois, Indiana and Wisconsin. O'Hare (60666) and Northwestern (60208) are single-site
// postcodes with no Census area, so stops there stay off the map rather than placed by guess.
'use strict';
const fs = require('fs');
const [src, out] = process.argv.slice(2);
const keep = p => { const n = +p.slice(0, 3); return (n >= 600 && n <= 629) || (n >= 460 && n <= 479) || (n >= 530 && n <= 549); };
const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/);
const head = lines[0].split('\t').map(s => s.trim());
const iz = head.indexOf('GEOID'), ila = head.indexOf('INTPTLAT'), ilo = head.indexOf('INTPTLONG');
if (iz < 0 || ila < 0 || ilo < 0) throw new Error('unexpected header: ' + head.join(','));
const Z = {};
for (const l of lines.slice(1)) {
  const c = l.split('\t').map(s => s.trim());
  if (!/^\d{5}$/.test(c[iz] || '') || !keep(c[iz])) continue;
  const lat = +c[ila], lon = +c[ilo];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  Z[c[iz]] = [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4];
}
fs.mkdirSync(require('path').dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(Z));
console.log(Object.keys(Z).length, 'postcodes,', fs.statSync(out).size, 'bytes; 60606 =', JSON.stringify(Z['60606']), '; 60609 =', JSON.stringify(Z['60609']));
