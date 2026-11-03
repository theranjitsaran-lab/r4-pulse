// Customers › Opportunities: one ranked list of the next conversations, merging what the separate
// lists used to show, each sized by the same function as its own list so the figures agree:
//   cross   a line the account doesn't buy, at what comparable accounts spend (whitespace.js) est.
//   price   a service or storage under the book's median, the gap at the median (levers.js)
//   slip    down on its own run over three months: the monthly drop, a year (levers.js)
//   round   no rate moved in two years: the typical 8% on its service (lists.js)
//   overdue boxes past retention review: destruction once at the median R3 fee (levers.js)
//   route   a far area sent from Operations, sized there (opsdata.js costlyAreas) and held in app.opportunity
// Each carries conf, how sure it is (whitespace.js gapConfidence), and code, where Quote opens on it.
// Each has a key (kind:level1[:line]), a value a year, a reason, a draft opener, and, from
// app.opportunity (server/sales.js), an owner and a status.
//   opportunities({ C, PR, CA, M }, statuses) → { rows, totals, won }
//   applyStatuses(rows, statuses, M)   what the team has said, and what they have sent or touched that the list no longer carries
//   byAccount(rows), accountState(a), pipeline(G), kindMix(G), oppsPoints(G)
import * as Fmt from './format.js';
import { serviceGaps, storageGaps, slippingAccounts, overdueBoxes, PRICED } from './levers.js';
import { buildWhitespace, LINES, gapConfidence, lineCodes } from './whitespace.js';
import { accountKind, kindPlural } from './acctkind.js';
import { OPENERS } from './lists.js';
import { titleCase } from './data.js';
import { moveReason } from './series.js';

