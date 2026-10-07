// R4 Pulse — the cost model. The single source of truth.
// Pricing and Margin both import this. There is no second formula and no cost
// number anywhere else in the repo. Every rate carries its derivation and a
// confidence flag, because both are shown to users.
//
// Works in Node (CommonJS) and in the browser (served as /model/rates.js and
// loaded as a classic script that sets window.R4RATES).
'use strict';

const RATES = {
  facilities: { v: 0.124, u: '$ per box per month', c: 'measured',
    d: 'GL facilities $1,777,802 across four sites ÷ 1.2m boxes ÷ 12' },
  handling:   { v: 6.13,  u: '$ per box movement', c: 'measured',
    d: 'warehouse payroll plus allocated supervision and supplies ÷ 135,000 movements a year' },
  shredPlant: { v: 0.34,  u: '$ per lb', c: 'measured',
    d: 'the shred share of warehouse payroll and plant ÷ about 1.5m lb processed' },
  routeDay:   { v: 680,   u: '$ per route day', c: 'measured',
    d: 'driver payroll $510,098 from GL 7335700 plus vehicles $445,508 ÷ 1,134 route days' },
  driverHr:   { v: 32.49, u: '$ per hour', c: 'measured',
    d: 'ADP payroll, drivers, loaded with employer liability' },
  centreHr:   { v: 25.05, u: '$ per hour', c: 'measured',
    d: 'ADP payroll, Service Centre, loaded' },
  visitsDay:  { v: 5.4,   u: 'site visits per route day', c: 'observed',
    d: 'observed across Mark, Jorge, Demond and Angel, September 2026' },
  unitsVisit: { v: 6.5,   u: 'services per site visit', c: 'observed',
    d: 'observed across the four daily routes' },
  avgMiles:   { v: 11.4,  u: 'miles from the yard', c: 'observed',
    d: 'volume-weighted mean across 150 postcodes' },
  lbPerBin:   { v: 24,    u: 'lb per bin service', c: 'partial',
    d: 'Ingalls 167,640 lb ÷ 6,886 services — executive consoles sit at capacity on every order, not weighed' },
  lbPerItad:  { v: 1.5,   u: 'lb per ITAD unit', c: 'estimate',
    d: 'a drive or media unit; media destruction is not weighed, so the paper rate stands in' },
};

// The one assumption: the share of a route day spent travelling rather than on site.
// GPS, arrival times and durations were never captured. Exposed as a slider in the UI.
const SETTINGS = { split: 0.40 };

const FAMILIES = ['storage', 'handling', 'movement', 'bin', 'itad', 'labour'];

// how many units one site visit covers, by family. 0 = no route time at all.
const UNITS_PER_VISIT = { bin: 6.5, movement: 6.5, itad: 4000, storage: 0, handling: 0, labour: 0 };

const m0 = n => '$' + Math.round(n).toLocaleString('en-US');
const m2 = n => '$' + n.toFixed(2);
const m3 = n => '$' + n.toFixed(3);
const pct = n => Math.round(n * 100) + '%';

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
 *   units   boxes (storage), movements (handling, movement), bin services, ITAD units, hours
 *   opts    { visits, miles, isCentre }
 * returns { lines: [[name, amount, derivation]], total, perUnit, visits }
 */
function costToServe(family, units, opts) {
  if (!FAMILIES.includes(family)) throw new Error(`unknown family: ${family}`);
  const o = Object.assign({ visits: null, miles: RATES.avgMiles.v, isCentre: false }, opts || {});
  units = Math.max(0, Number(units) || 0);
  const upv = UNITS_PER_VISIT[family];
  const visits = (o.visits != null && o.visits > 0) ? Number(o.visits)
               : (upv > 0 ? Math.max(1, Math.ceil(units / upv)) : 0);

  const lines = [];
  let total = 0;
  const add = (name, amount, why) => { lines.push([name, amount, why]); total += amount; };
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
      add('Shred plant', units * RATES.lbPerBin.v * RATES.shredPlant.v,
        `${units.toLocaleString('en-US')} bins at roughly ${RATES.lbPerBin.v} lb, ${m2(RATES.shredPlant.v)} a pound. ${RATES.lbPerBin.d}.`);
      break;
    case 'itad':
      routeLines('collections');
      add('Plant throughput', units * RATES.lbPerItad.v * RATES.shredPlant.v,
        `${units.toLocaleString('en-US')} units at about ${RATES.lbPerItad.v} lb, ${m2(RATES.shredPlant.v)} a pound. ${RATES.lbPerItad.d}.`);
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
  return family === 'bin' || family === 'itad' || family === 'movement';
}

const api = { RATES, SETTINGS, FAMILIES, UNITS_PER_VISIT, costToServe, familyOf, isModelled, travelPerVisit, onSitePerVisit };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.R4RATES = api;
