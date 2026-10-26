'use strict';
require('dotenv').config();
const path = require('path');
const express = require('express');
const auth = require('./auth');
const api = require('./api');
const { USE_FIXTURES } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true, fixtures: USE_FIXTURES }));

auth.install(app);
app.use('/api/log', require('./log'));
app.use('/api/summary', require('./summary'));
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));
// The cost model runs in the browser too (Pricing, Margin): the same file, never a copy.
app.get('/model/rates.js', (req, res) => res.sendFile(path.join(__dirname, '..', 'model', 'rates.js')));

const port = process.env.PORT || 3000;
const rates = require('../model/rates');
const { query } = require('./db');

// Live: derive the cost model from model.* before serving. Fixtures: the seed in rates.js.
(USE_FIXTURES ? Promise.resolve() : rates.loadFromDb(query)).then(() => {
  app.listen(port, () => {
    console.log(`R4 Pulse on http://localhost:${port}  (${USE_FIXTURES ? 'fixtures' : 'live database'}; route day $${rates.RATES.routeDay.v.toFixed(2)})`);
  });
}).catch(e => { console.error(`cost model did not load: ${e.message}`); process.exit(1); });
