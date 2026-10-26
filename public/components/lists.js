// The three lists, one per person, each from the same functions the app and the morning emails use:
//   Anne's Monday     the accounts that changed (gone quiet) and the conversations worth having,
//                     each with the fact behind it and a draft opening line she rewrites
//   Mike's 06:30      yesterday's routes that were not normal, and what is booked for the next day
//   Trisha's view     what changed for the business, and what the team did last week
// A line someone marked "already knew" or "not right" in the last 30 days is held back from them.
import { seriesOf, moveReason } from './series.js';
import { slippingAccounts, serviceGaps, storageGaps, CITADEL } from './levers.js';
import { moneyK } from './chart.js';

const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/(?!^)\b(Of|And|The|For|At|In)\b/g, w => w.toLowerCase()).replace(/\b(Llp|Llc|Inc|Pc|Icu|Cboe)\b/g, w => w.toUpperCase());
const routeName = r => /\d/.test(r || '') ? r : title(r);
const dayName = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const HOLD_DAYS = 30;

export const OPENERS = {
  slipping: n => `We've seen less work from ${n} over the last two months. Is anything changing on your side we should know about?`,
  gap: (n, x) => `Your ${x.service} rate hasn't kept pace with what similar clients pay. Could we talk about bringing it in line?`,
  rounds: n => `Your rates haven't moved in two years. We're reviewing them for the new year and wanted to talk with you first.`,
  overdue: (n, x) => `${x.boxes.toLocaleString('en-US')} of your boxes are past their retention date. Shall we arrange secure destruction?`,
  nodestroy: n => `You store your records with us but shred elsewhere. We can collect and destroy on the same visit.`,
  quiet: n => `We haven't been out to you for a couple of weeks. Is everything all right with the schedule?`,
};

// lines held back for a person: key|subject they marked knew or wrong in the last 30 days
export function heldFor(feedback, who, now = Date.now()) {
  const from = now - HOLD_DAYS * 864e5;
  return new Set((feedback || []).filter(f => f.who === who && ['knew', 'wrong'].includes(f.verdict) && Date.parse(f.at) > from).map(f => `${f.key}|${f.subject}`));
}
const notHeld = (held, i) => !held.has(`${i.key}|${i.subject}`);

// Every account worth a conversation, ranked by what is at stake a year (the This week list).
export function conversationCandidates({ C, PR, CA, log = [] }) {
  const ser = seriesOf(C), cands = new Map();
  const add = (id, sig) => { if (id === CITADEL) return; const c = cands.get(id) || { level1: id, sigs: [] }; c.sigs.push(sig); cands.set(id, c); };
  for (const d of slippingAccounts(C)) add(d.level1, { key: 'slipping', stake: -d.move.d * 12, ev: `${moveReason(d.move, moneyK)} over the last three months, against its own run`, name: d.customer });
  const sg = serviceGaps(PR);
  for (const a of sg.values()) add(a.level1, { key: 'gap', stake: a.worth * 12, ev: `${title(a.top.service)}: $${a.top.rate.toFixed(2)} against a $${a.top.med.toFixed(2)} median · ${moneyK(a.worth * 12)} a year at the median`, service: title(a.top.service).toLowerCase(), name: a.customer });
  for (const r of storageGaps(PR).rows) add(r.level1, { key: 'gap', stake: r.worth * 12, ev: `storage at $${r.rate.toFixed(3)} a box against $${r.med.toFixed(3)} · ${moneyK(r.worth * 12)} a year at the median`, service: 'storage', name: r.customer });
  for (const c of CA) {
    if (c.not_raised_2y && !sg.has(c.level1)) add(c.level1, { key: 'rounds', stake: c.service * 0.08, ev: `no rate moved in two years on ${moneyK(c.service)} of service · ${moneyK(c.service * 0.08)} a year at the typical 8% rise`, name: c.customer });
    if (c.boxes_review_overdue >= 50) add(c.level1, { key: 'overdue', stake: 0, boxes: Math.round(c.boxes_review_overdue), ev: `${Math.round(c.boxes_review_overdue).toLocaleString('en-US')} boxes past their retention review`, name: c.customer });
    if (c.storage_no_destruction && c.storage > 20000) add(c.level1, { key: 'nodestroy', stake: 0, ev: `${moneyK(c.storage)} of storage a year and no destruction`, name: c.customer });
  }
  const week = Date.now() - 7 * 864e5;
  const handled = new Set(log.filter(l => l.kind === 'call' && Date.parse(l.logged_at) > week).map(l => l.level1));
  return [...cands.values()].filter(c => !handled.has(c.level1)).map(c => {
    c.sigs.sort((a, b) => b.stake - a.stake || (b.boxes || 0) - (a.boxes || 0));
    c.stake = c.sigs.reduce((t, s) => t + s.stake, 0);
    c.name = title((ser.get(c.level1) || {}).customer || c.sigs[0].name);
    c.opener = OPENERS[c.sigs[0].key](c.name, c.sigs[0]);
    return c;
  }).sort((a, b) => b.stake - a.stake || (b.sigs[0].boxes || 0) - (a.sigs[0].boxes || 0));
}

export function anneList({ C, PR, CA, log, feedback, changes, who = 'anne', n = 5 }) {
  const held = heldFor(feedback, who);
  const lines = changes.items.filter(i => i.owner === 'anne' && notHeld(held, i));
  const calls = conversationCandidates({ C, PR, CA, log }).filter(c => notHeld(held, { key: 'call', subject: 'account:' + c.level1 })).slice(0, n);
  return { who, lines, calls };
}

// what is booked for the next working day after the latest done day, by route
export function bookedNext(A) {
  const after = [...new Set(A.routeDays.filter(r => r.date > A.latestDone && r.services > 0).map(r => r.date))].sort()[0];
  if (!after) return null;
  const rows = A.routeDays.filter(r => r.date === after && r.route && r.route !== '--' && r.services > 0).sort((a, b) => b.services - a.services);
  return { date: after, label: dayName(after), services: rows.reduce((t, r) => t + r.services, 0), routes: rows.map(r => ({ route: routeName(r.route), services: r.services, customers: r.customers })) };
}

export function mikeList({ A, feedback, changes, who = 'mike' }) {
  const held = heldFor(feedback, who);
  return { who, lines: changes.items.filter(i => i.owner === 'mike' && notHeld(held, i)), next: bookedNext(A) };
}

// Trisha: the business lines, the team's lines (she sees everything not held from her), and what the
// team did in the last seven days: calls logged by outcome, rates moved, lines marked useful or wrong.
export function trishaView({ CA, log = [], feedback = [], changes, who = 'trisha' }) {
  const held = heldFor(feedback, who), week = Date.now() - 7 * 864e5, month = Date.now() - 30 * 864e5;
  const calls = log.filter(l => l.kind === 'call' && Date.parse(l.logged_at) > week);
  const by = v => calls.filter(l => l.verdict === v).length;
  const ratesMoved = CA.filter(c => c.last_changed && Date.parse(c.last_changed) > month).length;
  const fb = feedback.filter(f => Date.parse(f.at) > week);
  return {
    who, lines: changes.items.filter(i => notHeld(held, i)),
    team: { called: by('called'), emailed: by('emailed'), deferred: by('not_this_week'), ratesMoved, useful: fb.filter(f => f.verdict === 'useful').length, wrong: fb.filter(f => f.verdict === 'wrong').length, knew: fb.filter(f => f.verdict === 'knew').length },
  };
}
