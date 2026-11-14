// Reads a QuickBooks "Profit and Loss by Month" export (CSV) into posting lines, and sums them into the cost pools the
// route cost and the other rates are built from (model/rates.js MODEL.pools). Theran uploads it on Settings › Route cost
// (admin only), so the rates can be rebuilt from the same twelve months as the volumes (14 November 2026).
// The same reading as scripts/load_gl.js: a "Total ..." row is a subtotal and is skipped, so nothing counts twice.
// No DOM, no Node.

export function csv(text) {
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
export function monthOf(h) {
  const m = String(h || '').trim().toLowerCase().match(/^([a-z]{3})[a-z]*\.?\s*-?\s*(\d{4})$/);
  return m && MONTHS[m[1]] ? `${m[2]}-${String(MONTHS[m[1]]).padStart(2, '0')}-01` : null;
}
const money = s => { const t = String(s || '').replace(/[$,\s]/g, ''); if (!t) return null; const neg = /^\(.*\)$/.test(t) || t.startsWith('-'); const n = parseFloat(t.replace(/[()-]/g, '')); return Number.isFinite(n) ? (neg ? -n : n) : null; };
export const codeOf = label => { const m = /^\s*(\d{4,8})\b/.exec(String(label || '')); return m ? m[1] : null; };

// → { months: ['2025-09-01', ...], lines: [{ month, code, name, parents: [codes], section, amount }] }
export function parsePL(text) {
  const rows = csv(String(text || '').replace(/^﻿/, ''));
  const hi = rows.findIndex(r => r.filter(monthOf).length >= 1);
  if (hi < 0) throw new Error('No header row with months (like "Sep 2025") found. In QuickBooks, display columns by Months.');
  const cols = rows[hi].map((h, i) => [i, monthOf(h)]).filter(([, m]) => m);
  let section = null;
  const parents = [], lines = [];
  for (const r of rows.slice(hi + 1)) {
    const label = String(r[0] || '').trim();
    if (!label) continue;
    const low = label.toLowerCase();
    if (/^(total )?(income|revenue)$/.test(low) || low === 'ordinary income/expense') { if (!low.startsWith('total')) section = 'income'; continue; }
    if (/^(cost of goods sold|cost of sales|expenses?)$/.test(low)) { section = 'expense'; parents.length = 0; continue; }
    if (/^other (income|expenses?)$/.test(low)) { section = 'other'; parents.length = 0; continue; }
    if (/^(gross profit|net (operating )?income|net other income|net ordinary income|net income)/.test(low)) continue;
    if (low.startsWith('total ')) { const name = label.slice(6).trim(), k = parents.map(p => p.label).lastIndexOf(name); if (k >= 0) parents.length = k; continue; }
    if (!section) continue;
    const vals = cols.map(([i, m]) => [m, money(r[i])]).filter(([, v]) => v != null);
    if (!vals.length) { parents.push({ label, code: codeOf(label) }); continue; }
    for (const [month, amount] of vals) if (amount) lines.push({ month, code: codeOf(label), name: label.slice(0, 120), parents: parents.map(p => p.code).filter(Boolean), section, amount });
  }
  if (!lines.length) throw new Error('No account rows with figures were read.');
  return { months: [...new Set(lines.map(l => l.month))].sort(), lines };
}

// Which posting lines belong to each pool: the pool's account codes as the model names them ("7335700 Drivers payroll",
// "7028 Bldg Exp and 7335660 Maintenance payroll"), the account itself or anything under it; "less X" leaves out lines
// whose name holds X ("7095 Equipment less Allegheny").
export function poolRules(pools) {
  return Object.fromEntries(Object.entries(pools).map(([p, x]) => {
    const text = String(x.accounts || ''), codes = [...text.matchAll(/\b(\d{4,8})\b/g)].map(m => m[1]);
    const less = [...text.matchAll(/\bless ([A-Za-z][A-Za-z ]+?)(?:,| and |$)/g)].map(m => m[1].trim().toLowerCase());
    return [p, { codes, less }];
  }));
}
const inPool = (l, rule) => (rule.codes.includes(l.code) || l.parents.some(c => rule.codes.includes(c))) && !rule.less.some(w => l.name.toLowerCase().includes(w));

// Each pool's total over the months chosen, and the lines behind it, so Settings can show the build line by line.
//   poolsFrom(parsed, pools, months) → { [pool]: { amount, lines: [{ code, name, amount }] } }
export function poolsFrom(P, pools, months) {
  const rules = poolRules(pools), want = new Set(months), out = {};
  for (const [p, rule] of Object.entries(rules)) {
    const by = new Map();
    for (const l of P.lines) if (l.section !== 'income' && want.has(l.month) && inPool(l, rule)) { const k = (l.code || '') + '|' + l.name; by.set(k, (by.get(k) || 0) + l.amount); }
    const lines = [...by].map(([k, amount]) => { const [code, ...n] = k.split('|'); return { code, name: n.join('|'), amount }; }).sort((a, b) => b.amount - a.amount);
    out[p] = { amount: lines.reduce((t, l) => t + l.amount, 0), lines, matched: rule.codes.length > 0 };
  }
  return out;
}
