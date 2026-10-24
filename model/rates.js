// R4 Pulse — the cost model. The single source of truth.
// Pricing and Margin both import this. There is no second formula and no cost
// number anywhere else in the repo. Every rate carries its derivation and a
// confidence flag, because both are shown to users.
//
// Works in Node (CommonJS) and in the browser (served as /model/rates.js and
// loaded as a classic script that sets window.R4RATES).
'use strict';

const m0 = n => '$' + Math.round(n).toLocaleString('en-US');
const m2 = n => '$' + n.toFixed(2);
const m3 = n => '$' + n.toFixed(3);
const m4 = n => '$' + n.toFixed(4);
const n0 = n => Math.round(n).toLocaleString('en-US');
const pct = n => Math.round(n * 100) + '%';

// The model's inputs: GL pools over their period, the share of each pool that feeds each rate,
// and the volumes the rates divide by. This is the seed of model.gl_pool, model.pool_split and
// model.driver_volume (sql/model_schema.sql). loadFromDb() replaces it with the database rows;
// without a database these same figures stand, so both paths derive identical rates.
const MODEL = {
  gl: { months: 17.1, from: '1 January 2025', to: '4 June 2026' },
  volumesPeriod: 'September 2025 to August 2026',
  pools: {
    facilities:          { amount: 1930871.65, accounts: '7028 Bldg Exp and 7335660 Maintenance payroll' },
    warehouse_perm:      { amount: 651400.61,  accounts: '7335600 Warehouse payroll' },
    warehouse_temp:      { amount: 383031.43,  accounts: '7385 Anchor and Banner temporary labour' },
    warehouse_supplies:  { amount: 154999.36,  accounts: '7435 Warehouse Supplies' },
    warehouse_equipment: { amount: 86576.09,   accounts: '7095 Equipment less Allegheny' },
    shred_maintenance:   { amount: 32500.00,   accounts: '7098 Allegheny shredder maintenance' },
    shred_payroll:       { amount: 13945.79,   accounts: '7335650 Shredding payroll' },
    drivers:             { amount: 510097.77,  accounts: '7335700 Drivers payroll' },
    vehicles:            { amount: 226484.77,  accounts: '7011 Auto' },
    route_software:      { amount: 69426.04,   accounts: '7064 Routeware' },
    uniforms:            { amount: 85799.43,   accounts: '7410 Uniforms' },
  },
  // [pool, rate it feeds, share]
  splits: [
    ['facilities', 'facilities', 1],
    ['warehouse_perm', 'handling', 0.4], ['warehouse_perm', 'shred_plant', 0.6],
    ['warehouse_temp', 'handling', 0.4], ['warehouse_temp', 'shred_plant', 0.6],
    ['warehouse_supplies', 'handling', 1], ['warehouse_equipment', 'handling', 1],
    ['shred_maintenance', 'shred_plant', 1], ['shred_payroll', 'shred_plant', 1],
    ['drivers', 'route_day', 1], ['vehicles', 'route_day', 1], ['route_software', 'route_day', 1],
    ['uniforms', 'route_day', 0.5], ['uniforms', 'handling', 0.5],
  ],
  volumes: {
    route_days: 1322,     // route-days with a done service
    boxes:      1135790,  // mean monthly box count
    movements:  65065,    // retrieval, pull and return boxes 51,612 + delivery boxes 13,453
    // Plant pounds, all from VCK priced lines so each account's charge and the rate's total are
    // the same pounds. S5 reconciles to Veri-Shred within 0.3% where both exist.
    pounds_s3:      836376,   // S3 certified shredding, billed per lb
    pounds_s5:      2132048,  // S5 weight recorded on bin, purge and shred-truck work
    shred_boxes:    12453,    // R3 12,383 + R5 1 + SC 69 (a cubic foot counted as a box): no weight
    lb_per_box:     28.4,     // S5 lb ÷ boxes on the 256 work orders carrying both
    bins_unweighed: 114,      // bin services on the 16 accounts with no S5 weight
    visits:     4329,     // customer-days: date × route × customer with a done service
    services:   25102,    // done services; completion confirmed on 54% of services
  },
};

const PROVISIONAL = `provisional — GL annualised from ${MODEL.gl.months} months, restate when the monthly P&L to Aug 2026 arrives`;

