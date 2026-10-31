// Loads a QuickBooks "Profit and Loss by Month" export into model.gl_month, for Numbers' EBITDA bridge.
// Run on the PC, which can reach the database. Once a month, after the books close.
//
//   In QuickBooks: Reports › Profit and Loss › Customize › Display columns by: Months; the period you
//   want (the twelve months to the last closed month); Rows: show all accounts with sub-accounts.
//   Export to Excel, then in Excel: File › Save As › CSV. Keep the file out of the repo (*.csv is ignored).
//
//   node scripts/load_gl.js "C:\path\to\ProfitAndLoss.csv" --dry-run    reads and prints, writes nothing
//   node scripts/load_gl.js "C:\path\to\ProfitAndLoss.csv"              writes model.gl_month
//
// Each account row with figures is a posting line (a "Total ..." row is a subtotal and is skipped, so
// nothing is counted twice). The section it sits in (Income, Expenses, Other Income, Other Expense) and
// its account tree decide its line in the bridge (public/components/gl.js classify). A month already
// loaded is replaced whole.
'use strict';
require('dotenv').config();
const fs = require('fs');

const file = process.argv[2], dry = process.argv.includes('--dry-run');
if (!file || !fs.existsSync(file)) { console.error('usage: node scripts/load_gl.js <ProfitAndLoss.csv> [--dry-run]'); process.exit(1); }

// a small CSV reader: quoted fields, doubled quotes, commas inside quotes
function csv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function monthOf(h) {
  const m = String(h || '').trim().toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s*-?\s*(\d{4})$/);
  return m && MONTHS[m[1]] ? `${m[2]}-${String(MONTHS[m[1]]).padStart(2, '0')}-01` : null;
}
const money = s => { const t = String(s || '').replace(/[$,\s]/g, ''); if (!t) return null; const neg = /^\(.*\)$/.test(t) || t.startsWith('-'); const n = parseFloat(t.replace(/[()-]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : null; };

(async () => {
  const { classify, codeOf, bridge, NAMES } = await import('../public/components/gl.js');
  const rows = csv(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  const hi = rows.findIndex(r => r.filter(monthOf).length >= 1);
  if (hi < 0) { console.error('No header row with months (like "Jan 2026") found. Export with columns by month.'); process.exit(1); }
  const cols = rows[hi].map((h, i) => [i, monthOf(h)]).filter(([, m]) => m);
  console.log(`months: ${cols.map(c => c[1].slice(0, 7)).join(', ')}`);

  let section = null;
  const parents = [], out = [];
  for (const r of rows.slice(hi + 1)) {
    const label = String(r[0] || '').trim();
    if (!label) continue;
    const low = label.toLowerCase();
    if (/^(total )?(income|revenue)$/.test(low) || low === 'ordinary income/expense') { if (!low.startsWith('total')) section = 'income'; continue; }
    if (/^(cost of goods sold|cost of sales|expenses?)$/.test(low)) { section = 'expense'; parents.length = 0; continue; }
    if (/^other (income|expenses?)$/.test(low)) { section = 'other'; parents.length = 0; continue; }
    if (/^(gross profit|net (operating )?income|net other income|net ordinary income|net income)/.test(low)) continue;
    const vals = cols.map(([i, m]) => [m, money(r[i])]).filter(([, v]) => v != null);
    if (low.startsWith('total ')) {   // closes the group it names
      const name = label.slice(6).trim(), k = parents.map(p => p.label).lastIndexOf(name);
      if (k >= 0) parents.length = k;
      continue;
    }
    if (!section) continue;
    if (!vals.length) { parents.push({ label, code: codeOf(label), name: label }); continue; }   // a parent: its rows follow
    const code = codeOf(label) || (parents.length ? parents[parents.length - 1].code : null);
    const line = classify(codeOf(label), label, parents, section);
    for (const [month, amount] of vals) if (amount !== 0) out.push({ month, account: code || label.slice(0, 20), name: label.slice(0, 120), parent: parents.map(p => p.label).join(' › ').slice(0, 300), line, amount });
  }
  if (!out.length) { console.error('No account rows with figures were read.'); process.exit(1); }

  const B = bridge(out);
  const k = v => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');
  for (const m of B.months) console.log(`${m.month.slice(0, 7)}  revenue ${k(m.revenue)}  cost to serve ${k(m.cost_to_serve)}  sales ${k(m.sales)}  management ${k(m.management)}  overheads ${k(m.overhead)}  EBITDA before discretionary ${k(m.ebitda)}  discretionary ${k(m.discretionary)}  EBITDA ${k(m.ebitda_after)}`);
  console.log('\nThe largest lines sorted as overheads (check none belongs elsewhere):');
  for (const o of B.overheadLines) console.log(`  ${o.account}: ${k(o.amount)}`);
  if (dry) { console.log(`\n--dry-run: ${out.length} rows read, nothing written.`); return; }

  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''), ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    await c.query('BEGIN');
    const months = [...new Set(out.map(r => r.month))];
    await c.query('DELETE FROM model.gl_month WHERE month = ANY($1::date[])', [months]);
    for (const r of out) await c.query('INSERT INTO model.gl_month (month, account, name, parent, line, amount, source) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [r.month, r.account, r.name, r.parent || null, r.line, r.amount, require('path').basename(file)]);
    await c.query('COMMIT');
    console.log(`\nwrote ${out.length} rows for ${months.length} months to model.gl_month`);
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { await c.end(); }
})().catch(e => { console.error(e.message); process.exit(1); });
