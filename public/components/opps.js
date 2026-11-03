// Customers › Opportunities: one ranked list of the next conversations, merging what the separate
// lists used to show, each sized by the same function as its own list so the figures agree:
//   cross   a line the account doesn't buy, at what comparable accounts spend (whitespace.js) est.
//   price   a service or storage under the book's median, the gap at the median (levers.js)
//   slip    down on its own run over three months: the monthly drop, a year (levers.js)
//   round   no rate moved in two years: the typical 8% on its service (lists.js)
//   overdue boxes past retention review: destruction once at the median R3 fee (levers.js)
//   route   a far area sent from Operations, sized there (opsdata.js costlyAreas) and held in app.opportunity
// Each has a key (kind:level1[:line]), a value a year, a reason, a draft opener, and, from
// app.opportunity (server/sales.js), an owner and a status.
//   opportunities({ C, PR, CA, M }, statuses) → { rows, totals, won }
import * as Fmt from './format.js';
import { serviceGaps, storageGaps, slippingAccounts, overdueBoxes } from './levers.js';
import { buildWhitespace, LINES } from './whitespace.js';
import { OPENERS } from './lists.js';
import { titleCase } from './data.js';
import { moveReason } from './series.js';

const CITADEL = 6714;
export const KINDS = {
  cross: 'Cross-sell', price: 'Price gap', slip: 'Win back', round: 'Rate round', overdue: 'Overdue boxes', route: 'Route',
};
export const STATUSES = ['open', 'contacted', 'quoted', 'won', 'lost'];
export const OWNERS = ['Mike Kelly', 'Anne Sterne', 'Trisha Rooney'];
const k$ = v => Fmt.money(v, { short: 'hyphen' });
const lineName = Object.fromEntries(LINES.map(l => [l.key, l.name]));
const lc = n => n === 'ITAD' ? n : n.toLowerCase();

