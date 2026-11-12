// Pulse refills the kpi summary itself (server/kpi_refresh.js): one transaction, one instance at a time,
// the old rows kept on any failure. Run against a stand-in connection; the database is not needed.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { refreshKpi } = require('../server/kpi_refresh');

const quiet = { log() {}, warn() {} };
function fake({ lock = true, failOn = null } = {}) {
  const sent = []; let released = false;
  const c = {
    async query(sql) {
      sent.push(sql.replace(/\s+/g, ' ').trim());
      if (failOn && sql.includes(failOn)) throw new Error('boom');
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ ok: lock }] };
      if (sql.startsWith('INSERT')) return { rowCount: sql.includes('customer') ? 900 : 40 };
      return { rows: [] };
    },
    release() { released = true; },
  };
  return { c, sent, released: () => released };
}

test('refills both tables from their views in one transaction', async () => {
  const f = fake();
  const r = await refreshKpi({ connectFn: async () => f.c, log: quiet });
  assert.deepStrictEqual(f.sent, [
    'BEGIN', 'SELECT pg_try_advisory_xact_lock($1) AS ok',
    'DELETE FROM kpi.monthly', 'INSERT INTO kpi.monthly SELECT * FROM v_kpi_industry',
    'DELETE FROM kpi.customer_monthly', 'INSERT INTO kpi.customer_monthly SELECT * FROM v_customer_monthly',
    'COMMIT',
  ]);
  assert.deepStrictEqual(r.counts, { 'kpi.monthly': 40, 'kpi.customer_monthly': 900 });
  assert.ok(f.released());
});

test('skips when another instance holds the lock, touching nothing', async () => {
  const f = fake({ lock: false });
  const r = await refreshKpi({ connectFn: async () => f.c, log: quiet });
  assert.strictEqual(r.skipped, true);
  assert.ok(!f.sent.some(s => s.startsWith('DELETE') || s.startsWith('INSERT')));
  assert.strictEqual(f.sent.at(-1), 'ROLLBACK');
  assert.ok(f.released());
});

test('a failure rolls back, so the old rows stay', async () => {
  const f = fake({ failOn: 'v_customer_monthly' });
  const r = await refreshKpi({ connectFn: async () => f.c, log: quiet });
  assert.strictEqual(r.error, 'boom');
  assert.strictEqual(f.sent.at(-1), 'ROLLBACK');
  assert.ok(!f.sent.includes('COMMIT'));
  assert.ok(f.released());
});
