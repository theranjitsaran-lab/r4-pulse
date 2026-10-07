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
app.use('/api', api);
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`R4 Pulse on http://localhost:${port}  (${USE_FIXTURES ? 'fixtures' : 'live database'})`);
});