// Rates not built from a pool. They keep their own source.
const FIXED = {
  driverHr:   { v: 32.49, u: '$ per hour', c: 'measured',
    d: 'ADP payroll, drivers, loaded with employer liability. No hours volume in the database; not pool-derived' },
  centreHr:   { v: 25.05, u: '$ per hour', c: 'measured',
    d: 'ADP payroll, Service Centre, loaded. No hours volume in the database; not pool-derived' },
  avgMiles:   { v: 11.4,  u: 'miles from the yard', c: 'observed',
    d: 'volume-weighted mean distance to 150 postcode centroids' },
  // Used only where an account has no S5 weight of its own. S5 lb ÷ bin services on work orders
  // carrying S5 and a single bin code, September 2025 to August 2026.
  lbPerBin:   { v: { B2: 219.3, B3: 34.9, B4: 121.7, B6: 15.7, all: 74.5 }, u: 'lb per bin service', c: 'estimate',
    d: 'S5 recorded weight ÷ bin services on single-code work orders, September 2025 to August 2026: 95-gallon (B2) 219.3 lb, 65-gallon (B4) 121.7, executive (B3) 34.9, under-desk (B6) 15.7; 74.5 across all four. Used only where an account has no S5 weight' },
  lbPerItad:  { v: 1.5,   u: 'lb per ITAD unit', c: 'estimate',
    d: 'a drive or media unit; media destruction is not weighed, so the paper rate stands in' },
};

const RATES = {};

// Every pool-based rate: Σ(pool × share) annualised, ÷ its volume. The derivation strings state
// the arithmetic, because users read them.
function derive(model) {
  const k = 12 / model.gl.months;
  const pool = (rate) => model.splits.filter(s => s[1] === rate)
    .reduce((t, [p, , share]) => t + model.pools[p].amount * share * k, 0);
  const parts = (rate) => model.splits.filter(s => s[1] === rate)
    .map(([p, , share]) => (share < 1 ? `${pct(share)} of ` : '') + model.pools[p].accounts).join(', ');
  const v = model.volumes;
  const per = `annualised × 12 ÷ ${model.gl.months} from the GL ${model.gl.from} to ${model.gl.to}; volumes ${model.volumesPeriod}`;

  const fac = pool('facilities'), hnd = pool('handling'), shr = pool('shred_plant'), rd = pool('route_day');
  const lbBoxes = v.shred_boxes * v.lb_per_box, lbBins = v.bins_unweighed * FIXED.lbPerBin.v.all;
  const lb = v.pounds_s3 + v.pounds_s5 + lbBoxes + lbBins;
  for (const key of Object.keys(RATES)) delete RATES[key];
  Object.assign(RATES, {
    facilities: { v: fac / (v.boxes * 12), u: '$ per box per month', c: 'provisional', n: PROVISIONAL,
      d: `${parts('facilities')}: ${m0(fac)} a year ÷ (${n0(v.boxes)} boxes × 12 months) = ${m4(fac / (v.boxes * 12))}; ${per}` },
    handling:   { v: hnd / v.movements, u: '$ per box movement', c: 'provisional', n: PROVISIONAL,
      d: `${parts('handling')}: ${m0(hnd)} a year ÷ ${n0(v.movements)} box movements = ${m2(hnd / v.movements)}. Movements are retrieval, pull and return boxes plus delivery boxes, all handled in the warehouse; ${per}` },
    shredPlant: { v: shr / lb, u: '$ per lb', c: 'provisional', n: PROVISIONAL,
      d: `${parts('shred_plant')}: ${m0(shr)} a year ÷ ${n0(lb)} lb = ${m4(shr / lb)}. The pounds are S3 weighed shredding ${n0(v.pounds_s3)} + S5 recorded weight ${n0(v.pounds_s5)} + ${n0(v.shred_boxes)} unweighed shred boxes at ${v.lb_per_box} lb (${n0(lbBoxes)}) + ${n0(v.bins_unweighed)} unweighed bins at ${FIXED.lbPerBin.v.all} lb (${n0(lbBins)}). S5 agrees with Veri-Shred within 0.3% where both exist; 19% of it has no Veri-Shred weight (shred truck, one-offs). Shred-truck pounds count as plant pounds until confirmed otherwise; ${per}` },
    lbPerBox:   { v: v.lb_per_box, u: 'lb per shred box', c: 'estimate',
      d: `S5 recorded weight ÷ boxes on the 256 work orders carrying both S5 and R3/R4/R5 box counts (median 28.3), ${model.volumesPeriod}. Applied to shred boxes billed with no weight` },
    routeDay:   { v: rd / v.route_days, u: '$ per route day', c: 'provisional', n: PROVISIONAL,
      d: `${parts('route_day')}: ${m0(rd)} a year ÷ ${n0(v.route_days)} route days = ${m2(rd / v.route_days)}; ${per}` },
    visitsDay:  { v: v.visits / v.route_days, u: 'customer visits per route day', c: 'observed',
      d: `${n0(v.visits)} customer visits ÷ ${n0(v.route_days)} route days = ${(v.visits / v.route_days).toFixed(2)}, ${model.volumesPeriod}, Veri-Shred service orders. A visit is one customer on one route on one day` },
    unitsVisit: { v: v.services / v.visits, u: 'services per customer visit', c: 'observed',
      d: `${n0(v.services)} done services ÷ ${n0(v.visits)} customer visits = ${(v.services / v.visits).toFixed(2)}, ${model.volumesPeriod}, Veri-Shred service orders` },
  }, FIXED);
  UNITS_PER_VISIT.bin = UNITS_PER_VISIT.movement = RATES.unitsVisit.v;
  return RATES;
}

