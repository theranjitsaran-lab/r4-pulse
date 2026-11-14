// Postgres pool + a small in-memory cache.
// Every query in the app goes through cached(key, fn) so a screen never hits the
// database more than once per 15 minutes, whoever is looking at it.
'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const USE_FIXTURES = process.env.USE_FIXTURES === '1';
let pool = null;

function getPool() {
  if (USE_FIXTURES) return null;
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set (or set USE_FIXTURES=1)');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), // sslmode in the URL would override ssl below
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) throw new Error('query() called while USE_FIXTURES=1');
  const r = await p.query(text, params);
  return r.rows;
}

// The data changes once a day (the push at 06:00–06:30, the rebuild at 07:00), so a query result is kept
// until the data does: server/index.js checks a cheap freshness stamp every ten minutes and clears the
// cache when it moves. Twelve hours is the backstop.
const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map();

const reading = new Map();   // one read of a query at a time, however many screens ask for it
function fetchFresh(key, fn) {
  let p = reading.get(key);
  if (!p) {
    p = Promise.resolve().then(fn).then(value => { cache.set(key, { value, until: Date.now() + TTL_MS }); return value; }).finally(() => reading.delete(key));
    reading.set(key, p);
  }
  return p;
}
// Nobody waits for a refresh: past its time a value is still served while a new one is read behind it.
async function cached(key, fn) {
  const hit = cache.get(key);
  if (!hit) return fetchFresh(key, fn);
  if (hit.until <= Date.now()) fetchFresh(key, fn).catch(e => console.warn(`refresh ${key}: ${e.message}`));
  return hit.value;
}

// The data has moved: read every named query first, then swap, so the screens keep the old figures until the new ones are all in.
async function replaceCache(named) {
  const fresh = [];
  for (const [key, fn] of named) { try { fresh.push([key, await fn()]); } catch (e) { console.warn(`replace ${key}: ${e.message}`); const old = cache.get(key); if (old) fresh.push([key, old.value]); } }
  cache.clear();
  for (const [key, value] of fresh) cache.set(key, { value, until: Date.now() + TTL_MS });
}

module.exports = { query, cached, replaceCache, USE_FIXTURES };
