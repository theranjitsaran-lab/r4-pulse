// Server-side views: each screen's figures worked out here, by the same functions the browser used
// (public/components), and sent as the few KB the screen draws instead of the megabytes it was
// computed from. The full datasets stay at /api/<name> for drill-downs.
//   GET /api/view/home   Home: homeView (home2data.js) + yesterday (changes.js, lists.js) for the signed-in person
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const express = require('express');
const { query, USE_FIXTURES } = require('./db');
const { data, stamp } = require('./screendata');
const feedback = require('./feedback');
const sales = require('./sales');
const { seesCosts } = require('./settings');

const router = express.Router();
let libs;
const load = () => libs || (libs = Promise.all(['home2data', 'changes', 'lists', 'custbook', 'opps', 'gl', 'margin', 'linework', 'linegrid', 'metrics'].map(n => import('../public/components/' + n + '.js').then(m => [n, m]))).then(Object.fromEntries));

async function callsLog() {
  if (USE_FIXTURES) { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'calls_log.json'), 'utf8')); } catch { return []; } }
  return query(`SELECT level1, kind, signal, verdict, who, logged_at::text FROM app.calls_log WHERE logged_at > now() - interval '30 days'`).catch(() => []);
}

// the part that is the same for everyone, kept until the data moves
let homeBase = null;
async function homeShared(D, L) {
  const s = stamp(D);
  if (homeBase && homeBase.stamp === s) return homeBase.v;
  const V = L.home2data.homeView(D);
  const v = {
    month: V.month, weeks: V.weeks, lines: V.lines, points: V.points, yesterday: L.metrics.yesterdayLine(D.P, D.A),
    latestDone: D.A.latestDone, monthly: D.P.monthly.slice(-2), tie: L.metrics.tieOut(D.P),
    changes: L.changes.changesFor(D.P, D.A), day: L.changes.daySentence(D.P, D.A),
  };
  homeBase = { stamp: s, v };
  return v;
}

