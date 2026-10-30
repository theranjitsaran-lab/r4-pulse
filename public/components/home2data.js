// The figures behind the new Home (views/home2.js) and the Ask sheet (server/ask.js), from one
// place so the screen and the answers cannot disagree. No DOM here: the server imports it too.
//
//   D = { P: pulse, A: activity, C: customers, M: margin, PR: pricing, CA: calls, S: storage,
//         SG: segments, R: model/rates.js, Z: postcode centres (may be {}) }
//
// The month and the weeks are work done, priced ◇: Veri-Shred done services × the value of a done
// service in that month (pricer, below): its own priced lines once complete, else its posted bill.
// The month in progress is priced at last month's value per service. Invoiced revenue is never charted by week:
// it lands when a billing run posts, not when the work is done.
import { billNow, bridge, slippingAccounts, risingAccounts, TARGET, CITADEL, CROSS_SELL_DEPTH } from './levers.js';
import { project, dailyFrom, curve, addMonths, monthStart } from './projection.js';
import { seriesOf } from './series.js';
import { byAccount, totals, eligibleList } from './storage.js';
import { densityByPostcode } from './jobview.js';
import { buildWhitespace, LINES } from './whitespace.js';

const sum = (a, f = x => x) => a.reduce((t, x) => t + (f(x) || 0), 0);
const ch = (a, b) => b > 0 ? a / b - 1 : null;

// The value of a done service in a month of work: its own priced lines (P.pace, by work date) when
// the month is complete and priced from its first days; else the following month's posted core
// service ÷ the month's done services; else the current bill's value per service ◇.
function pricer(P, A) {
  const BN = billNow(P, A), daily = dailyFrom(P, A), work = monthStart(A.latestDone);
  const doneIn = m => sum(daily.filter(r => r.date.startsWith(m.slice(0, 7))), r => r.done);
  const pace = P.pace || [], first = pace.length ? pace.map(r => r.date).sort()[0] : null;
  const posted = new Map(P.monthly.map(m => [m.month, m]));
  const memo = new Map();
  return m => {
    if (memo.has(m)) return memo.get(m);
    const done = doneIn(m), bill = posted.get(addMonths(m, 1));
    let out;
    if (m < work && first && first <= addMonths(m, 0).slice(0, 8) + '03' && done) out = { v: sum(pace.filter(r => r.date.startsWith(m.slice(0, 7))), r => r.value) / done, own: true, from: 'priced lines' };
    else if (bill && done) out = { v: bill.core_service / done, own: true, from: 'posted bill' };
    else out = { v: BN.perService, own: false, from: 'current bill' };
    memo.set(m, out);
    return out;
  };
}

// ── the month: this bill, the next one building, this month's work against last month's ──
export function monthView(D) {
  const { P, A } = D;
  const BN = billNow(P, A);
  const daily = dailyFrom(P, A);
  const workMonth = monthStart(A.latestDone), prevMonth = addMonths(workMonth, -1);
  // this month's work at last month's value a service ◇; last month at its own, priced
  const price = pricer(P, A), perPrev = price(prevMonth), per = perPrev.v || BN.perService;
  const X = per ? project({ daily, latest: A.latestDone, perService: per, storage: BN.storage, routeDays: A.routeDays }) : {};
  // work only (storage is known and flat): the curves start at zero
  const thisMonth = per ? curve(daily, workMonth, per, 0, A.latestDone) : [];
  const lastMonth = per ? curve(daily, prevMonth, per, 0) : [];
  const day = thisMonth.length ? thisMonth[thisMonth.length - 1].day : 0;
  const at = (pts, d) => (pts.find(p => p.day === d) || {}).y;
  const now = day ? at(thisMonth, day) : null, then = day ? at(lastMonth, day) : null;
  const last = P.monthly.find(m => m.month === addMonths(BN.month, -1)) || P.monthly[P.monthly.length - 1];
  return {
    bill: { month: BN.month, core: BN.core, source: BN.source, vsLast: BN.core != null ? ch(BN.core, last.core) : null, lastMonth: last.month, lastCore: last.core },
    next: X.bill ? { month: addMonths(BN.month, 1), central: X.bill.central, lo: X.bill.lo, hi: X.bill.hi, day: X.elapsed, workdays: X.workdays } : null,
    gap: TARGET - (X.bill ? X.bill.central : BN.core || 0),
    perService: per, perFrom: perPrev.from, workMonth, prevMonth, day, now, then, vsLast: now && then ? ch(now, then) : null,
    thisMonth, lastMonth, workdays: X.workdays || (lastMonth.length || 22), latestDone: A.latestDone,
  };
}

