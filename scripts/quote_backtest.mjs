// Back-test of a new quote's cost a visit (components/routecost.js nearbyCost), on 20 accounts that already exist, each
// treated as new: its own stops left out. Against its share of real route days by minutes plus plant from its own S5
// pounds. That comparison rests on the same time assumptions: nothing here is a measured cost, which was never captured.
//   node scripts/quote_backtest.mjs   (fixtures, no database)
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const ROOT = process.cwd(), req = createRequire(path.join(ROOT, 'x.js')), R = req('./model/rates');
const u = p => 'file:///' + path.join(ROOT, p).replace(/\\/g, '/');
const { routeCosts } = await import(u('public/components/routecost.js')), rm = await import(u('public/components/routemap.js'));
rm.setRoadnet(JSON.parse(fs.readFileSync('public/data/roadnet.json', 'utf8')));
const read = n => JSON.parse(fs.readFileSync(`fixtures/${n}.json`, 'utf8')).data, Z = JSON.parse(fs.readFileSync('public/data/zcta.json', 'utf8'));
const M = read('margin'), rc = routeCosts(R, read('routestops'), Z, read('deliverydays')); R.setRouteCosts(rc);
const S = R.SETTINGS, T = R.RATES, days = rc.dayList, acc = new Map();
for (const d of days) {
  const seen = new Map();
  for (const s of d.stops) { if (s.delivery || s.level1 == null) continue; const x = seen.get(s.level1) || { services: 0, stops: 0, cost: 0 }; x.services += s.services || 0; x.stops++; x.cost += s.cost; seen.set(s.level1, x); }
  for (const [id, x] of seen) { const a = acc.get(id) || { id, visits: 0, services: 0, stops: 0, cost: 0, pc: new Map() }; a.visits++; a.services += x.services; a.stops += x.stops; a.cost += x.cost; acc.set(id, a); }
  for (const s of d.stops) if (!s.delivery && acc.has(s.level1) && s.postcode) { const a = acc.get(s.level1); a.pc.set(s.postcode, (a.pc.get(s.postcode) || 0) + (s.services || 0)); }
}
const cands = [...acc.values()].filter(a => { const m = M.accounts.find(x => x.level1 === a.id); return m && m.bins > 0 && a.visits >= 12 && a.id !== 6714 && [...a.pc.keys()].some(p => Z[p]); }).sort((a, b) => b.visits - a.visits);
const step = cands.length / 20, picked = Array.from({ length: 20 }, (_, i) => cands[Math.floor(i * step)]);
const near = (id, pt, mi = 3) => { const t = { travel: 0, onsite: 0, stops: 0, services: 0 }; for (const d of days) for (const s of d.stops) { if (s.delivery || s.level1 === id || !s.pt || rm.miles(pt, s.pt) > mi) continue; t.travel += s.travel; t.onsite += s.onsite; t.stops++; t.services += s.services || 0; } return t; };
const rows = picked.map(a => {
  const main = [...a.pc.entries()].filter(([p]) => Z[p]).sort((x, y) => y[1] - x[1])[0][0], m = M.accounts.find(x => x.level1 === a.id), k = a.services / a.visits, n = near(a.id, Z[main]);
  const lbs = T.lbPerBin.v[m.main_bin] ?? T.lbPerBin.v.all, s5 = M.lines.filter(l => l.level1 === a.id && l.servcode === 'S5B').reduce((t, l) => t + l.units, 0);
  const per = n.onsite / (n.stops * S.stopMin + n.services * S.serviceMin), est = n.travel / n.stops + per * (S.stopMin + S.serviceMin * k) + lbs * k * T.shredPlant.v;
  const act = a.cost / a.visits + (s5 > 0 ? s5 : m.bins * lbs) * T.shredPlant.v / a.visits, rev = M.lines.filter(l => l.level1 === a.id && l.family === 'bin').reduce((t, l) => t + l.revenue, 0) / a.visits;
  return { name: m.customer, visits: a.visits, k, est, act, rev };
});
const total = rows.reduce((t, r) => t + r.est * r.visits, 0) / rows.reduce((t, r) => t + r.act * r.visits, 0) - 1, gaps = rows.map(r => Math.abs(r.est / r.act - 1)).sort((a, b) => a - b);
console.log('account | visits | bins a visit | est | comparison | gap');
for (const r of rows) console.log([r.name.slice(0, 32), r.visits, r.k.toFixed(1), r.est.toFixed(0), r.act.toFixed(0), ((r.est / r.act - 1) * 100).toFixed(0) + '%'].join(' | '));
console.log(`total ${(total * 100).toFixed(1)}%, median gap ${((gaps[9] + gaps[10]) * 50).toFixed(0)}%, within 15%: ${gaps.filter(g => g <= .15).length} of 20`);
if (Math.abs(total) > .15) process.exitCode = 1;
