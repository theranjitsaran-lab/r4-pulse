// The cost model's assumptions, editable on the Settings screen (#settings): speed between stops,
// minutes a stop and a service, the travel share where there are no route days, and how box
// deliveries are treated. Live it is app.setting (sql/setup_2026_11.sql), one row per change, the
// latest winning; with USE_FIXTURES=1 a local file, data/settings.json. Each change is applied to
// model/rates.js SETTINGS at once, so the route costs, every screen and Ask move together.
//   GET  /api/settings          the values, their defaults, bounds and notes, who changed what, and two
//                               reference figures at the current values
//   POST /api/settings          { key, value } (admin users only)
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');
const R = require('../model/rates');

const FILE = path.join(__dirname, '..', 'data', 'settings.json');
const DEFAULTS = { ...R.SETTINGS };
delete DEFAULTS.postcodes;
let ready = false, saveable = true, SIGNED = {}, CORR = {};

async function rows() {
  if (USE_FIXTURES) { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; } }
  try { return await query(`SELECT key, value::float, who, at::text FROM app.setting ORDER BY at`); }
  catch { saveable = false; return []; }   // before the setup SQL: the defaults, nothing saved yet
}
// the latest value of each key into SETTINGS; returns the history, newest first
async function load() {
  const rs = await rows();
  const latest = {};
  const typed = {};
  for (const r of rs) {
    if (r.key in DEFAULTS) latest[r.key] = r;
    // a postcode typed for a delivery account with none in the data: key pc:<level1>; 0 removes it
    const m = /^pc:(\d+)$/.exec(r.key || '');
    if (m) { if (Number(r.value) > 0) typed[m[1]] = String(Math.round(Number(r.value))).padStart(5, '0'); else delete typed[m[1]]; }
  }
  for (const k of Object.keys(DEFAULTS)) if (k !== 'postcodes') R.SETTINGS[k] = latest[k] ? Number(latest[k].value) : DEFAULTS[k];
  R.SETTINGS.postcodes = typed;
  // Route cost corrections and sign-offs (Settings › Route cost, admin only, 14 November 2026). The latest row of each
  // key wins: pool:<pool> a pool's twelve months in $, share:<pool>|<rate> its share of a rate, glfrom / glto the
  // months as yyyymm, signed:<assumption> the time it was signed off (0 takes the sign-off back).
  const last = {};
  for (const r of rs) if (/^(pool:|share:|signed:|glfrom$|glto$)/.test(r.key || '')) last[r.key] = r;
  const ym = v => { const n = Math.round(Number(v)); return n > 0 ? new Date(Date.UTC(Math.floor(n / 100), n % 100 - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null; };
  const pools = {}, shares = {};
  for (const [k, r] of Object.entries(last)) {
    if (k.startsWith('pool:') && Number(r.value) >= 0) pools[k.slice(5)] = Number(r.value);
    if (k.startsWith('share:') && Number(r.value) >= 0) shares[k.slice(6)] = Number(r.value);
  }
  R.applyCorrections({ pools, shares, from: last.glfrom ? ym(last.glfrom.value) : null, to: last.glto ? ym(last.glto.value) : null });
  SIGNED = Object.fromEntries(Object.entries(last).filter(([k, r]) => k.startsWith('signed:') && Number(r.value) > 0).map(([k, r]) => [k.slice(7), { who: r.who, at: r.at }]));
  CORR = last;
  ready = true;
  return { latest, history: rs.slice().reverse().slice(0, 30) };
}
const ensure = () => ready ? Promise.resolve() : load();

function clean(b) {
  const key = String(b.key || ''), B = R.SETTING_BOUNDS[key], v = Number(b.value);
  if (/^pool:[a-z_]{2,40}$/.test(key)) return Number.isFinite(v) && v >= 0 && v < 1e9 ? { key, value: Math.round(v * 100) / 100 } : null;
  if (/^share:[a-z_]{2,40}\|[a-z_]{2,40}$/.test(key)) return Number.isFinite(v) ? { key, value: Math.min(1, Math.max(0, v)) } : null;
  if (/^(glfrom|glto)$/.test(key)) return Number.isInteger(v) && v >= 202001 && v <= 209912 ? { key, value: v } : null;
  if (/^signed:[A-Za-z]{2,30}$/.test(key)) return Number.isFinite(v) && v >= 0 ? { key, value: Math.round(v) } : null;
  if (/^pc:\d+$/.test(key)) return Number.isInteger(v) && (v === 0 || (v >= 501 && v <= 99950)) ? { key, value: v } : null;
  if (!B || !Number.isFinite(v)) return null;
  if (key === 'deliveryMatch' || key === 'costsFinal') return { key, value: v ? 1 : 0 };
  return { key, value: Math.min(B[1], Math.max(B[0], v)) };
}
async function save(row) {
  if (USE_FIXTURES) {
    let rs = []; try { rs = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
    rs.push({ ...row, at: new Date().toISOString() });
    fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(rs, null, 1));
    return;
  }
  await query(`INSERT INTO app.setting (key, value, who) VALUES ($1, $2, $3)`, [row.key, row.value, row.who]);
}

const nameOf = (D, id) => { const a = (D.C && D.C.accounts || []).find(x => x.level1 === id) || (D.M && D.M.accounts || []).find(x => x.level1 === id); return a ? a.customer : `Account ${id}`; };

const api = express.Router();
api.get('/', async (req, res) => {
  try {
    const { latest, history } = await load();
    const { data } = require('./screendata');
    const D = await data();
    const rc = D.RC || { accounts: {} };
    const ing = rc.accounts[12530];
    const book = Object.values(rc.accounts).reduce((t, a) => ({ cost: t.cost + a.cost, services: t.services + a.services }), { cost: 0, services: 0 });
    res.json({ data: {
      values: (({ postcodes, ...v }) => v)(R.SETTINGS), defaults: DEFAULTS, bounds: R.SETTING_BOUNDS, notes: R.TIME_NOTES, latest, history,
      canEdit: !!(req.session.user && req.session.user.role === 'admin'), saveable,
      reference: {
        routeDay: R.RATES.routeDay.v, days: rc.days, from: rc.from, to: rc.to, avgRoundHours: rc.avgRoundHours,
        ingalls: ing ? { perService: ing.cost / ing.services, days: ing.days } : null,
        book: book.services ? { perService: book.cost / book.services, services: book.services } : null,
        deliveries: rc.deliveries ? { ...rc.deliveries, missing: (rc.deliveries.missing || []).map(m => ({ ...m, name: nameOf(D, m.level1) })) } : null,
        typed: Object.entries(R.SETTINGS.postcodes || {}).map(([l, pc]) => ({ level1: Number(l), postcode: pc, name: nameOf(D, Number(l)) })),
      },
      rates: Object.entries(R.RATES).map(([k, r]) => ({ key: k, value: r.v, unit: r.u, flag: r.c || null, derivation: r.d || null })),
    } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
api.post('/', async (req, res) => {
  if (!(req.session.user && req.session.user.role === 'admin')) return res.status(403).json({ error: 'Only an admin can change the assumptions.' });
  const row = clean(req.body || {});
  if (!row) return res.status(400).json({ error: 'a known key and a number are required' });
  try {
    await save({ ...row, who: req.session.user.name });
    await load();
    res.json({ data: (({ postcodes, ...v }) => v)(R.SETTINGS) });
  } catch (e) { res.status(500).json({ error: saveable ? e.message : 'Changes cannot be saved until the setup SQL has been applied on the PC.' }); }
});

// ── Settings › Route cost: the build line by line, a QuickBooks P&L to correct it, and a sign-off per assumption.
// Admin only (Theran, 14 November 2026): everyone else sees the result, marked est. until signed off.
const admin = req => !!(req.session.user && req.session.user.role === 'admin');
const ROUTE_ASSUMPTIONS = ['mph', 'stopMin', 'serviceMin', 'routeHours', 'split'];
const RATE_OF = { route_day: 'routeDay', facilities: 'facilities', handling: 'handling', shred_plant: 'shredPlant' };
const VOLUME_OF = { route_day: ['route_days', 'route days'], facilities: ['boxes', 'boxes × 12 months'], handling: ['movements', 'box movements'] };
let overlap = null;
async function itadOverlap() {
  // ITAD and hourly truck jobs (S0, S4, S6, SR, SN, S9) by customer and day in VCK, and how many of those days the same
  // customer also has a done Veri-Shred order, so are already in the route days. Twelve months. Live only.
  if (USE_FIXTURES) return null;
  if (overlap && overlap.at > Date.now() - 6 * 3600e3) return overlap.v;
  const [v] = await query(`
    WITH j AS (SELECT DISTINCT p.level1, p.wodate::date AS d FROM priced_lines p JOIN servcode s USING (servcodeid)
               WHERE s.servcode IN ('S0', 'S4', 'S6', 'SR', 'SN', 'S9') AND p.wodate >= current_date - interval '12 months'),
         v AS (SELECT DISTINCT NULLIF(level1, '')::int AS level1, NULLIF(date, '')::date AS d FROM vs_service_orders
               WHERE billable = 'true' AND NULLIF(date, '')::date >= current_date - interval '12 months')
    SELECT count(*)::int AS days, count(v.level1)::int AS onroute FROM j LEFT JOIN v USING (level1, d)`).catch(() => [null]);
  overlap = { at: Date.now(), v: v || null };
  return overlap.v;
}
function build() {
  const { model, base, corrected, names } = R.activeModel(), k = 12 / model.gl.months;
  const rates = Object.keys(RATE_OF).map(rate => {
    const parts = model.splits.filter(x => x[1] === rate).map(([p, , share]) => ({ pool: p, name: names[p] || p, accounts: model.pools[p].accounts, year: model.pools[p].amount * k, share, into: model.pools[p].amount * k * share, corrected: !!(corrected && corrected.pools && corrected.pools[p] != null), shareCorrected: !!(corrected && corrected.shares && corrected.shares[p + '|' + rate] != null) }));
    const r = R.RATES[RATE_OF[rate]], vol = VOLUME_OF[rate];
    return { rate, label: r ? r.u : rate, total: parts.reduce((t, x) => t + x.into, 0), volume: vol ? { value: model.volumes[vol[0]], word: vol[1] } : null, result: r ? r.v : null, derivation: r ? r.d : null, parts };
  });
  return {
    period: model.gl, basePeriod: base.gl, volumesPeriod: model.volumesPeriod, corrected: !!corrected,
    rates,
    assumptions: ROUTE_ASSUMPTIONS.map(key => ({ key, value: R.SETTINGS[key], default: DEFAULTS[key], note: R.TIME_NOTES[key], signed: SIGNED[key] || null })),
    signedAll: ROUTE_ASSUMPTIONS.every(k => SIGNED[k]),
  };
}
api.get('/routecost', async (req, res) => {
  if (!admin(req)) return res.status(403).json({ error: 'Only an admin can see the route cost build.' });
  try { await load(); res.json({ data: { ...build(), overlap: await itadOverlap(), saveable } }); } catch (e) { res.status(500).json({ error: e.message }); }
});
// a P&L read and summed into the pools, not saved: what would change
api.post('/routecost/preview', express.json({ limit: '5mb' }), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ error: 'Only an admin can correct the route cost.' });
  try {
    const G = await import('../public/components/glcsv.js');
    const P = G.parsePL(req.body && req.body.csv);
    const months = Array.isArray(req.body.months) && req.body.months.length ? req.body.months.filter(m => P.months.includes(m)) : P.months.slice(-12);
    const { base } = R.activeModel(), k = 12 / base.gl.months;
    const got = G.poolsFrom(P, base.pools, months), scale = 12 / Math.max(1, months.length);
    res.json({ data: { fileMonths: P.months, months, pools: Object.entries(got).map(([p, x]) => ({ pool: p, accounts: base.pools[p].accounts, was: base.pools[p].amount * k, now: x.amount * scale, lines: x.lines.slice(0, 12), found: x.lines.length })) } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// save it: each pool read from the file, as twelve months, and the months it came from
api.post('/routecost/apply', express.json({ limit: '5mb' }), async (req, res) => {
  if (!admin(req)) return res.status(403).json({ error: 'Only an admin can correct the route cost.' });
  try {
    const G = await import('../public/components/glcsv.js');
    const P = G.parsePL(req.body && req.body.csv);
    const months = (Array.isArray(req.body.months) ? req.body.months : P.months.slice(-12)).filter(m => P.months.includes(m)).sort();
    if (months.length < 3) return res.status(400).json({ error: 'Choose at least three months.' });
    const { base } = R.activeModel(), got = G.poolsFrom(P, base.pools, months), scale = 12 / months.length, who = req.session.user.name;
    const only = Array.isArray(req.body.pools) ? new Set(req.body.pools) : null;
    for (const [p, x] of Object.entries(got)) if (x.lines.length && (!only || only.has(p))) await save({ key: 'pool:' + p, value: Math.round(x.amount * scale * 100) / 100, who });
    const ym = m => Number(m.slice(0, 4)) * 100 + Number(m.slice(5, 7));
    await save({ key: 'glfrom', value: ym(months[0]), who }); await save({ key: 'glto', value: ym(months[months.length - 1]), who });
    await load();
    res.json({ data: build() });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
// back to the base model: every correction set aside (the rows stay, so the history shows it)
api.post('/routecost/reset', async (req, res) => {
  if (!admin(req)) return res.status(403).json({ error: 'Only an admin can correct the route cost.' });
  try {
    const who = req.session.user.name;
    for (const k of Object.keys(CORR)) if (/^(pool:|share:)/.test(k)) await save({ key: k, value: -1, who });
    await load(); res.json({ data: build() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
const routeSigned = () => ROUTE_ASSUMPTIONS.every(k => SIGNED[k]);

// margins and advice built on them
const seesCosts = req => !!(req.session && req.session.user);   // everyone signed in (Theran, 3 November 2026); only Settings is admin only

module.exports = { api, load, ensure, seesCosts, routeSigned };