const CITADEL = 6714;
export const KINDS = {
  cross: 'Cross-sell', price: 'Price gap', slip: 'Win back', round: 'Rate round', overdue: 'Overdue boxes', route: 'Route',
};
export const STATUSES = ['open', 'contacted', 'agreed', 'won', 'lost'];
export const STATUS_NAMES = { open: 'Open', contacted: 'Contacted', agreed: 'Agreed', won: 'Won', lost: 'Lost' };
// an owner is a login, so "Mine" matches whoever is signed in
export const OWNERS = ['anne', 'mike', 'trisha', 'theran'];
export const ownerName = o => { const s = String(o || ''); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const k$ = v => Fmt.money(v, { short: 'hyphen' });
const lineName = Object.fromEntries(LINES.map(l => [l.key, l.name]));
const lc = n => n === 'ITAD' ? n : n.toLowerCase();

export function opportunities({ C, PR, CA, M }, statuses = {}) {
  const rows = [];
  const push = r => { if (r.level1 === CITADEL || !(r.value > 0)) return; rows.push(r); };
  // cross-sell: every line each large account doesn't buy, sized from comparable accounts
  const W = buildWhitespace(M, { exclude: [CITADEL], top: 120 }), codes = lineCodes(M, PRICED);
  for (const a of W.rows) for (const [line, c] of Object.entries(a.cells)) {
    if (c.have || !(c.opp > 0)) continue;
    const name = titleCase(a.customer);
    push({ key: `cross:${a.level1}:${line}`, kind: 'cross', level1: a.level1, name, line, value: c.opp, modelled: true, conf: gapConfidence(c), code: codes[line] || null,
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
    push({ key: `price:${a.level1}:svc`, kind: 'price', level1: a.level1, name, line: 'service', value: a.worth * 12, conf: 3, code: a.top.servcode,
      short: `${titleCase(a.top.service)} at ${Fmt.money(a.top.rate, { dp: 2 })} against a ${Fmt.money(a.top.med, { dp: 2 })} median`,
      reason: `${titleCase(a.top.service)} at ${Fmt.money(a.top.rate, { dp: 2 })} against a ${Fmt.money(a.top.med, { dp: 2 })} median${a.worth * 12 > a.top.worth * 12 + 1 ? `, with other lines under too` : ''}: ${k$(a.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: titleCase(a.top.service).toLowerCase() }) });
  }
  for (const r of storageGaps(PR).rows) {
    const name = titleCase(r.customer);
    push({ key: `price:${r.level1}:storage`, kind: 'price', level1: r.level1, name, line: 'storage', value: r.worth * 12, conf: 3, code: 'STO',
      short: `Storage at ${Fmt.money(r.rate, { dp: 3 })} a box against a ${Fmt.money(r.med, { dp: 3 })} median`,
      reason: `Storage at ${Fmt.money(r.rate, { dp: 3 })} a box against ${Fmt.money(r.med, { dp: 3 })} on ${Fmt.num(r.boxes)} boxes: ${k$(r.worth * 12)} a year at the median.`,
      opener: OPENERS.gap(name, { service: 'storage' }) });
  }
  // win back: still billing, down on its own run
  for (const d of slippingAccounts(C)) {
    const name = titleCase(d.customer);
    push({ key: `slip:${d.level1}`, kind: 'slip', level1: d.level1, name, value: -d.move.d * 12, conf: 3,
      short: (s => s[0].toUpperCase() + s.slice(1))(moveReason(d.move, k$)),
      reason: `${k$(d.move.last3)} a month over the last three months against its own ${k$(d.move.run)}: ${moveReason(d.move, k$)}.`, opener: OPENERS.slipping(name) });
  }
  // rate rounds: no rate moved in two years and no price gap already listed
  for (const c of CA) if (c.not_raised_2y && !sg.has(c.level1)) {
    const name = titleCase(c.customer);
    push({ key: `round:${c.level1}`, kind: 'round', level1: c.level1, name, value: c.service * 0.08, conf: 3,
      short: 'No rate moved in two years',
      reason: `No rate moved in two years on ${k$(c.service)} of service a year: ${k$(c.service * 0.08)} at the typical 8% rise.`, opener: OPENERS.rounds(name) });
  }
  // overdue boxes: destruction once, and the storage it ends (said, not counted)
  const ob = overdueBoxes(CA, PR);
  for (const r of ob.rows) if (r.boxes >= 50 && r.once > 0) {
    const name = titleCase(r.customer);
    push({ key: `overdue:${r.level1}`, kind: 'overdue', level1: r.level1, name, value: r.once, once: true, conf: 3, ends: r.lost * 12,
      short: `${Fmt.num(r.boxes)} boxes past their review; needs client sign-off`,
      reason: `${Fmt.num(r.boxes)} boxes past their retention review: ${k$(r.once)} of destruction once, ending ${k$(r.lost * 12)} a year of storage. A one-off, and it needs the client's sign-off.`,
      opener: OPENERS.overdue(name, { boxes: Math.round(r.boxes) }) });
  }
  const said = applyStatuses(rows, statuses, M);
  const totals = Object.fromEntries(Object.keys(KINDS).map(k => [k, { n: 0, value: 0 }]));
  for (const r of said) if (!r.stale && r.status !== 'won' && r.status !== 'lost') { totals[r.kind].n++; totals[r.kind].value += r.value; }
  return { rows: said, totals, won: wonIn(statuses) };
}

// The list as the team has left it: each move's owner, status and next step, plus what someone sent or touched that the worked-out
// list does not carry today. A far area from Operations; a cross-sell gap below the list's 120 accounts or bought but low; and a move
// the data no longer supports, which stays at its saved value, says so, and adds to no total. Ranked by dollars a year; a one-off
// (destruction of overdue boxes) at a quarter of its value.
export function applyStatuses(base, statuses = {}, M = null) {
  const rows = base.map(r => { const s = statuses[r.key]; return { ...r, status: s ? s.status : 'open', owner: s ? s.owner || null : null, at: s ? s.at : null, who: s ? s.who : null, note: s ? s.note : null, next: s ? s.next_step || null : null, ...(s && s.value != null && (s.status === 'won' || s.status === 'lost') ? { closedValue: s.value } : {}) }; });
  const have = new Set(base.map(r => r.key)), names = new Map(((M && M.accounts) || []).map(a => [a.level1, a.customer]));
  let wide = null;
  for (const [key, st] of Object.entries(statuses)) {
    const [kind, , third] = key.split(':');
    if (have.has(key) || !KINDS[kind] || st.level1 === CITADEL || !names.has(st.level1) || !(st.value > 0)) continue;
    const name = titleCase(names.get(st.level1)), told = st.note || 'Sent to this list.';
    let extra = { stale: true, conf: 1, short: 'No longer sized', reason: `No longer sized by the data: ${told}` };
    if (kind === 'route') extra = { conf: 2, short: told, reason: told, opener: /^\d{5}$/.test(third || '') ? `We have been looking at how we serve your site at ${third}. Could we talk through the visit schedule?` : 'We have been looking at how we serve you. Could we talk through the visit schedule?' };
    if (kind === 'price' && String(third || '').startsWith('fix-')) extra = { conf: 2, short: told, reason: told, opener: 'We are reviewing what this work costs us to do. Could we talk through the rate?' };
    if (kind === 'cross') {
      wide = wide || buildWhitespace(M, { exclude: [CITADEL], top: 200 });
      const row = wide.rows.find(r => r.level1 === st.level1), c = row && row.cells[third];
      if (c && (c.low || (!c.have && c.opp > 0))) extra = { conf: gapConfidence(c), code: lineCodes(M, PRICED)[third] || null, short: told, reason: c.note || told };
    }
    rows.push({ key, kind, level1: st.level1, name, line: kind === 'cross' ? third : null, value: st.value, modelled: true, opener: `We look after some of your work already. Could we talk about ${lc(lineName[third] || 'how we serve you')}?`, ...extra, status: st.status, owner: st.owner || null, at: st.at, who: st.who, note: st.note, next: st.next_step || null });
  }
  for (const r of rows) r.rank = r.stale ? 0 : r.once ? r.value / 4 : r.value;
  return rows.sort((a, b) => b.rank - a.rank);
}

// The list by account: each account once, its opportunities inside it, ranked by its largest. An account's
// opportunities overlap (winning back what slipped, and pricing the same work up, are not two sums of money), so
// the total counts each account's largest once a year, and one-off destruction apart.
export function byAccount(rows) {
  const m = new Map();
  for (const r of rows) (m.get(r.level1) || m.set(r.level1, { level1: r.level1, name: r.name, items: [] }).get(r.level1)).items.push(r);
  const out = [...m.values()].map(a => {
    a.items.sort((x, y) => y.rank - x.rank);
    const live = a.items.filter(r => !r.stale), yearly = live.filter(r => !r.once).map(r => r.value), once = live.filter(r => r.once);
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

// Where an account stands: its dollars are always its best move's, once. Its status is the furthest along of its moves, and that move is
// the one the row writes to, so work on a smaller move is never hidden behind a best move still reading Open.
export function accountState(a) {
  const live = a.items.filter(r => !r.stale), list = live.length ? live : a.items, best = bestMove(list);
  const with_ = s => list.filter(r => r.status === s).sort((x, y) => y.value - x.value)[0];
  const open = list.filter(r => r.status !== 'won' && r.status !== 'lost');
  const lead = with_('agreed') || with_('contacted') || (best.status === 'won' || best.status === 'lost' ? (open.length ? bestMove(open) : best) : best);
  const owner = lead.owner || best.owner || (a.items.find(r => r.owner) || {}).owner || null;
  return { best, lead, status: lead.status, owner, next: lead.next || null, year: a.largest, once: a.once, count: a.items.length, conf: best.conf || 1 };
}

// each account once, at its best move
export function pipeline(G) {
  const out = Object.fromEntries(STATUSES.map(s => [s, { status: s, name: STATUS_NAMES[s], n: 0, value: 0, once: 0 }]));
  for (const a of G.rows) { const t = accountState(a), x = out[t.status]; x.n++; x.value += t.year; x.once += t.once; }
  return STATUSES.map(s => out[s]);
}

// What kind of money it is: each account at its best yearly move; overdue boxes apart, because they are a one-off.
export function kindMix(G) {
  const out = Object.fromEntries(Object.keys(KINDS).map(k => [k, { kind: k, name: KINDS[k], n: 0, value: 0, once: false }]));
  for (const a of G.rows) {
    const yearly = a.items.filter(r => !r.stale && !r.once);
    if (yearly.length) { const b = bestMove(yearly), x = out[b.kind]; x.n++; x.value += b.value; }
    if (a.once > 0) { const x = out.overdue; x.n++; x.value += a.once; x.once = true; }
  }
  return Object.values(out).filter(x => x.n).sort((p, q) => Number(p.once) - Number(q.once) || q.value - p.value);
}
// an account belongs to a kind if its best move is that kind; to overdue boxes if it has any
export const inKind = (a, kind) => kind === 'overdue' ? a.once > 0 : (m => m.length > 0 && bestMove(m).kind === kind)(a.items.filter(r => !r.stale && !r.once));

// Three points, from the list: who owns it, the biggest kind of money, and the clearest run of quick conversations.
export function oppsPoints(G, fmt) {
  const st = G.rows.map(a => ({ a, t: accountState(a) })), owned = st.filter(x => x.t.owner), free = st.filter(x => !x.t.owner);
  const pts = [];
  if (!owned.length) { const five = st.slice().sort((x, y) => y.t.year - x.t.year).slice(0, 5).reduce((t, x) => t + x.t.year, 0); pts.push({ key: 'own', tone: 'r', lead: 'Nobody owns a move yet:', rest: `${fmt(G.largest)} a year and ${fmt(G.once)} of one-offs sit unassigned. The five largest accounts hold ${fmt(five)} a year.` }); }
  else pts.push({ key: 'own', tone: free.length > owned.length ? 'r' : 'a', lead: `${Fmt.count(owned.length)} of ${Fmt.count(G.accounts)} accounts have an owner.`, rest: free.length ? `${Fmt.count(free.length)} do not, worth ${fmt(free.reduce((t, x) => t + x.t.year, 0))} a year.` : 'Every account is with someone.' });
  const top = kindMix(G).find(x => !x.once);
  if (top) { const lead = st.filter(x => inKind(x.a, top.kind)).sort((p, q) => q.t.year - p.t.year)[0]; pts.push({ key: 'kind', tone: 'a', lead: `${top.name} is the biggest money:`, rest: `${Fmt.count(top.n)} accounts, ${fmt(top.value)} a year${lead ? `, led by ${lead.a.name} at ${fmt(lead.t.year)}` : ''}.` }); }
  // the clearest group: storage price gaps at one kind of organisation, a conversation each
  const byKind = new Map();
  for (const a of G.rows) for (const r of a.items) if (r.kind === 'price' && r.line === 'storage' && !r.stale && r.status === 'open') { const k = accountKind(a.name); (byKind.get(k) || byKind.set(k, []).get(k)).push(r); }
  const group = [...byKind].map(([k, v]) => ({ k, v: v.sort((p, q) => q.value - p.value).slice(0, 3) })).filter(g => g.v.length >= 2).map(g => ({ ...g, sum: g.v.reduce((t, r) => t + r.value, 0) })).sort((p, q) => q.sum - p.sum)[0];
  if (group) pts.push({ key: 'quick', tone: 'g', lead: `${Fmt.count(group.v.length)} ${kindPlural(group.k)} pay under the book for storage:`, rest: `${group.v.map(r => r.name).join(', ')}. One conversation each, ${fmt(group.sum)} a year at the median.` });
  return pts;
}