function send(req, res, data) {
  const body = JSON.stringify({ snapshotAt: new Date().toISOString(), data });
  res.set({ 'Cache-Control': 'private, no-cache', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Accept-Encoding' });
  if (/\bgzip\b/.test(req.headers['accept-encoding'] || '')) { res.set('Content-Encoding', 'gzip'); return res.end(zlib.gzipSync(body)); }
  res.end(body);
}

// Customers › Overview: the customer book (custbook.js) with each row trimmed to what the table and its
// pop-outs read (the cross-sell cell keeps its figure and basis, not its peer list), and the book by
// line. Cached until the data moves.
let custBase = null;
router.get('/customers', async (req, res) => {
  try {
    const [D, L] = await Promise.all([data(), load()]);
    const st = stamp(D);
    if (!custBase || custBase.stamp !== st) {
      const B = L.custbook.customerBook({ C: D.C, M: D.M, PR: D.PR, R: D.R });
      const trimCell = c => c ? { have: c.have, opp: c.opp, basis: c.basis, spend: c.spend, low: c.low, expected: c.expected, note: c.note } : c;
      const rows = B.rows.map(r => {
        const { move, ...rest } = r;
        return { ...rest, oppRow: r.oppRow ? { opp: r.oppRow.opp, cells: Object.fromEntries(Object.entries(r.oppRow.cells).map(([k, c]) => [k, trimCell(c)])) } : null };
      });
      // the same rows with every cost taken out, for people who do not see costs yet
      const plain = rows.map(({ cost, margin, pc, review, routeCost, parts, ...r }) => ({ ...r, fam: Object.fromEntries(Object.entries(r.fam).map(([k, { cost: c, costPer, lines, ...f }]) => [k, f])), mfam: Object.fromEntries(Object.entries(r.mfam).map(([k, v]) => [k, { revenue: v.revenue }])) }));
      custBase = { stamp: st, plain, v: { rows, book: B.book, months: B.months, ws: { total: B.ws.total }, seg: L.home2data.segmentView({ P: D.P, A: D.A, SG: D.SG }),
        am: D.AM ? { months: D.AM.months, rows: D.AM.accounts.map(a => ({ level1: a.level1, customer: a.customer, m: a.storage.map((s, i) => s + a.service[i]), s: a.storage })) } : null } };
    }
    send(req, res, seesCosts(req) ? custBase.v : { ...custBase.v, rows: custBase.plain, book: Object.fromEntries(Object.entries(custBase.v.book).map(([k, u]) => [k, Object.fromEntries(Object.entries(u).map(([n, b]) => [n, { price: b.price }]))])) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The bins' real route-day costs (server/routecost.js), for the browser's copy of model/rates.js:
// by account and by postcode, with the days and the three time assumptions they rest on.
router.get('/routecost', async (req, res) => {
  try { const D = await data(); send(req, res, D.RC || { accounts: {}, postcodes: {}, days: 0 }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// The Quote screen's map: the regular stops by weekday and route, each route's latest such day in stop order, each
// account's usual postcode and the book's postcodes for the shading. No costs: route shares are on view/routecost.
let quoteBase = null;
router.get('/quote-routes', async (req, res) => {
  try {
    const D = await data(), st = stamp(D);
    if (!quoteBase || quoteBase.stamp !== st) {
      const reg = new Map(), dayOf = new Map(), pcs = new Map();
      for (const d of (D.RC && D.RC.dayList) || []) {
        const dow = new Date(d.date + 'T12:00:00Z').getUTCDay(), k = dow + '|' + d.route, dk = d.date + '|' + d.route, stops = d.stops.filter(s => !s.delivery && s.postcode);
        for (const s of stops) {
          const rk = k + '|' + s.postcode, x = reg.get(rk) || { dow, route: d.route, postcode: s.postcode, n: 0, who: new Set() };
          x.n++; x.who.add(s.level1); x.day = dk; reg.set(rk, x);
          if (s.level1 != null) { const m = pcs.get(s.level1) || new Map(); m.set(s.postcode, (m.get(s.postcode) || 0) + (s.services || 0)); pcs.set(s.level1, m); }
        }
        if (stops.length) dayOf.set(dk, { date: d.date, route: d.route, stops: [...new Set(stops.map(s => s.postcode))], customers: new Set(stops.map(s => s.level1)).size, services: stops.reduce((t, s) => t + (s.services || 0), 0) });
      }
      const regular = [...reg.values()].filter(x => x.n >= 4);
      quoteBase = { stamp: st, v: {
        regular: regular.map(x => ({ dow: x.dow, route: x.route, postcode: x.postcode, n: x.n, day: x.day, solo: x.who.size === 1 ? [...x.who][0] : null })),
        days: Object.fromEntries(regular.map(x => [x.day, dayOf.get(x.day)])),
        acctPc: Object.fromEntries([...pcs].map(([id, m]) => [id, [...m].sort((a, b) => b[1] - a[1])[0][0]])),
        postcodes: ((D.A && D.A.postcodes) || []).map(({ postcode, services, customers, billing_only }) => ({ postcode, services, customers, billing_only })),
      } };
    }
    send(req, res, quoteBase.v);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Customers › Opportunities: every opportunity (components/opps.js) with what the team has said about
// it (server/sales.js), and what was won this month. The list is cached until the data moves; the
// statuses are read fresh each time.
let oppBase = null;
router.get('/opportunities', async (req, res) => {
  try {
    const [D, L, statuses] = await Promise.all([data(), load(), sales.opportunities()]);
    const st = stamp(D);
    if (!oppBase || oppBase.stamp !== st) oppBase = { stamp: st, v: L.opps.opportunities({ C: D.C, PR: D.PR, CA: D.CA, M: D.M }, {}) };
    const only = req.query.level1 != null ? Number(req.query.level1) : null;   // one customer's, for its page
    const rows = oppBase.v.rows.filter(r => only == null || r.level1 === only).map(r => {
      const s = statuses[r.key];
      return s ? { ...r, status: s.status, owner: s.owner, at: s.at, note: s.note } : r;
    });
    send(req, res, { rows, won: L.opps.wonIn(statuses), me: (req.session.user && req.session.user.name) || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Numbers: core against $1.0M by month (kpi.monthly), the EBITDA bridge from QuickBooks (model.gl_month,
// components/gl.js) when it has been loaded, and margin by line of business (components/margin.js).
let numBase = null;
router.get('/numbers', async (req, res) => {
  try {
    const [D, L] = await Promise.all([data(), load()]);
    const st = stamp(D) + '|' + (D.G && D.G.loadedAt);
    if (!numBase || numBase.stamp !== st) {
      const monthly = D.P.monthly.slice(-25).map(m => ({ month: m.month, core: m.core, storage: m.storage, service: m.core_service, citadel: m.citadel }));
      const G = D.G && D.G.loaded ? L.gl.bridge(D.G.rows) : null;
      const book = L.margin.buildMargins(D.R, D.M, { exclude: [6714] });
      const lines = Object.entries(book.families).map(([f, v]) => ({ family: f, name: L.margin.FAMILY_NAMES[f] || f, revenue: v.revenue, cost: v.cost }))
        .filter(x => x.revenue > 0).sort((a, b) => b.revenue - a.revenue);
      const rc = D.R.routeCostsNow();
      const realBins = book.accounts.filter(a => a.fam.bin && D.R.routeFor(a.level1));
      const lineGrid = L.linegrid.lineGrid(D);
      numBase = { stamp: st, v: {
        monthly, target: 1e6, month: L.home2data.monthView(D), dest: L.home2data.destructionView(D), tie: L.metrics.tieOut(D.P), citadelBridge: (D.P.tieout || []).slice(-2)[0] || null,
        gap: (() => { const m = L.home2data.monthView(D); return { gap: m.gap, next: m.next ? m.next.month : null }; })(),   // the same gap as Home
        lineGrid, lineCosts: L.linegrid.lineCosts(D, lineGrid),
        gl: G ? { months: G.months, last12: L.gl.sumMonths(G.months, 12), overheadLines: G.overheadLines, loadedAt: D.G.loadedAt, source: D.G.source } : null,
        margin: { lines, accounts: book.accounts.length, deliveriesOn: !!(rc.deliveries && rc.deliveries.on), moveReal: book.accounts.filter(a => a.fam.movement && D.R.movementFor(a.level1)).length, binReal: { accounts: realBins.length, revenue: realBins.reduce((t, a) => t + a.fam.bin.revenue, 0), routeDays: rc.days, from: rc.from, to: rc.to } },
      } };
    }
    send(req, res, seesCosts(req) ? numBase.v : { ...numBase.v, margin: null, lineCosts: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// One account's lines by month billed, for its row on Accounts
router.get('/account-lines', async (req, res) => {
  try {
    const level1 = Number(req.query.level1);
    if (!Number.isInteger(level1)) return res.status(400).json({ error: 'level1' });
    const [D, L] = await Promise.all([data(), load()]);
    const v = D.AM && D.AL ? L.linegrid.accountLines(D.AM, D.AL, level1) : null;
    if (!v) return res.status(404).json({ error: 'no such account' });
    send(req, res, v);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// One account's invoices in a month: live for any account; from the fixture offline
router.get('/invoices', async (req, res) => {
  try {
    const level1 = Number(req.query.level1), month = String(req.query.month || '');
    if (!Number.isInteger(level1) || !/^\d{4}-\d{2}-01$/.test(month)) return res.status(400).json({ error: 'level1 and month' });
    if (USE_FIXTURES) {
      const f = path.join(__dirname, '..', 'fixtures', 'invoices.json');
      const hit = fs.existsSync(f) && JSON.parse(fs.readFileSync(f, 'utf8')).data.rows.find(r => r.level1 === level1 && r.month === month);
      return hit ? send(req, res, hit) : res.status(404).json({ error: 'not in the offline copy' });
    }
    send(req, res, await require('./queries').customerInvoices(level1, month));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// One line of business in one month: the customers behind it, for Home's pop-out
router.get('/line', async (req, res) => {
  try {
    const [D, L] = await Promise.all([data(), load()]);
    if (!D.LW) return res.status(404).json({ error: 'lines by account are not in this snapshot' });
    const d = L.linework.lineDetail(D, String(req.query.key || ''), String(req.query.month || ''));
    if (!d) return res.status(404).json({ error: 'no such line or month' });
    send(req, res, d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/home', async (req, res) => {
  try {
    const [D, L] = await Promise.all([data(), load()]);
    const base = await homeShared(D, L);
    const who = (req.session.user && req.session.user.name) || 'trisha';
    const [log, fb, statuses] = await Promise.all([callsLog(), feedback.recent().catch(() => []), sales.opportunities().catch(() => ({}))]);
    const team = {
      trisha: L.lists.trishaView({ CA: D.CA, log, feedback: fb, changes: base.changes, who }),
      anne: L.lists.anneList({ C: D.C, PR: D.PR, CA: D.CA, log, feedback: fb, changes: base.changes, n: 3 }),
      mike: L.lists.mikeList({ A: D.A, feedback: fb, changes: base.changes }),
    };
    // the conversation candidates carry their signals; send only what the card shows
    team.anne.calls = team.anne.calls.map(c => ({ level1: c.level1, name: c.name, stake: c.stake, ev: c.sigs[0].ev }));
    // selling: what was won this month, and what is in play (contacted or quoted), from Opportunities
    const inPlay = Object.values(statuses).filter(x => x.status === 'contacted' || x.status === 'quoted');
    const sell = { won: L.opps.wonIn(statuses), inPlay: { n: inPlay.length, value: inPlay.reduce((t, x) => t + (Number(x.value) || 0), 0) } };
    // what one more customer would save is a modelled route cost: not until costs are final
    const costs = seesCosts(req);
    const plain = costs ? base : { ...base, points: base.points.filter(p => p.key !== 'location') };
    const actions = L.metrics.topActions({ lines: team.trisha.lines, calls: team.anne.calls });
    send(req, res, { ...plain, actions, sell });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
