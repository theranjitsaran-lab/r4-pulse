// Opportunities, phase 1: what is stored, how the moves split by confidence, and what VCK could confirm. Read-only.
//   node --no-warnings scripts/opps_check.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
require('dotenv').config();
const pg = require('pg');
const J = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data;
const D = { C: J('customers'), PR: J('pricing'), CA: J('calls'), M: J('margin') };
const { opportunities, byAccount, KINDS } = await import('../public/components/opps.js');
const { buildWhitespace } = await import('../public/components/whitespace.js');
const money = v => '$' + Math.round(v).toLocaleString('en-US');
const O = opportunities(D, {}), A = byAccount(O.rows);
console.log(`moves ${O.rows.length}; accounts ${A.accounts}; each account's largest ${money(A.largest)} a year; one-off ${money(A.once)}`);

// how each cross-sell move was sized
const W = buildWhitespace(D.M, { exclude: [6714], top: 120 }), cell = new Map();
for (const r of W.rows) for (const [line, c] of Object.entries(r.cells)) cell.set(`cross:${r.level1}:${line}`, c);
const level = r => { if (r.kind !== 'cross') return r.kind === 'round' ? 'typical rise on its own billing' : 'own billing or book median'; const c = cell.get(r.key) || {}; return c.basisLevel === 'similar' ? 'same kind, similar size' : c.basisLevel === 'kind' ? 'same kind, any size' : 'whole book'; };
const tab = {};
for (const r of O.rows) { const k = level(r), t = tab[k] || (tab[k] = { n: 0, year: 0, once: 0, kinds: {}, accts: new Set() }); t.n++; t.accts.add(r.level1); if (r.once) t.once += r.value; else t.year += r.value; t.kinds[r.kind] = (t.kinds[r.kind] || 0) + 1; }
console.log('\nmoves by how they were sized:');
for (const [k, t] of Object.entries(tab)) console.log(`  ${k.padEnd(32)} ${String(t.n).padStart(4)} moves, ${String(t.accts.size).padStart(3)} accounts, ${money(t.year).padStart(11)} a year, ${money(t.once).padStart(11)} once | ${Object.entries(t.kinds).map(([a, b]) => `${a} ${b}`).join(', ')}`);
const peers = O.rows.filter(r => r.kind === 'cross').map(r => (cell.get(r.key) || {}));
const counts = b => { const p = peers.filter(c => c.basisLevel === b).map(c => c.peerCount).sort((x, y) => x - y); return p.length ? `${p.length} moves, ${p[0]} to ${p[p.length - 1]} accounts, median ${p[p.length >> 1]}` : 'none'; };
console.log('  peer counts: similar:', counts('similar'), '| any size:', counts('kind'), '| whole book:', counts('book'));
// by each account's best move, which is what the table shows
const best = {}; for (const a of A.rows) { const m = a.items.filter(x => !x.once).sort((x, y) => y.value - x.value)[0] || a.items[0], k = level(m); best[k] = (best[k] || 0) + 1; }
console.log('  accounts by best move:', JSON.stringify(best));
const kindsBest = {}; for (const a of A.rows) { const m = a.items.filter(x => !x.once).sort((x, y) => y.value - x.value)[0]; if (!m) continue; const t = kindsBest[m.kind] || (kindsBest[m.kind] = { n: 0, v: 0 }); t.n++; t.v += m.value; }
console.log('  best move by kind:', Object.entries(kindsBest).map(([k, t]) => `${KINDS[k]} ${t.n}, ${money(t.v)}`).join('; '));

const c = new pg.Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
await c.connect();
const q = async (s, a) => (await c.query(s, a)).rows;
console.log('\napp.opportunity columns:', (await q(`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'opportunity' ORDER BY ordinal_position`)).map(x => `${x.column_name} ${x.data_type}`).join(', ') || 'NO TABLE');
console.log('rows:', JSON.stringify(await q(`SELECT count(*)::int n, count(DISTINCT key)::int keys, count(owner)::int with_owner, max(at)::text last FROM app.opportunity`).catch(e => e.message)));
console.log('app role can write:', JSON.stringify(await q(`SELECT current_user, has_table_privilege(current_user, 'app.opportunity', 'INSERT') AS can_insert, has_table_privilege(current_user, 'app.opportunity', 'SELECT') AS can_read`).catch(e => e.message)));
console.log('indexes:', (await q(`SELECT indexname FROM pg_indexes WHERE schemaname = 'app' AND tablename = 'opportunity'`)).map(x => x.indexname).join(', '));
// what VCK shows that could confirm a win
const lb = await q(`SELECT (max(month) - interval '11 months')::date::text AS f, max(month)::text AS last FROM kpi.monthly`);
console.log('\nkpi window', JSON.stringify(lb[0]));
console.log('price: storage_rates changes in 12 months:', JSON.stringify(await q(`SELECT column_name FROM information_schema.columns WHERE table_name = 'storage_rates' ORDER BY ordinal_position LIMIT 12`).then(r => r.map(x => x.column_name))));
const first = D.M.history && D.M.history.firsts ? D.M.history.firsts.length : 0; console.log('cross: margin.history firsts', first, 'rows, an account and line with its first date');
const R3 = await q(`SELECT to_char(p.wodate, 'YYYY-MM') m, count(DISTINCT p.level1)::int accounts, sum(p.units)::int units, round(sum(p.totamt))::int rev FROM priced_lines p JOIN servcode s USING (servcodeid) WHERE s.servcode = 'R3' AND p.wodate >= '2026-07-01' GROUP BY 1 ORDER BY 1`);
console.log('overdue: destruction (R3) lines by month:', R3.map(x => `${x.m} ${x.accounts} accts ${x.units}u ${money(x.rev)}`).join('; '));
const rate = await q(`WITH m AS (SELECT p.level1, p.servcodeid, to_char(p.wodate, 'YYYY-MM') mm, round(sum(p.totamt) / NULLIF(sum(p.units), 0), 2) r FROM priced_lines p WHERE p.units > 0 AND p.wodate >= '2026-01-01' GROUP BY 1, 2, 3) SELECT count(*)::int pairs, count(*) FILTER (WHERE lo <> hi)::int moved FROM (SELECT level1, servcodeid, min(r) lo, max(r) hi FROM m GROUP BY 1, 2) x`);
console.log('price: account and code pairs with a unit price in 2026, and how many moved:', JSON.stringify(rate[0]));
await c.end();
process.exit(0);