// ── weeks: work done each week, priced ◇, the last n weeks to the latest done day ──
export function weekView(D, n = 13) {
  const { P, A } = D;
  const daily = dailyFrom(P, A);
  const price = pricer(P, A), work = monthStart(A.latestDone);
  // the month in progress at last month's value a service ◇, as the month view prices it
  const per = m => m >= work ? { ...price(addMonths(work, -1)), own: false } : price(m);
  const monday = d => { const x = new Date(d + 'T00:00:00Z'), w = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - w); return x.toISOString().slice(0, 10); };
  const weeks = new Map();
  for (const r of daily) {
    const k = monday(r.date), p = per(monthStart(r.date));
    const w = weeks.get(k) || { week: k, done: 0, value: 0, days: 0, modelled: false };
    w.done += r.done; w.value += r.done * (p.v || 0); w.days += r.done > 0 ? 1 : 0; w.modelled = w.modelled || !p.own;
    weeks.set(k, w);
  }
  const all = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
  const latestWeek = monday(A.latestDone);
  const fri = d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 4); return x.toISOString().slice(0, 10); };
  const rows = all.slice(-n).map(w => ({ ...w, partial: w.week === latestWeek && A.latestDone < fri(w.week) }));
  const full = rows.filter(w => !w.partial);
  const avg = full.length > 1 ? sum(full.slice(0, -1), w => w.value) / (full.length - 1) : null;
  const lastFull = full[full.length - 1] || null;
  return { rows, avg, lastFull, vsAvg: lastFull && avg ? ch(lastFull.value, avg) : null };
}

// ── segments: last month, the last three and the year to date, each against the period before ──
export const SEGMENTS = [
  { key: 'storage',  name: 'Storage' },
  { key: 'bin',      name: 'Shred bins' },
  { key: 'shred',    name: 'Destruction' },
  { key: 'itad',     name: 'ITAD' },
  { key: 'handling', name: 'Retrieval and refile' },
  { key: 'labour',   name: 'Labour' },
  { key: 'movement', name: 'Delivery' },
  { key: 'other',    name: 'Fees and other' },
];
export function segmentView(D) {
  const { P, A, SG } = D;
  if (!SG || !SG.rows || !SG.rows.length) return null;
  const work = monthStart(A.latestDone);
  // service by month of work, complete months only; storage by the month it bills
  const by = new Map();
  for (const r of SG.rows) {
    if (r.month >= work) continue;
    const m = by.get(r.month) || {}; m[r.family] = (m[r.family] || 0) + r.revenue; by.set(r.month, m);
  }
  const months = [...by.keys()].sort();
  for (const pm of P.monthly) if (by.has(pm.month)) by.get(pm.month).storage = pm.storage;
  const lm = months[months.length - 1], y = lm.slice(0, 4), ly = String(+y - 1);
  const val = (m, k) => (by.get(m) || {})[k] || 0;
  const range = (k, a, b) => sum(months.filter(m => m >= a && m <= b), m => val(m, k));
  const rows = SEGMENTS.map(s => {
    const k = s.key;
    const l3a = addMonths(lm, -2), p3a = addMonths(lm, -5), p3b = addMonths(lm, -3);
    const ytd = range(k, `${y}-01-01`, lm), ytdLy = range(k, `${ly}-01-01`, addMonths(lm, -12));
    return {
      ...s,
      lm: val(lm, k), lmPct: ch(val(lm, k), val(addMonths(lm, -1), k)),
      l3m: range(k, l3a, lm), l3mPct: ch(range(k, l3a, lm), range(k, p3a, p3b)),
      ytd, ytdPct: months[0] <= `${ly}-01-01` ? ch(ytd, ytdLy) : null,
      spark: months.slice(-12).map(m => val(m, k)),
    };
  }).filter(r => r.l3m > 0).sort((a, b) => b.lm - a.lm);
  return { month: lm, rows, total: sum(rows, r => r.lm), basis: 'service by month of work, storage by month billed, Citadel apart' };
}

