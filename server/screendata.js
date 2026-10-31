// The screens' data, read once on the server: fixtures offline (re-read only when a file changes), the
// cached queries live. Ask (server/ask.js) and the server-side views (server/views.js) both read it,
// so they work from exactly what the screens would.
'use strict';
const fs = require('fs');
const path = require('path');
const { cached, USE_FIXTURES } = require('./db');
const queries = require('./queries');
const R = require('../model/rates');

const ROOT = path.join(__dirname, '..');
const NAMES = { P: 'pulse', A: 'activity', C: 'customers', M: 'margin', PR: 'pricing', CA: 'calls', S: 'storage', SG: 'segments' };
const files = new Map();
function readJson(f, pick = j => j) {
  if (!fs.existsSync(f)) return null;
  const m = fs.statSync(f).mtimeMs, hit = files.get(f);
  if (hit && hit.m === m) return hit.v;
  const v = pick(JSON.parse(fs.readFileSync(f, 'utf8')));
  files.set(f, { m, v });
  return v;
}

async function data() {
  const out = {};
  await Promise.all(Object.entries(NAMES).map(async ([k, n]) => {
    out[k] = USE_FIXTURES ? readJson(path.join(ROOT, 'fixtures', n + '.json'), j => j.data) : await cached(n, queries[n]).catch(() => null);
  }));
  out.Z = readJson(path.join(ROOT, 'public', 'data', 'zcta.json')) || {};
  out.R = R;
  // the bins' real route-day costs into the cost model before anything is costed (server/routecost.js)
  out.RC = await require('./routecost').routeCosts(stamp(out)).catch(e => { console.warn('routecost:', e.message); return null; });
  return out;
}

// a stamp that moves when the data does: the views cache their result against it
function stamp(D) { return D.A ? `${D.A.latestDone}|${D.P && D.P.monthly ? D.P.monthly.length : 0}|${D.PR ? D.PR.rates.length : 0}` : 'none'; }

module.exports = { data, stamp, NAMES };
