// The figures behind the new Home (views/home2.js) and the Ask sheet (server/ask.js), from one
// place so the screen and the answers cannot disagree. No DOM here: the server imports it too.
//
//   D = { P: pulse, A: activity, C: customers, M: margin, PR: pricing, CA: calls, S: storage,
//         SG: segments, R: model/rates.js, Z: postcode centres (may be {}) }
//
// The month and the weeks are work done, priced est.: Veri-Shred done services × the value of a done
// service in that month (pricer, below): its own priced lines once complete, else its posted bill.
// The month in progress is priced at last month's value per service. Invoiced revenue is never charted by week:
// it lands when a billing run posts, not when the work is done.
import { billNow, bridge, slippingAccounts, risingAccounts, TARGET, CITADEL, CROSS_SELL_DEPTH } from './levers.js';
import { project, dailyFrom, curve, addMonths, monthStart } from './projection.js';
import { seriesOf } from './series.js';
import { byAccount, totals, eligibleList } from './storage.js';
import { densityByPostcode } from './jobview.js';
import { buildWhitespace, LINES } from './whitespace.js';
import { LABELS } from './metrics.js';
import { lineView, lineSeries, billBreakdown, driverOf, newestFall, estimateToDate, lineShort } from './linework.js';

const sum = (a, f = x => x) => a.reduce((t, x) => t + (f(x) || 0), 0);
const ch = (a, b) => b > 0 ? a / b - 1 : null;

// The value of a done service in a month of work: its own priced lines (P.pace, by work date) when
// the month is complete and priced from its first days; else the following month's posted core
// service ÷ the month's done services; else the current bill's value per service est.
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
  // this month's work at last month's value a service est.; last month at its own, priced
  const price = pricer(P, A), perPrev = price(prevMonth), per = perPrev.v || BN.perService;
  // the next bill: this month's work as the lines price it (components/linework.js), large jobs held apart,
  // so when the month ends the bill's figure is storage plus the lines exactly. The curves below stay on
  // last month's value a service, so they compare the work and not the prices.
  const E = D.LW ? estimateToDate(D, workMonth) : null;
  const X = per ? project({ daily, latest: A.latestDone, perService: E ? E.per : per, storage: BN.storage, routeDays: A.routeDays }) : {};
  // work only (storage is known and flat): the curves start at zero
  const thisMonth = per ? curve(daily, workMonth, per, 0, A.latestDone) : [];
  const lastMonth = per ? curve(daily, prevMonth, per, 0) : [];
  const day = thisMonth.length ? thisMonth[thisMonth.length - 1].day : 0;
  const at = (pts, d) => (pts.find(p => p.day === d) || {}).y;
  const now = day ? at(thisMonth, day) : null, then = day ? at(lastMonth, day) : null;
  const last = P.monthly.find(m => m.month === addMonths(BN.month, -1)) || P.monthly[P.monthly.length - 1];
  return {
    bill: { month: BN.month, core: BN.core, source: BN.source, vsLast: BN.core != null ? ch(BN.core, last.core) : null, lastMonth: last.month, lastCore: last.core },
    next: X.bill ? { month: addMonths(BN.month, 1), central: X.bill.central, lo: X.bill.lo, hi: X.bill.hi, day: X.elapsed, workdays: X.workdays, jobs: E ? E.jobs : 0, jobCount: E ? E.jobCount : 0 } : null,
    gap: TARGET - (X.bill ? X.bill.central : BN.core || 0),
    perService: per, perFrom: perPrev.from, workMonth, prevMonth, day, now, then, vsLast: now && then ? ch(now, then) : null,
    thisMonth, lastMonth, workdays: X.workdays || (lastMonth.length || 22), latestDone: A.latestDone,
  };
}

// ── weeks: work done each week, priced est., the last n weeks to the latest done day ──
export function weekView(D, n = 13) {
  const { P, A } = D;
  const daily = dailyFrom(P, A);
  const price = pricer(P, A), work = monthStart(A.latestDone);
  // the month in progress at last month's value a service est., as the month view prices it
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

// ── cross-sell: the accounts with most to buy, and which lines they don't buy yet est. ──
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
// visits already made would save most est. (components/jobview.js) ──
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

// ── destruction: what can be shredded, and what it does to the P&L est. ──
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
// ── the four points at the top of Home, each chosen by a rule and written as facts for the summary ──
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const money = v => { const a = Math.abs(v); return '$' + (a >= 1e6 ? (a / 1e6).toFixed(1) + 'M' : a >= 1000 ? Math.round(a / 1000) + 'K' : String(Math.round(a))); };
const pc = v => Math.abs(Math.round(v * 100)) + '%';
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/(?!^)\b(Of|And|The|For|In|At|On|To)\b/g, w => w.toLowerCase()).replace(/\b(Llp|Llc|Pc|Inc|Icu|Itad)\b/g, w => w.toUpperCase());