/**
 * loadFromDb(query) — replace the seed with model.gl_pool, model.pool_split and
 * model.driver_volume, then re-derive. query(sql) returns rows. Node only; call at startup.
 */
async function loadFromDb(query) {
  const pools = await query('SELECT pool, amount, months, period_from::text AS period_from, period_to::text AS period_to, gl_accounts FROM model.gl_pool WHERE allocated');
  const splits = await query('SELECT pool, family, share FROM model.pool_split');
  const vols = await query('SELECT driver, value FROM model.driver_volume');
  const overrides = await query('SELECT rate FROM model.rate_override');
  if (overrides.length) console.warn(`model.rate_override has ${overrides.length} row(s); ignored — every rate is pool ÷ volume`);
  if (!pools.length || !splits.length || !vols.length) throw new Error('model schema is empty — run sql/model_schema.sql');
  const months = new Set(pools.map(p => Number(p.months)));
  if (months.size !== 1) throw new Error('model.gl_pool rows cover different periods; restate them to one before deriving');
  const fmt = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const model = {
    gl: { months: [...months][0], from: fmt(pools[0].period_from), to: fmt(pools[0].period_to) },
    volumesPeriod: MODEL.volumesPeriod,
    pools: Object.fromEntries(pools.map(p => [p.pool, {
      amount: Number(p.amount),
      accounts: (MODEL.pools[p.pool] && MODEL.pools[p.pool].accounts) || p.gl_accounts.join(', '),
    }])),
    splits: splits.map(s => [s.pool, s.family, Number(s.share)]),
    volumes: Object.fromEntries(vols.map(v => [v.driver, Number(v.value)])),
  };
  derive(model);
  return model;
}

// The one assumption: the share of a route day spent travelling rather than on site.
// GPS, arrival times and durations were never captured. Exposed as a slider in the UI.
const SETTINGS = { split: 0.40 };

const FAMILIES = ['storage', 'handling', 'movement', 'bin', 'itad', 'shred', 'labour'];

// how many units one site visit covers, by family. 0 = no route time at all.
// bin and movement are set from the observed services per stop by derive().
const UNITS_PER_VISIT = { bin: 0, movement: 0, itad: 4000, storage: 0, handling: 0, shred: 0, labour: 0 };

derive(MODEL);

function travelPerVisit(miles) {
  const mi = miles || RATES.avgMiles.v;
  return (RATES.routeDay.v * SETTINGS.split / RATES.visitsDay.v) * (mi / RATES.avgMiles.v);
}
function onSitePerVisit() {
  return (RATES.routeDay.v * (1 - SETTINGS.split)) / RATES.visitsDay.v;
}

/**
 * costToServe(family, units, opts)
 *   family  one of FAMILIES
 *   units   boxes (storage), movements (handling, movement), bin services, ITAD units,
 *           pounds or shred boxes (shred), hours
 *   opts    { visits, miles, isCentre,
 *             pounds   bin: the account's S5 recorded pounds; without it, bins × lb per bin
 *             binCode  bin: B2, B3, B4 or B6 for the lb-per-bin estimate when there is no S5
 *             unit     shred: 'box' for shred boxes billed with no weight (R3, R4, R5, SC) }
 * returns { lines: [[name, amount, derivation]], total, perUnit, visits }
 */
