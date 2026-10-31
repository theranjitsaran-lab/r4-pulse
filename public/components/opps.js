// Customers › Opportunities: one ranked list of the next conversations, merging what the separate
// lists used to show, each sized by the same function as its own list so the figures agree:
//   cross   a line the account doesn't buy, at what comparable accounts spend (whitespace.js) ◇
//   price   a service or storage under the book's median, the gap at the median (levers.js)
//   slip    down on its own run over three months: the monthly drop, a year (levers.js)
//   round   no rate moved in two years: the typical 8% on its service (lists.js)
//   overdue boxes past retention review: destruction once at the median R3 fee (levers.js)
// Each has a key (kind:level1[:line]), a value a year, a reason, a draft opener, and, from
// app.opportunity (server/sales.js), an owner and a status.
//   opportunities({ C, PR, CA, M }, statuses) → { rows, totals, won }
import { serviceGaps, storageGaps, slippingAccounts, overdueBoxes } from './levers.js';
import { buildWhitespace, LINES } from './whitespace.js';
import { OPENERS } from './lists.js';
import { titleCase } from './data.js';
import { moveReason } from './series.js';

const CITADEL = 6714;
export const KINDS = {
  cross: 'Cross-sell', price: 'Price gap', slip: 'Win back', round: 'Rate round', overdue: 'Overdue boxes',
};
export const STATUSES = ['open', 'contacted', 'quoted', 'won', 'lost'];
const k$ = v => '$' + (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'K' : Math.round(v));
const lineName = Object.fromEntries(LINES.map(l => [l.key, l.name]));

export function opportunities({ C, PR, CA, M }, statuses = {}) {
  const rows = [];
  const push = r => { if (r.level1 === CITADEL || !(r.value > 0)) return; rows.push(r); };
  // cross-sell: every line each large account doesn't buy, sized from comparable accounts
  const W = buildWhitespace(M, { exclude: [CITADEL], top: 120 });
  for (const a of W.rows) for (const [line, c] of Object.entries(a.cells)) {
    if (c.have || !(c.opp > 0)) continue;
    const name = titleCase(a.customer);
    push({ key: `cross:${a.level1}:${line}`, kind: 'cross', level1: a.level1, name, line, value: c.opp, modelled: true,
      reason: `Doesn't buy ${lineName[line].toLowerCase()} yet: ${c.basis}.`,
      opener: line === 'shred' ? OPENERS.nodestroy(name) : `We look after your ${a.cells.storage && a.cells.storage.have ? 'records' : 'shredding'} already. Could we take ${lineName[line].toLowerCase()} off your hands too, on the same visits?` });
  }
  // price: each service line under the median, and storage under the box-weighted median
  const meds = new Map();
  for (const r of PR.rates) { if (r.modal_rate > 0) (meds.get(r.servcode) || meds.set(r.servcode, []).get(r.servcode)).push(r.modal_rate); }
  const sg = serviceGaps(PR);
  for (const a of sg.values()) {
    const name = titleCase(a.customer);
    push({ key: `price:${a.level1}:svc`, kind: 'price', level1: a.level1, name, line: 'service', value: a.worth * 12,
      reason: `${titleCase(a.top.service)} at $${a.top.rate.toFixed(2)} against a $${a.top.med.toFixed(2)} median${a.worth * 12 > a.top.worth * 12 + 1 ? `, with other lines under too` : ''}: ${k$(a.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: titleCase(a.top.service).toLowerCase() }) });
  }
  for (const r of storageGaps(PR).rows) {
    const name = titleCase(r.customer);
    push({ key: `price:${r.level1}:storage`, kind: 'price', level1: r.level1, name, line: 'storage', value: r.worth * 12,
      reason: `Storage at $${r.rate.toFixed(3)} a box against $${r.med.toFixed(3)} on ${Math.round(r.boxes).toLocaleString('en-US')} boxes: ${k$(r.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: 'storage' }) });
  }
  // win back: still billing, down on its own run
  for (const d of slippingAccounts(C)) {
    const name = titleCase(d.customer);
    push({ key: `slip:${d.level1}`, kind: 'slip', level1: d.level1, name, value: -d.move.d * 12,
      reason: `${k$(d.move.last3)} a month over the last three months against its own ${k$(d.move.run)}: ${moveReason(d.move, k$)}.`, opener: OPENERS.slipping(name) });
  }
  // rate rounds: no rate moved in two years and no price gap already listed
  for (const c of CA) if (c.not_raised_2y && !sg.has(c.level1)) {
    const name = titleCase(c.customer);
    push({ key: `round:${c.level1}`, kind: 'round', level1: c.level1, name, value: c.service * 0.08,
      reason: `No rate moved in two years on ${k$(c.service)} of service a year: ${k$(c.service * 0.08)} at the typical 8% rise.`, opener: OPENERS.rounds(name) });
  }
  // overdue boxes: destruction once, and the storage it ends (said, not counted)
  const ob = overdueBoxes(CA, PR);
  for (const r of ob.rows) if (r.boxes >= 50 && r.once > 0) {
    const name = titleCase(r.customer);
    push({ key: `overdue:${r.level1}`, kind: 'overdue', level1: r.level1, name, value: r.once, once: true,
      reason: `${Math.round(r.boxes).toLocaleString('en-US')} boxes past their retention review: ${k$(r.once)} of destruction once, ending ${k$(r.lost * 12)} a year of storage.`,
      opener: OPENERS.overdue(name, { boxes: Math.round(r.boxes) }) });
  }
  // what the team has said about each
  for (const r of rows) {
    const s = statuses[r.key];
    r.status = s ? s.status : 'open'; r.owner = s ? s.owner : null; r.at = s ? s.at : null; r.note = s ? s.note : null;
    if (s && s.value != null && (s.status === 'won' || s.status === 'lost')) r.closedValue = s.value;
  }
  // ranked by dollars a year; a one-off (destruction of overdue boxes) at a quarter of its value
  for (const r of rows) r.rank = r.once ? r.value / 4 : r.value;
  rows.sort((a, b) => b.rank - a.rank);
  const totals = Object.fromEntries(Object.keys(KINDS).map(k => [k, { n: 0, value: 0 }]));
  for (const r of rows) if (r.status !== 'won' && r.status !== 'lost') { totals[r.kind].n++; totals[r.kind].value += r.value; }
  return { rows, totals, won: wonIn(statuses) };
}

// what was won, by month the status was set: the value as it stood when it was won
export function wonIn(statuses, month = new Date().toISOString().slice(0, 7)) {
  const won = Object.values(statuses || {}).filter(s => s.status === 'won' && String(s.at || '').slice(0, 7) === month);
  return { month, n: won.length, value: won.reduce((t, s) => t + (Number(s.value) || 0), 0), rows: won };
}
