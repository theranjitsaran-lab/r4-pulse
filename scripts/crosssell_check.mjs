// Cross-sell: three accounts' rows and drill-downs against the priced lines in the database and the sizing method, worked again
// here by hand. Read-only. Run on the PC with the database up:  node --no-warnings scripts/crosssell_check.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();
const pg = require('pg');
const M = JSON.parse(fs.readFileSync('fixtures/margin.json', 'utf8')).data;
const { buildWhitespace, LINES } = await import('../public/components/whitespace.js');
const { drillData } = await import('../public/components/crossdrill.js');
const { CROSS_SELL_DEPTH, CITADEL } = await import('../public/components/levers.js');
const { isInternal } = await import('../public/components/metrics.js');
const W = buildWhitespace(M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
const c = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
let bad = 0;
const say = (label, shown, source, tol = 1) => { const ok = Math.abs(shown - source) <= tol; if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} shown ${String(+shown.toFixed(2)).padStart(11)}  source ${String(+source.toFixed(2)).padStart(11)}`); };
const median = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const [{ f, t }] = (await c.query(`SELECT (max(month) - interval '11 months')::date::text AS f, (max(month) + interval '1 month')::date::text AS t FROM kpi.monthly`)).rows;
console.log(`The row's twelve months: ${f} up to ${t}`);
// each account's spend by line, from the fixture's own lines, for working the method again
const spend = new Map();
for (const a of M.accounts) { if (a.level1 === CITADEL) continue; spend.set(a.level1, { boxes: a.boxes || 0, storage: Math.max(0, a.storage_revenue || 0) }); }
for (const l of M.lines) { const s = spend.get(l.level1); if (s && LINES.some(x => x.key === l.family) && l.family !== 'storage') s[l.family] = (s[l.family] || 0) + l.revenue; }
const rawNames = ['CITY OF CHICAGO', 'CHICAGO PUBLIC SCHOOLS', 'ICU MEDICAL'];
for (const name of rawNames) {
  const r = W.rows.find(x => x.customer.toUpperCase().startsWith(name)), d = drillData(r);
  console.log(`\n${r.customer} (${r.level1}), ${r.kind}`);
  const q = await c.query(`SELECT sf.family, sum(p.totamt)::float AS revenue FROM (SELECT level1, servcodeid, totamt, wodate FROM priced_lines UNION ALL SELECT c.level1, c.servcodeid, c.totamt, c.wodate FROM priced_lines_current c WHERE NOT EXISTS (SELECT 1 FROM priced_lines p WHERE p.woid = c.woid AND p.servcodeid = c.servcodeid AND p.units = c.units AND p.totamt = c.totamt)) p
    JOIN servcode s USING (servcodeid) LEFT JOIN model.service_family sf ON sf.servcode = s.servcode WHERE p.level1 = $1 AND p.wodate >= $2 AND p.wodate < $3 GROUP BY 1`, [r.level1, f, t]);
  const src = Object.fromEntries(q.rows.map(x => [x.family, x.revenue]));
  for (const x of LINES.filter(x => x.key !== 'storage')) { say(`bought on the row: ${x.name}`, r.spend[x.key], Math.max(0, src[x.key] || 0), 50); }
  
  // the method, worked again from the fixture's lines
  for (const x of LINES) {
    const k = r.cells[x.key];
    if (k.have || !(k.opp > 0) || k.basisLevel !== 'book') continue;
    const all = [...spend.values()].map(s => { const tot = LINES.reduce((t2, y) => t2 + Math.max(0, s[y.key] || 0), 0); return { ...s, tot }; }).filter(s => s.tot > 0);
    if (x.by === 'boxes') {
      const ps = all.filter(s => (s[x.key] || 0) >= 250 && s.boxes >= 500), rate = median(ps.map(s => s[x.key] / s.boxes * 1000));
      say(`${x.name}: median per 1,000 boxes x its boxes`, k.opp, rate * r.boxes / 1000); say(`${x.name}: how many storers`, k.peerCount, ps.length, 0);
    } else {
      const other = r.total - r.spend[x.key], band = o => o < 25e3 ? 0 : o < 100e3 ? 1 : 2;
      const ps = all.filter(s => (s[x.key] || 0) >= 250 && s.tot - s[x.key] >= 250 && s[x.key] < .4 * s.tot), inBand = ps.filter(s => band(s.tot - s[x.key]) === band(other)), use = inBand.length >= 8 ? inBand : ps;
      say(`${x.name}: median ratio x its other spend`, k.opp, Math.min(median(use.map(s => s[x.key] / (s.tot - s[x.key]))) * other, r.total)); say(`${x.name}: how many accounts`, k.peerCount, use.length, 0);
    }
  }
  // the tiles
  say('Room to grow = Not bought yet + Low for its size', d.room, d.notBought + d.lowFor, 0);
  say('Not bought yet = the row\'s last column', d.notBought, r.opp, 0);
  say('Buys now = the six lines on the row', d.buys, LINES.reduce((t2, x) => t2 + r.spend[x.key], 0), 0);
  say('Low for its size = comparable less current', d.lowFor, LINES.reduce((t2, x) => t2 + (r.cells[x.key].low ? r.cells[x.key].expected - r.cells[x.key].spend : 0), 0), 0);
  console.log(`      room ${d.room.toFixed(0)}, ${(d.roomPct * 100).toFixed(1)}% of ${d.buys.toFixed(0)}; ${d.besides.toFixed(0)} of labour and other besides; confidence ${d.confWord}`);
}
// the book
const gaps = W.rows.flatMap(r => { const d = drillData(r); return d.top ? [d.conf] : []; });
console.log(`\nHow sure, by each account's biggest gap, ${gaps.length} accounts: high ${gaps.filter(x => x === 3).length}, medium ${gaps.filter(x => x === 2).length}, low ${gaps.filter(x => x === 1).length}`);
const clean = buildWhitespace({ ...M, accounts: M.accounts.filter(a => !isInternal(a.customer)) }, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
console.log(`Placeholder accounts: ${M.accounts.filter(a => isInternal(a.customer)).map(a => a.customer).join(', ')}`);
console.log(`Not-bought total with them ${W.total.toFixed(0)}, without ${clean.total.toFixed(0)}; ITAD whole-book comparables ${W.rows.flatMap(r => LINES.map(x => r.cells[x.key])).find(k => k.basisLevel === 'book' && k.peerCount === 19) ? 19 : '-'}`);
await c.end();
console.log(bad ? `\n${bad} did not tie` : '\nall tie');
process.exit(bad ? 1 : 0);
