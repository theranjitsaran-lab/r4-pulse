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

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
}

function clearCache() { cache.clear(); }

module.exports = { query, cached, clearCache, USE_FIXTURES };
