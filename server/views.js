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

const router = express.Router();
let libs;
const load = () => libs || (libs = Promise.all(['home2data', 'changes', 'lists', 'custbook', 'opps'].map(n => import('../public/components/' + n + '.js').then(m => [n, m]))).then(Object.fromEntries));

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
    month: V.month, weeks: V.weeks, seg: V.seg, cust: V.cust, cross: V.cross, dens: V.dens, dest: V.dest,
    latestDone: D.A.latestDone, monthly: D.P.monthly.slice(-2),
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
      const trimCell = c => c ? { have: c.have, opp: c.opp, basis: c.basis, spend: c.spend } : c;
      const rows = B.rows.map(r => {
        const { move, ...rest } = r;
        return { ...rest, oppRow: r.oppRow ? { opp: r.oppRow.opp, cells: Object.fromEntries(Object.entries(r.oppRow.cells).map(([k, c]) => [k, trimCell(c)])) } : null };
      });
      custBase = { stamp: st, v: { rows, book: B.book, months: B.months, ws: { total: B.ws.total }, seg: L.home2data.segmentView({ P: D.P, A: D.A, SG: D.SG }) } };
    }
    send(req, res, custBase.v);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// The bins' real route-day costs (server/routecost.js), for the browser's copy of model/rates.js:
// by account and by postcode, with the days and the three time assumptions they rest on.
router.get('/routecost', async (req, res) => {
  try { const D = await data(); send(req, res, D.RC || { accounts: {}, postcodes: {}, days: 0 }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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
    const rows = oppBase.v.rows.map(r => {
      const s = statuses[r.key];
      return s ? { ...r, status: s.status, owner: s.owner, at: s.at, note: s.note } : r;
    });
    send(req, res, { rows, won: L.opps.wonIn(statuses), me: (req.session.user && req.session.user.name) || null });
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
    send(req, res, { ...base, team, sell });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
