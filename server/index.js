'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const auth = require('./auth');
const api = require('./api');
const { USE_FIXTURES, cached, query } = require('./db');

const PREVIEW = process.env.DESIGN_PREVIEW === '1';
// Done work runs up to five days behind on a Monday: the weekend, plus Veri-Shred marking Friday's
// work done later. Older than that, the push has stopped (it stopped on 8 October 2026, unnoticed).
const STALE_DAYS = 5;

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Both before auth.install: no login. /health/data carries dates only, never a figure.
app.get('/health', (req, res) => res.json({ ok: true, fixtures: USE_FIXTURES, preview: PREVIEW }));
app.get('/health/data', async (req, res) => {
  if (USE_FIXTURES) return res.json({ fixtures: true });
  try {
    const [d] = await cached('health:data', () => query(`SELECT current_date::text AS today,
      (SELECT max(NULLIF(date, '')::date) FROM vs_service_orders WHERE billable = 'true' AND NULLIF(date, '')::date <= current_date)::text AS done_work,
      (SELECT max(wodate)::date FROM priced_lines_current)::text AS run_work,
      (SELECT max(invdate)::date FROM invoices)::text AS posted_invoice,
      (SELECT max(month)::date FROM kpi.monthly)::text AS kpi_month`));
    const age = Math.round((Date.parse(d.today) - Date.parse(d.done_work)) / 864e5);
    const reasons = [];
    if (!(age <= STALE_DAYS)) reasons.push(`done work last on ${d.done_work}, ${age} days ago`);
    if (d.kpi_month < d.today.slice(0, 8) + '01') reasons.push(`kpi rebuilt only to ${d.kpi_month}`);
    res.json({ ...d, stale: reasons.length > 0, reasons });
  } catch (e) { res.status(503).json({ stale: true, reasons: [e.message] }); }
});

const feedback = require('./feedback');
app.use('/f', feedback.tap);   // a tap in the morning email: signed, no login

auth.install(app);
app.use('/api/log', require('./log'));
app.use('/api/feedback', feedback.api);
app.use('/api/summary', require('./summary'));
app.use('/api/ask', require('./ask'));
app.use('/api/view', require('./views'));
app.use('/api', api);
// Static files gzipped, cached and preloaded (server/static.js); the cost model runs in the browser too
// (Pricing, Margin): the same file, never a copy. express.static stays behind it for anything else.
app.use(require('./static'));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

const port = process.env.PORT || 3000;
const rates = require('../model/rates');

// Live: derive the cost model from model.* before serving. Fixtures: the seed in rates.js.
// Live: warm every screen's query at start and whenever the data moves, so nobody waits on the database.
const { clearCache } = require('./db');
const queries = require('./queries');
const WARM = ['pulse', 'activity', 'customers', 'pricing', 'calls', 'margin', 'storage', 'segments'];
async function warm() {
  for (const n of WARM) { if (!queries[n]) continue; const t = Date.now(); try { await cached(n, queries[n]); console.log(`warm ${n} ${Date.now() - t}ms`); } catch (e) { console.warn(`warm ${n}: ${e.message}`); } }
}
let stamp = null;
async function watch() {
  try {
    const [r] = await query(`SELECT (SELECT max(NULLIF(date, '')) FROM vs_service_orders) AS a, (SELECT max(invdate)::text FROM invoices) AS b,
      (SELECT max(month)::text FROM kpi.monthly) AS c, (SELECT count(*) FROM invoices_current)::text AS d, (SELECT max(wodate)::text FROM priced_lines_current) AS e`);
    const now = JSON.stringify(r);
    if (stamp && now !== stamp) { console.log('data moved: cache cleared'); clearCache(); warm(); }
    stamp = now;
  } catch (e) { console.warn('freshness stamp:', e.message); }
}

(USE_FIXTURES ? Promise.resolve() : rates.loadFromDb(query)).then(() => {
  if (!USE_FIXTURES) { watch().then(warm); setInterval(watch, 10 * 60 * 1000); }
  app.listen(port, () => {
    console.log(`R4 Pulse on http://localhost:${port}  (${USE_FIXTURES ? 'fixtures' : 'live database'}; route day $${rates.RATES.routeDay.v.toFixed(2)})`);
  });
}).catch(e => { console.error(`cost model did not load: ${e.message}`); process.exit(1); });