export function opportunities({ C, PR, CA, M }, statuses = {}) {
  const rows = [];
  const push = r => { if (r.level1 === CITADEL || !(r.value > 0)) return; rows.push(r); };
  // cross-sell: every line each large account doesn't buy, sized from comparable accounts
  const W = buildWhitespace(M, { exclude: [CITADEL], top: 120 });
  for (const a of W.rows) for (const [line, c] of Object.entries(a.cells)) {
    if (c.have || !(c.opp > 0)) continue;
    const name = titleCase(a.customer);
    push({ key: `cross:${a.level1}:${line}`, kind: 'cross', level1: a.level1, name, line, value: c.opp, modelled: true,
      short: `Doesn't buy ${lc(lineName[line])} yet`,
      reason: `Doesn't buy ${lc(lineName[line])} yet: ${c.basis}.`,
      opener: line === 'shred' ? OPENERS.nodestroy(name) : `We look after your ${a.cells.storage && a.cells.storage.have ? 'records' : 'shredding'} already. Could we take ${lc(lineName[line])} off your hands too, on the same visits?` });
  }
  // price: each service line under the median, and storage under the box-weighted median
  const meds = new Map();
  for (const r of PR.rates) { if (r.modal_rate > 0) (meds.get(r.servcode) || meds.set(r.servcode, []).get(r.servcode)).push(r.modal_rate); }
  const sg = serviceGaps(PR);
  for (const a of sg.values()) {
    const name = titleCase(a.customer);
    push({ key: `price:${a.level1}:svc`, kind: 'price', level1: a.level1, name, line: 'service', value: a.worth * 12,
      short: `${titleCase(a.top.service)} at ${Fmt.money(a.top.rate, { dp: 2 })} against a ${Fmt.money(a.top.med, { dp: 2 })} median`,
      reason: `${titleCase(a.top.service)} at ${Fmt.money(a.top.rate, { dp: 2 })} against a ${Fmt.money(a.top.med, { dp: 2 })} median${a.worth * 12 > a.top.worth * 12 + 1 ? `, with other lines under too` : ''}: ${k$(a.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: titleCase(a.top.service).toLowerCase() }) });
  }
  for (const r of storageGaps(PR).rows) {
    const name = titleCase(r.customer);
    push({ key: `price:${r.level1}:storage`, kind: 'price', level1: r.level1, name, line: 'storage', value: r.worth * 12,
      short: `Storage at ${Fmt.money(r.rate, { dp: 3 })} a box against a ${Fmt.money(r.med, { dp: 3 })} median`,
      reason: `Storage at ${Fmt.money(r.rate, { dp: 3 })} a box against ${Fmt.money(r.med, { dp: 3 })} on ${Fmt.num(r.boxes)} boxes: ${k$(r.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: 'storage' }) });
  }
  // win back: still billing, down on its own run
  for (const d of slippingAccounts(C)) {
    const name = titleCase(d.customer);
    push({ key: `slip:${d.level1}`, kind: 'slip', level1: d.level1, name, value: -d.move.d * 12,
      short: (s => s[0].toUpperCase() + s.slice(1))(moveReason(d.move, k$)),
      reason: `${k$(d.move.last3)} a month over the last three months against its own ${k$(d.move.run)}: ${moveReason(d.move, k$)}.`, opener: OPENERS.slipping(name) });
  }
  // rate rounds: no rate moved in two years and no price gap already listed
  for (const c of CA) if (c.not_raised_2y && !sg.has(c.level1)) {
    const name = titleCase(c.customer);
    push({ key: `round:${c.level1}`, kind: 'round', level1: c.level1, name, value: c.service * 0.08,
      short: 'No rate moved in two years',
      reason: `No rate moved in two years on ${k$(c.service)} of service a year: ${k$(c.service * 0.08)} at the typical 8% rise.`, opener: OPENERS.rounds(name) });
  }
  // overdue boxes: destruction once, and the storage it ends (said, not counted)
  const ob = overdueBoxes(CA, PR);
  for (const r of ob.rows) if (r.boxes >= 50 && r.once > 0) {
    const name = titleCase(r.customer);
    push({ key: `overdue:${r.level1}`, kind: 'overdue', level1: r.level1, name, value: r.once, once: true,
      short: `${Fmt.num(r.boxes)} boxes past their review; needs client sign-off`,
      reason: `${Fmt.num(r.boxes)} boxes past their retention review: ${k$(r.once)} of destruction once, ending ${k$(r.lost * 12)} a year of storage. A one-off, and it needs the client's sign-off.`,
      opener: OPENERS.overdue(name, { boxes: Math.round(r.boxes) }) });
  }
  // sent from another screen: only what someone sent, as they sent it. A far area from Operations; a cross-sell gap the list
  // above does not carry, because the account is below its 120 or the line is bought but low for its size
  const nameOf = new Map(((M && M.accounts) || []).map(a => [a.level1, a.customer]));
  const have = new Set(rows.map(r => r.key));
  for (const [key, st] of Object.entries(statuses)) {
    if (!key.startsWith('cross:') || have.has(key) || !nameOf.has(st.level1)) continue;
    const name = titleCase(nameOf.get(st.level1)), line = key.split(':')[2];
    push({ key, kind: 'cross', level1: st.level1, name, line, value: st.value, modelled: true, short: st.note || 'Sent from Cross-sell', reason: st.note || 'Sent from Cross-sell.',
      opener: `We look after some of your work already. Could we talk about ${lc(lineName[line] || 'the rest of it')} on the same visit?` });
  }
  for (const [key, st] of Object.entries(statuses)) {
    if (!key.startsWith('route:') || !nameOf.has(st.level1)) continue;
    const name = titleCase(nameOf.get(st.level1));
    push({ key, kind: 'route', level1: st.level1, name, value: st.value, modelled: true, short: st.note || 'A far area sent from Operations', reason: st.note || 'A far area sent from Operations.',
      opener: `We have been looking at how we serve your site at ${key.split(':')[2]}. Could we talk through the visit schedule?` });
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

// The list by account: each account once, its opportunities inside it, ranked by its largest. An account's
// opportunities overlap (winning back what slipped, and pricing the same work up, are not two sums of money), so
// the total counts each account's largest once a year, and one-off destruction apart.
export function byAccount(rows) {
  const m = new Map();
  for (const r of rows) (m.get(r.level1) || m.set(r.level1, { level1: r.level1, name: r.name, items: [] }).get(r.level1)).items.push(r);
  const out = [...m.values()].map(a => {
    a.items.sort((x, y) => y.rank - x.rank);
    const yearly = a.items.filter(r => !r.once).map(r => r.value), once = a.items.filter(r => r.once);
    a.largest = yearly.length ? Math.max(...yearly) : 0;
    a.once = once.reduce((t, r) => t + r.value, 0);
    a.rank = a.items[0].rank;
    a.kinds = [...new Set(a.items.map(r => r.kind))];
    a.owner = (a.items.find(r => r.owner) || {}).owner || null;
    return a;
  }).sort((x, y) => y.rank - x.rank);
  return { rows: out, accounts: out.length, largest: out.reduce((t, a) => t + a.largest, 0), once: out.reduce((t, a) => t + a.once, 0) };
}

// An account's best move: the largest a year; if it has none, its largest one-off.
export function bestMove(items) {
  const by = list => list.slice().sort((a, b) => b.value - a.value)[0];
  return by(items.filter(r => !r.once)) || by(items);
}
// what its row shows, from the moves left after any filter
export function accountRow(items) {
  const yearly = items.filter(r => !r.once).map(r => r.value);
  return { best: bestMove(items), year: yearly.length ? Math.max(...yearly) : 0, once: items.filter(r => r.once).reduce((t, r) => t + r.value, 0), count: items.length };
}

// what was won, by month the status was set: the value as it stood when it was won
export function wonIn(statuses, month = new Date().toISOString().slice(0, 7)) {
  const won = Object.values(statuses || {}).filter(s => s.status === 'won' && String(s.at || '').slice(0, 7) === month);
  return { month, n: won.length, value: won.reduce((t, s) => t + (Number(s.value) || 0), 0), rows: won };
}