// ── customers: the largest five, and the five rising and five slipping most (one definition of
// movement everywhere: the last three months against the account's own twelve before them) ──
export function customerView(D) {
  const ser = seriesOf(D.C);
  const row = s => ({ level1: s.level1, customer: s.customer, last3: s.move ? s.move.last3 : null, d: s.move ? s.move.d : null, pct: s.move ? s.move.pct : null,
    storageMove: s.move ? s.move.dStorage : null, serviceMove: s.move ? s.move.dService : null, spark: s.total.slice(-13) });
  const top = [...ser.values()].filter(s => s.level1 !== CITADEL && s.move).sort((a, b) => b.move.last3 - a.move.last3).slice(0, 5).map(row);
  const slip = slippingAccounts(D.C);
  return { top, rising: risingAccounts(D.C).slice(0, 5).map(row), falling: slip.slice(0, 5).map(row), slipping: slip.length };
}

// ── cross-sell: the accounts with most to buy, and which lines they don't buy yet ◇ ──
export function crossSellView(D, n = 6) {
  const ws = buildWhitespace(D.M, { exclude: [CITADEL], top: CROSS_SELL_DEPTH });
  const rows = ws.rows.filter(r => r.opp > 0).sort((a, b) => b.opp - a.opp).slice(0, n).map(r => ({
    level1: r.level1, customer: r.customer, total: r.total, opp: r.opp,
    lines: LINES.map(x => ({ key: x.key, name: x.short || x.name, have: r.cells[x.key].have, spend: r.cells[x.key].spend, opp: r.cells[x.key].opp || 0 })),
  }));
  // which line is missing most often, in dollars, across the book
  const byLine = LINES.map(x => ({ key: x.key, name: x.short || x.name, opp: sum(ws.rows, r => r.cells[x.key].have ? 0 : r.cells[x.key].opp), accounts: ws.rows.filter(r => !r.cells[x.key].have && r.cells[x.key].opp > 0).length }))
    .filter(x => x.opp > 0).sort((a, b) => b.opp - a.opp);
  return { rows, byLine, totalMonth: ws.total / 12, accounts: ws.rows.filter(r => r.opp > 0).length };
}

// ── route density, the sales layer: every postcode R4 visits, and where one more customer on the
// visits already made would save most ◇ (components/jobview.js) ──
export function densityView(D, top = 8) {
  const { A, R, Z } = D;
  if (!Z || !Object.keys(Z).length) return null;
  const save = densityByPostcode(R, A, Z, { top });
  const best = new Set(save.rows.map(r => r.postcode));
  const points = (A.postcodes || []).filter(p => Z[p.postcode] && !p.billing_only)
    .map(p => ({ postcode: p.postcode, pt: Z[p.postcode], visits: p.visits, services: p.services, customers: p.customers, names: p.names, best: best.has(p.postcode) }));
  const single = points.filter(p => p.customers === 1);
  return { points, save: save.rows, saving: sum(save.rows, r => r.saving), single: single.length, days: save.days };
}

// ── destruction: what can be shredded, and what it does to the P&L ◇ ──
//   not refilled: the one-off fee, then the storage lost every month after;
//   refilled: the fee, and the space taken by new boxes at the book's median rate.
export function destructionView(D, n = 5) {
  const { S, PR } = D;
  if (!S || !S.rows) return null;
  const acc = byAccount(S, [CITADEL]), T = totals(acc);
  const E = eligibleList(acc, PR, T.boxes);
  const year = r => ({ fee: r.once, lostYear: r.lost * 12, refillYear: (E.med - r.rate) * r.eligible * 12 });
  const rows = E.rows.slice(0, n).map(r => ({ level1: r.level1, customer: r.customer, eligible: r.eligible, boxes: r.boxes, ...year(r) }));
  return {
    boxes: T.boxes, eligible: E.eligible, share: E.eligible / T.boxes, perBox: E.perBox, med: E.med,
    fee: E.once, lostYear: E.lost * 12,
    notRefilled: E.once - E.lost * 12,                                    // the first year, if the space stays empty
    refilled: E.once + sum(E.rows, r => (E.med - r.rate) * r.eligible * 12), // the first year, if new boxes take the space
    rows,
  };
}

// ── everything Home draws, and the figure sheet the summary is written from ──
export function homeView(D) {
  const month = monthView(D), weeks = weekView(D), seg = segmentView(D), cust = customerView(D);
  const cross = crossSellView(D), dens = densityView(D), dest = destructionView(D);
  const B = bridge({ P: D.P, PR: D.PR, CA: D.CA, M: D.M, C: D.C });
  return { month, weeks, seg, cust, cross, dens, dest, bridge: B };
}