export function pointsView(D, { month: m, cust, cross, dens, lines }) {
  const out = [];
  if (lines && m.next) {
    // service before large jobs: the lines with nothing held out, this month against last, like for like
    const L = lines.latest, prev = lines.months[lines.months.length - 2];
    const steady = lines.rows.filter(r => r.key !== 'storage' && !r.jobs[L] && r.by[L].pct != null);
    const scale = lines.meta[L].frac || 1;
    const now = steady.reduce((t, r) => t + r.by[L].v, 0), then = steady.reduce((t, r) => t + r.bars[r.bars.length - 2].v, 0) * scale;
    const d = then > 0 ? now / then - 1 : null;
    const moved = steady.map(r => ({ name: r.name, pct: r.by[L].pct, d: r.by[L].v - r.bars[r.bars.length - 2].v * scale }));
    const up = moved.filter(x => x.d > 0).sort((a, b) => b.d - a.d)[0], down = moved.filter(x => x.d < 0).sort((a, b) => a.d - b.d)[0];
    const at = lines.meta[L].partial ? ` at day ${m.day}` : '';
    const dir = d == null || Math.abs(d) < 0.01 ? `level with ${mon(prev)}` : `${pc(d)} ${d > 0 ? 'ahead of' : 'behind'} ${mon(prev)}`;
    const parts = [up && `${up.name} up ${pc(up.pct)}`, down && `${down.name} down ${pc(down.pct)}`].filter(Boolean).join(', ');
    const jobs = m.next.jobCount ? ` ${m.next.jobCount} job${m.next.jobCount === 1 ? '' : 's'} (${money(m.next.jobs)}) to check.` : '';
    const say = `${LABELS.value}: ${mon(L)} is ${dir}${at} est.${parts ? `, ${parts}` : ''}. ${LABELS.volume}: ${m.vsLast == null ? '' : `${Math.abs(m.vsLast) < 0.02 ? 'level' : `${pc(m.vsLast)} ${m.vsLast > 0 ? 'ahead' : 'behind'}`}.`}${jobs}`;
    out.push({ key: 'activity', title: 'Activity', href: '#h2-lines', bullet: true, line: say, say });
  }
  const fall = cust.falling[0];
  if (fall) {
    const drv = D.LW ? driverOf(D, fall.level1) : null;
    const fresh = D.LW ? newestFall(D, new Set([...slippingAccounts(D.C), ...risingAccounts(D.C)].map(s => s.level1))) : null;
    const say = `${title(fall.customer)} is down ${money(fall.d)} a month in total on its own run${drv ? `, driven by ${drv.name.toLowerCase()}` : ''}.` +
      (fresh ? ` New in ${mon(fresh.month)}: ${title(fresh.customer)} fell ${money(fresh.d)}${fresh.est ? ' est.' : ''}${fresh.driver ? `, driven by ${fresh.driver.toLowerCase()}` : ''}.` : '');
    out.push({ key: 'customer', title: 'Customer', href: `#customer/${fall.level1}`, bullet: true, line: say, say });
  }
  const c0 = cross.rows[0];
  if (c0) {
    const ls = c0.lines.filter(l => !l.have && l.opp > 0).map(l => l.name);
    const say = `Cross-sell is worth up to ${money(cross.totalMonth)} a month est. ${title(c0.customer)} is the largest to explore: ${money(c0.opp / 12)} a month in ${ls.join(' and ')}.`;
    out.push({ key: 'cross', title: 'Cross-sell opportunities', href: '#customers?view=opportunities', bullet: true, line: say, say });
  }
  // a briefing item has to be worth about $25K a year; smaller ones stay on their own screen
  const p0 = dens && dens.save[0];
  if (p0 && p0.saving >= 25000) {
    const say = `One more bin customer in ${p0.postcode}, already on ${p0.visits} visits a year, saves about ${money(p0.saving)} a year est.`;
    out.push({ key: 'location', title: 'Location', href: '#activity', bullet: true, line: say, say });
  }
  return out;
}

export function homeView(D) {
  const month = monthView(D), weeks = weekView(D), seg = segmentView(D), cust = customerView(D);
  const cross = crossSellView(D), dens = densityView(D), dest = destructionView(D);
  const B = bridge({ P: D.P, PR: D.PR, CA: D.CA, M: D.M, C: D.C });
  const lines = D.LW ? lineView(D) : null;
  const bills = D.LW ? {
    billed: month.bill.core != null ? billBreakdown(D, month.bill.month, month.bill.core) : billBreakdown(D, month.bill.lastMonth, month.bill.lastCore),
    next: month.next ? billBreakdown(D, month.next.month, month.next.central) : null,
  } : null;
  const points = pointsView(D, { month, cust, cross, dens, lines });
  return { month, weeks, seg, cust, cross, dens, dest, bridge: B, lines, bills, points };
}
