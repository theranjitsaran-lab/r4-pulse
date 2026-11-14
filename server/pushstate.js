// Is a push half-way through? The pushes on the R4 machine empty each table and then reload it, so for a few minutes
// a source table can be empty. Pulse must not read the screens then (14 November 2026: the freshness check landed
// while vs_service_orders was empty, the screens swapped to it and Today failed until the next check).
//   STATE_SQL   one cheap query: the freshness stamp, and whether each core table holds rows
//   midPush(r)  → the reason it looks half-loaded, or null when every table is whole
//   stampOf(r)  → the part of the row that says the data has moved
'use strict';
const STATE_SQL = `SELECT (SELECT max(NULLIF(date, '')) FROM vs_service_orders) AS a, (SELECT max(invdate)::text FROM invoices) AS b,
  (SELECT count(*) FROM invoices_current)::text AS d, (SELECT max(wodate)::text FROM priced_lines_current) AS e,
  EXISTS (SELECT 1 FROM vs_service_orders WHERE billable = 'true') AS vs, EXISTS (SELECT 1 FROM invoices) AS inv,
  EXISTS (SELECT 1 FROM priced_lines) AS pl, EXISTS (SELECT 1 FROM customer) AS cu, EXISTS (SELECT 1 FROM servcode) AS sc`;
const TABLES = { vs: 'vs_service_orders', inv: 'invoices', pl: 'priced_lines', cu: 'customer', sc: 'servcode' };
function midPush(r) {
  if (!r) return 'no answer from the database';
  const empty = Object.keys(TABLES).filter(k => r[k] === false);
  if (empty.length) return `${empty.map(k => TABLES[k]).join(', ')} empty`;
  if (r.a == null) return 'no Veri-Shred service orders';
  if (r.b == null) return 'no posted invoices';
  return null;
}
const stampOf = r => JSON.stringify({ a: r.a, b: r.b, d: r.d, e: r.e });
module.exports = { STATE_SQL, midPush, stampOf };
