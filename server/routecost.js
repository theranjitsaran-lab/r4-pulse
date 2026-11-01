// The route days costed once on the server (components/routecost.js, the same function the tests
// check), kept until the data moves, and handed to model/rates.js so every bin cost on every screen,
// in Ask and in the emails comes from the account's real route days.
//   Live: the routestops query, twelve months of route-day stops.
//   Offline: fixtures/routestops.json when the snapshot has it, else the drill's routes (the whole
//   route on each of the 50 largest accounts' days) and the route orders (about three weeks).
'use strict';
const fs = require('fs');
const path = require('path');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');
const R = require('../model/rates');

const ROOT = path.join(__dirname, '..');
let libs = null, memo = { key: null, rc: null, p: null };
const load = () => libs || (libs = Promise.all([import('../public/components/routemap.js'), import('../public/components/routecost.js')]).then(([rm, rc]) => {
  try { rm.setRoadnet(JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'roadnet.json'), 'utf8'))); } catch (e) { console.warn('routecost: no road network, straight lines', e.message); }
  return { rm, rc };
}));

const readJson = f => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;

// offline rows: the snapshot's own query when present, else the drill's routes and the route orders
function offlineRows() {
  const own = readJson(path.join(ROOT, 'fixtures', 'routestops.json'));
  if (own && own.data && own.data.length) return { rows: own.data, source: 'routestops' };
  const rows = [], seen = new Set();
  const drill = readJson(path.join(ROOT, 'fixtures', 'drill.json'));
  for (const a of Object.values((drill && drill.data) || {}).flat()) for (const r of a.routes || []) {
    const k = r.date + '|' + r.route + '|' + r.stop;
    if (!seen.has(k)) { seen.add(k); rows.push(r); }
  }
  const days = new Set(rows.map(r => r.date + '|' + r.route));
  const act = readJson(path.join(ROOT, 'fixtures', 'activity.json'));
  for (const o of ((act && act.data && act.data.orders) || [])) {
    if (!o.done || !o.route || days.has(o.date + '|' + o.route)) continue;
    rows.push({ date: o.date, route: o.route, stop: o.stop, seq: o.seq, level1: o.level1, company: o.company, postcode: o.postcode, services: 1, pounds: o.weight || 0 });
  }
  return { rows, source: 'drill and route orders' };
}

// offline delivery days: the drill's work orders carrying a delivery (code 01) for the 50 largest
// accounts, with each account's usual postcode from its route stops
function offlineDeliveries() {
  const own = readJson(path.join(ROOT, 'fixtures', 'deliverydays.json'));
  if (own && own.data && own.data.length) return own.data;
  const drill = readJson(path.join(ROOT, 'fixtures', 'drill.json'));
  const out = [];
  for (const a of Object.values((drill && drill.data) || {}).flat()) {
    const pcs = {}; for (const r of a.routes || []) if (r.level1 === a.level1 && r.postcode) pcs[r.postcode] = (pcs[r.postcode] || 0) + 1;
    const postcode = Object.entries(pcs).sort((x, y) => y[1] - x[1]).map(x => x[0])[0] || null;
    const by = {};
    for (const o of a.orders || []) { const t = o.items.filter(i => i.code === '01').reduce((s, i) => s + (i.units || 0), 0); if (t > 0) { const x = by[o.date] || (by[o.date] = { date: o.date, level1: a.level1, orders: 0, trips: 0, postcode }); x.orders++; x.trips += t; } }
    out.push(...Object.values(by));
  }
  return out;
}

// rc for the current settings and data; key: the data's stamp and the three time assumptions
async function routeCosts(stampKey) {
  const key = `${stampKey}|${JSON.stringify(R.SETTINGS)}`;
  if (memo.key === key && memo.rc) return memo.rc;
  if (memo.key === key && memo.p) return memo.p;
  memo = { key, rc: null, p: (async () => {
    const { rc } = await load();
    const Z = readJson(path.join(ROOT, 'public', 'data', 'zcta.json')) || {};
    const { rows, source } = USE_FIXTURES ? offlineRows() : { rows: await cached('routestops', queries.routestops).catch(() => []), source: 'routestops' };
    const deliveries = USE_FIXTURES ? offlineDeliveries() : await cached('deliverydays', queries.deliverydays).catch(() => []);
    const t = Date.now();
    const out = Object.assign(rc.routeCosts(R, rows || [], Z, deliveries || []), { source });
    console.log(`routecost: ${out.days} route days, ${Object.keys(out.accounts).length} accounts in ${Date.now() - t} ms (${source})`);
    R.setRouteCosts(out);
    memo.rc = out;
    return out;
  })() };
  return memo.p;
}

module.exports = { routeCosts };