function costToServe(family, units, opts) {
  if (!FAMILIES.includes(family)) throw new Error(`unknown family: ${family}`);
  const o = Object.assign({ visits: null, miles: RATES.avgMiles.v, isCentre: false, pounds: null, binCode: null, unit: 'lb' }, opts || {});
  units = Math.max(0, Number(units) || 0);
  const upv = UNITS_PER_VISIT[family];
  const visits = (o.visits != null && o.visits > 0) ? Number(o.visits)
               : (upv > 0 ? Math.max(1, Math.ceil(units / upv)) : 0);

  const lines = [];
  let total = 0;
  // a fourth element marks a line resting on an estimate, for the ◇ mark
  const add = (name, amount, why, flag) => { lines.push(flag ? [name, amount, why, flag] : [name, amount, why]); total += amount; };
  const tpv = travelPerVisit(o.miles), opv = onSitePerVisit();
  const routeLines = (what) => {
    add(family === 'itad' ? 'Truck time' : 'Travel to site', visits * tpv,
      `${visits} ${what} at ${m2(tpv)}. A ${m0(RATES.routeDay.v)} route day is ${pct(SETTINGS.split)} travel, spread across ${RATES.visitsDay.v} visits, scaled for ${o.miles} miles.`);
    add('Time on site', visits * opv,
      `${visits} ${what} at ${m2(opv)} — the other ${pct(1 - SETTINGS.split)} of the route day, covering about ${Math.round(units / Math.max(visits, 1))} units each.`);
  };

  switch (family) {
    case 'storage':
      add('Warehouse space', units * RATES.facilities.v * 12,
        `${units.toLocaleString('en-US')} boxes at ${m3(RATES.facilities.v)} a month. ${RATES.facilities.d}.`);
      break;
    case 'handling':
      add('Warehouse handling', units * RATES.handling.v,
        `${units.toLocaleString('en-US')} movements at ${m2(RATES.handling.v)}. Pulls and refiles are warehouse work, so they carry no route time at all.`);
      break;
    case 'movement':
      routeLines('visits');
      add('Box handling', units * RATES.handling.v,
        `${units.toLocaleString('en-US')} movements at ${m2(RATES.handling.v)}. ${RATES.handling.d}.`);
      break;
    case 'bin':
      routeLines('visits');
      if (o.pounds != null) {
        add('Shred plant', o.pounds * RATES.shredPlant.v,
          `${Number(o.pounds).toLocaleString('en-US')} lb recorded on S5 at ${m4(RATES.shredPlant.v)} a pound. ${RATES.shredPlant.d}.`);
      } else {
        const code = RATES.lbPerBin.v[o.binCode] ? o.binCode : 'all';
        const lbs = RATES.lbPerBin.v[code];
        add('Shred plant', units * lbs * RATES.shredPlant.v,
          `${units.toLocaleString('en-US')} bins at an estimated ${lbs} lb${code === 'all' ? '' : ` (${code})`}, ${m4(RATES.shredPlant.v)} a pound. No S5 weight on this account: ${RATES.lbPerBin.d}.`, 'estimate');
      }
      break;
    case 'itad':
      routeLines('collections');
      add('Plant throughput', units * RATES.lbPerItad.v * RATES.shredPlant.v,
        `${units.toLocaleString('en-US')} units at about ${RATES.lbPerItad.v} lb, ${m2(RATES.shredPlant.v)} a pound. ${RATES.lbPerItad.d}.`);
      break;
    case 'shred':
      if (o.unit === 'box') {
        add('Shred plant', units * RATES.lbPerBox.v * RATES.shredPlant.v,
          `${units.toLocaleString('en-US')} boxes at an estimated ${RATES.lbPerBox.v} lb, ${m4(RATES.shredPlant.v)} a pound. ${RATES.lbPerBox.d}.`, 'estimate');
      } else {
        add('Shred plant', units * RATES.shredPlant.v,
          `${units.toLocaleString('en-US')} lb weighed at ${m4(RATES.shredPlant.v)} a pound. Paper shredded at the plant; the route that brought it carries its own cost.`);
      }
      break;
    case 'labour': {
      const h = o.isCentre ? RATES.centreHr : RATES.driverHr;
      add(o.isCentre ? 'Service Centre time' : 'Driver time', units * h.v,
        `${units.toLocaleString('en-US')} hours at ${m2(h.v)}. ${h.d}.`);
      break;
    }
  }
  return { lines, total, perUnit: units > 0 ? total / units : 0, visits };
}

/** Map a VCK / Veri-Shred service description to a family. */
function familyOf(name) {
  const s = String(name || '').toLowerCase();
  if (/per lb|weight/.test(s)) return 'shred';
  if (/storage|carton storage|box storage|per month/.test(s) && !/process/.test(s)) return 'storage';
  if (/\bbin|rotat|console|toter|gallon/.test(s)) return 'bin';
  if (/destruct|media|hard drive|shred truck|itad|purge/.test(s)) return 'itad';
  if (/labou?r|data entry|indexing|per hour|hourly/.test(s)) return 'labour';
  if (/deliver|pick-?up|collection/.test(s)) return 'movement';
  if (/retriev|return|refile|carton process|withdraw|additional box|pull|rebox/.test(s)) return 'handling';
  if (/shred/.test(s)) return 'itad';
  return 'movement';
}

/** Which rates are modelled rather than measured — for the ◇ mark. */
function isModelled(family) {
  return family === 'bin' || family === 'itad' || family === 'movement' || family === 'shred';
}

const api = { RATES, MODEL, SETTINGS, FAMILIES, UNITS_PER_VISIT, costToServe, familyOf, isModelled, travelPerVisit, onSitePerVisit, derive, loadFromDb };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.R4RATES = api;
