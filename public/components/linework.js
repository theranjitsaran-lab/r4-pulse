// Lines of business by month, by account, with the months VCK has not priced yet estimated est. No DOM:
// Home, its pop-outs and Ask read the same figures.
//
// Service bills in arrears, so a month's work has no prices until the next month's run. Its work orders
// are already in VCK (work_orders, finished), so each is priced by what it is:
//   measured  units on the order × the account's own price over the last six priced months (else the book's)
//   counted   an order with blank units (retrievals, returns) × the account's own revenue a line
//   carried   charges only added at the run (flat bin fees, deliveries, system fees): last month's, by account
//   job       ITAD and labour, priced the same way as measured work
// The price of a unit, in order: the account's own over the last six priced months; else its most recent
// price, however old; else the book's median. A first-time buyer pays about list whatever the volume (S4 at
// $8.00 on 235 units and on 1,991, 2026), so a price from similar-sized accounts, who have negotiated, runs low.
// An account's price barely moves, so a job's size is no reason to hold it out. Only two kinds are:
//   check     hours far above anything the account has bought: more than five times its largest line and
//             $10,000 or more. Hours are typed in; device counts are counted, and a big one is a big job
//   noprice   $5,000 or more from an account that has never bought the service
// Tested on July to September 2026: pricing real units this way came within 0% to +1% on bins and +1.6% to
// +9% in total. Units are only tested when the run posts.
import { dailyFrom, weekdaysOf, addMonths, monthStart } from './projection.js';
import { seriesOf } from './series.js';

export const LINE_NAMES = { storage: 'Storage', bin: 'Shred bins', shred: 'Destruction', itad: 'ITAD', handling: 'Retrieval and refile', labour: 'Labour', movement: 'Delivery', other: 'Fees and other' };
const SHORT = { handling: 'Retrieval', other: 'Fees' };
export const lineShort = k => SHORT[k] || LINE_NAMES[k] || k;
const SERVICE = ['bin', 'shred', 'itad', 'handling', 'labour', 'movement', 'other'];
const JOB = new Set(['itad', 'labour']);
const LARGE = 5000, CHECK_VALUE = 10000, CHECK_TIMES = 5;
const AT_THE_RUN = new Set(['S3']);   // shredding by the pound: weighed and added at the run (six lines in September, one order in October)
const RATE_MONTHS = 6;
const COMPLETE = 0.5;       // a month with under half the usual priced work is not priced yet

const sum = (a, f = x => x) => a.reduce((t, x) => t + (f(x) || 0), 0);
const med = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const ch = (a, b) => b > 0 ? a / b - 1 : null;

// which months are priced, and the months to estimate
function shape(LW, A) {
  const latest = monthStart(A.latestDone);
  const byM = new Map();
  for (const r of LW.priced) byM.set(r.month, (byM.get(r.month) || 0) + r.revenue);
  const all = [...byM.keys()].sort();
  const complete = [];
  for (const m of all) {
    const prior = complete.slice(-6).map(x => byM.get(x));
    if (!prior.length || byM.get(m) >= COMPLETE * (sum(prior) / prior.length)) complete.push(m);
  }
  const est = [...new Set(LW.orders.map(o => o.month))].filter(m => m > complete[complete.length - 1] && m <= latest).sort();   // an order finished ahead of a later due date waits for its month
  return { complete, est };
}

export function workEstimate(LW, A, P) {
  const { complete, est } = shape(LW, A);
  const lastM = complete[complete.length - 1];
  const rateFrom = complete.slice(-RATE_MONTHS);
  const own = new Map(), acc = new Map();
  for (const r of LW.priced) {
    if (!rateFrom.includes(r.month)) continue;
    const k = r.level1 + '|' + r.servcode, x = own.get(k) || { rev: 0, units: 0, lines: 0 };
    x.rev += r.revenue; x.units += r.units; x.lines += r.lines; own.set(k, x);
  }
  const bookOf = new Map();
  for (const [k, x] of own) {
    const code = k.slice(k.indexOf('|') + 1), b = bookOf.get(code) || { rate: [], line: [] };
    if (x.units > 0 && x.rev > 0) b.rate.push(x.rev / x.units);
    if (x.lines > 0 && x.rev > 0) b.line.push(x.rev / x.lines);
    bookOf.set(code, b);
  }
  // every account's latest price by code, however old
  const last = new Map();
  for (const r of LW.lastPrice || []) last.set(r.level1 + '|' + r.servcode, r);
  const latest = monthStart(A.latestDone), wd = weekdaysOf(latest), f = wd.filter(d => d <= A.latestDone).length / (wd.length || 1);
  const out = new Map();
  for (const m of est) {
    const frac = m === latest ? f : 1;
    const e = { month: m, frac, partial: frac < 1, byFam: {}, byAcc: new Map(), jobs: [], how: { measured: 0, counted: 0, carried: 0, job: 0 } };
    const put = (fam, id, v, how) => {
      e.byFam[fam] = (e.byFam[fam] || 0) + v; e.how[how] += v;
      const a = e.byAcc.get(id) || {}; a[fam] = (a[fam] || 0) + v; e.byAcc.set(id, a);
    };
    const seen = new Set();
    for (const o of LW.orders) {
      if (o.month !== m || AT_THE_RUN.has(o.servcode)) continue;
      seen.add(o.servcode);
      const x = own.get(o.level1 + '|' + o.servcode), b = bookOf.get(o.servcode);
      // an account with history at $0 is on a flat fee (carried below): its own rate is $0, never the book's
      const hist = last.get(o.level1 + '|' + o.servcode);
      const ownRate = x && x.units > 0 ? x.rev / x.units : hist ? hist.rate : null, bookRate = b ? med(b.rate) : null;
      const rate = ownRate != null ? ownRate : bookRate ?? 0;
      if (JOB.has(o.family)) {
        const v = o.units * rate;
        const reason = ownRate == null ? (v >= LARGE ? 'noprice' : null) : (o.family === 'labour' && v >= CHECK_VALUE && hist && o.units > CHECK_TIMES * hist.max_units ? 'check' : null);
        if (reason) e.jobs.push({ level1: o.level1, family: o.family, servcode: o.servcode, description: o.description, units: o.units, value: v, rate, reason, lastDate: hist ? hist.date : null, maxUnits: hist ? hist.max_units : null });
        else put(o.family, o.level1, v, 'job');
      } else if (o.units > 0) put(o.family, o.level1, o.units * rate, 'measured');
      else {
        const perLine = x && x.lines > 0 ? x.rev / x.lines : (b ? med(b.line) : 0);
        put(o.family, o.level1, o.orders * (perLine || 0), 'counted');
      }
    }
    for (const r of LW.priced) {
      if (r.month !== lastM || seen.has(r.servcode) || JOB.has(r.family)) continue;
      put(r.family, r.level1, r.revenue * frac, 'carried');
    }
    e.total = sum(Object.values(e.byFam));
    e.jobs.sort((a, b) => b.value - a.value);
    e.jobsValue = sum(e.jobs, j => j.value);
    out.set(m, e);
  }
  return { complete, est, byMonth: out, lastPriced: lastM };
}

// storage by the month it bills, from the posted series; a month not yet in it carries the latest
function storageOf(P) {
  const m = new Map(P.monthly.map(x => [x.month, x.storage]));
  for (const x of P.posted || []) m.set(x.month, x.storage);
  return m;
}

// Every line's monthly series, priced months as priced and later months estimated
export function lineSeries(D) {
  const { LW, A, P, SG } = D;
  const W = workEstimate(LW, A, P), st = storageOf(P);
  const hist = new Map();
  for (const r of (SG && SG.rows ? SG.rows : LW.priced)) {
    const m = hist.get(r.month) || {}; m[r.family] = (m[r.family] || 0) + r.revenue; hist.set(r.month, m);
  }
  const months = [...hist.keys()].filter(m => W.complete.includes(m) || m < W.complete[0]).sort().concat(W.est);
  const lastStorage = [...st.keys()].sort().slice(-1)[0];
  const val = (k, m) => {
    if (k === 'storage') return st.has(m) ? st.get(m) : st.get(lastStorage);
    if (W.byMonth.has(m)) return W.byMonth.get(m).byFam[k] || 0;
    return (hist.get(m) || {})[k] || 0;
  };
  return { W, months, val };
}

// Home's tiles: for each month the picker offers, each line's figure and its comparisons. A month in
// progress compares with the month before scaled to the same share of its working days.
export function lineView(D, n = 13) {
  const { W, months, val } = lineSeries(D);
  const shown = months.slice(-n), pick = shown.slice(-7);
  const stats = (k, m) => {
    const i = months.indexOf(m), e = W.byMonth.get(m), f = e ? e.frac : 1;
    const v = val(k, m), storage = k === 'storage', scale = storage ? 1 : f;
    const prev = i > 0 ? val(k, months[i - 1]) : null;
    const span = (from, to) => sum(months.slice(Math.max(0, from), to + 1), x => val(k, x));
    const y = m.slice(0, 4), yi = months.findIndex(x => x.startsWith(y)), ly = months.indexOf(addMonths(m, -12));
    const lyStart = months.indexOf(`${+y - 1}-01-01`);
    // a comparison stands unless what is held out is a real part of the line
    const waiting = e && !storage && sum(e.jobs.filter(j => j.family === k), j => j.value) > 0.25 * Math.max(v, 1);
    return {
      v, est: !!e && !storage, pct: !waiting && prev != null ? ch(v, prev * scale) : null,
      p3: !waiting && i >= 5 ? ch(span(i - 2, i), span(i - 5, i - 3)) : null,
      ytd: !waiting && lyStart >= 0 && ly >= 0 ? ch(span(yi, i), span(lyStart, ly)) : null,
    };
  };
  const rows = Object.keys(LINE_NAMES).map(k => ({
    key: k, name: LINE_NAMES[k],
    bars: shown.map(m => ({ m, v: val(k, m), est: W.byMonth.has(m) && k !== 'storage' })),
    by: Object.fromEntries(pick.map(m => [m, stats(k, m)])),
    jobs: Object.fromEntries(pick.filter(m => W.byMonth.has(m)).map(m => [m, sum(W.byMonth.get(m).jobs.filter(j => j.family === k), j => j.value)])),
  }));
  const latest = months[months.length - 1];
  rows.sort((a, b) => b.by[latest].v - a.by[latest].v);
  const totals = Object.fromEntries(pick.map(m => [m, sum(Object.keys(LINE_NAMES), k => val(k, m))]));
  const meta = Object.fromEntries(pick.map(m => { const e = W.byMonth.get(m); return [m, e ? { est: true, partial: e.partial, frac: e.frac, jobs: e.jobsValue, jobCount: e.jobs.length, how: e.how } : { est: false }]; }));
  return { months: shown, pick, latest, rows, totals, meta, lastPriced: W.lastPriced };
}

// The month the picker opens on: the latest closed one. A month in progress is there to pick, hatched, not the default.
export function closedMonth(LV) {
  const closed = LV.pick.filter(m => !LV.meta[m].partial);
  return closed.length ? closed[closed.length - 1] : LV.latest;
}

// The bills, each by its top three lines plus the rest, so the parts add up to the figure shown.
//   A bill = its month's storage + the month before's work.
export function billBreakdown(D, billMonth, total, n = 3) {
  const { W, months, val } = lineSeries(D);
  const work = addMonths(billMonth, -1);
  if (!months.includes(work)) return null;
  const parts = [{ key: 'storage', name: 'Storage', v: val('storage', billMonth) }, ...SERVICE.map(k => ({ key: k, name: lineShort(k), v: val(k, work) }))].filter(p => p.v > 0).sort((a, b) => b.v - a.v);
  const top = parts.slice(0, n), rest = (total != null ? total : sum(parts, p => p.v)) - sum(top, p => p.v);
  return { top, rest, est: W.byMonth.has(work), work };
}

// One line in one month: the customers behind it. Top five by size, five up and five down on the month
// before (scaled when the month is in progress), and all others, so the list adds up to the line.
export function lineDetail(D, key, month) {
  const { W, months, val } = lineSeries(D);
  if (!months.includes(month) || !LINE_NAMES[key]) return null;
  const i = months.indexOf(month), prevM = i > 0 ? months[i - 1] : null;
  const accounts = m => {
    const out = new Map();
    if (key === 'storage') {
      const ser = seriesOf(D.C), at = D.C.months.indexOf(m);
      for (const s of ser.values()) { const j = s.months.indexOf(m); if (j >= 0 && s.storage[j]) out.set(s.level1, s.storage[j]); }
      return at >= 0 || out.size ? out : out;
    }
    const e = W.byMonth.get(m);
    if (e) { for (const [id, a] of e.byAcc) if (a[key]) out.set(id, a[key]); return out; }
    for (const r of D.LW.priced) if (r.month === m && r.family === key) out.set(r.level1, (out.get(r.level1) || 0) + r.revenue);
    return out;
  };
  const now = accounts(month), then = prevM ? accounts(prevM) : new Map();
  const e = W.byMonth.get(month), scale = e && key !== 'storage' ? e.frac : 1;
  const names = new Map([...D.M.accounts.map(a => [a.level1, a.customer]), ...D.C.accounts.map(a => [a.level1, a.customer])]);
  const nm = id => names.get(id) || `Account ${id}`;
  const total = val(key, month), prev = prevM ? val(key, prevM) : null;
  const top = [...now].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => ({ level1: id, customer: nm(id), v, share: total > 0 ? v / total : null, d: v - (then.get(id) || 0) * scale }));
  const moves = [...new Set([...now.keys(), ...then.keys()])].map(id => ({ level1: id, customer: nm(id), now: now.get(id) || 0, then: then.get(id) || 0, d: (now.get(id) || 0) - (then.get(id) || 0) * scale }));
  const up = moves.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 5), down = moves.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 5);
  const jobs = e ? e.jobs.filter(j => j.family === key).map(j => ({ ...j, customer: nm(j.level1) })) : [];
  const bars = months.slice(-13).map(m => ({ m, v: val(key, m), est: W.byMonth.has(m) && key !== 'storage' }));
  return { key, name: LINE_NAMES[key], month, prevMonth: prevM, total, prev, scale, est: !!e && key !== 'storage', partial: !!(e && e.partial), top, others: total - sum(top, t => t.v), up, down, jobs, jobsValue: sum(jobs, j => j.value), bars, how: e ? e.how : null };
}

// What drove an account's move: the line with the largest change, last three priced months against the
// twelve before them (the same windows as series.js), from its priced lines
export function driverOf(D, level1, { sign = -1 } = {}) {
  const { W } = lineSeries(D);
  const c = W.complete, last3 = c.slice(-3), run = c.slice(-15, -3);
  if (!run.length) return null;
  const by = {};
  for (const r of D.LW.priced) {
    if (r.level1 !== level1) continue;
    const x = by[r.family] = by[r.family] || { a: 0, b: 0 };
    if (last3.includes(r.month)) x.a += r.revenue;
    if (run.includes(r.month)) x.b += r.revenue;
  }
  const rows = Object.entries(by).map(([k, x]) => ({ key: k, name: lineShort(k), d: x.a / last3.length - x.b / run.length }));
  rows.sort((a, b) => sign * (b.d - a.d));
  const s = seriesOf(D.C).get(level1);
  if (s && s.move && Math.abs(s.move.dStorage) > Math.abs((rows[0] || { d: 0 }).d)) return { key: 'storage', name: 'Storage', d: s.move.dStorage };
  return rows[0] || null;
}

// The newest fall: the largest drop in the latest month's work against the account's own three priced months
// before it, on the steady lines (a job's lumps are not a fall), among accounts on neither the Slipping nor the
// Rising list, so it cannot contradict them. $500 or more; a month in progress is compared at the same point.
export function newestFall(D, skip = new Set()) {
  const { W } = lineSeries(D);
  const c = W.complete, m = W.est.length ? W.est[W.est.length - 1] : c[c.length - 1], e = W.byMonth.get(m), scale = e ? e.frac : 1;
  const before = c.filter(x => x < m).slice(-3);
  const a = new Map(), at = id => a.get(id) || a.set(id, { now: 0, was: 0, fam: {} }).get(id);
  const add = (id, k, n, w) => { if (JOB.has(k)) return; const x = at(id), f = x.fam[k] = x.fam[k] || { n: 0, w: 0 }; x.now += n; x.was += w; f.n += n; f.w += w; };
  for (const r of D.LW.priced) {
    if (before.includes(r.month)) add(r.level1, r.family, 0, r.revenue / before.length * scale);
    else if (!e && r.month === m) add(r.level1, r.family, r.revenue, 0);
  }
  if (e) for (const [id, fams] of e.byAcc) for (const [k, v] of Object.entries(fams)) add(id, k, v, 0);
  let best = null;
  for (const [id, x] of a) {
    if (skip.has(id) || id === 6714) continue;
    const d = x.now - x.was;
    if (d <= -500 && (!best || d < best.d)) {
      const drv = Object.entries(x.fam).map(([k, v]) => ({ k, d: v.n - v.w })).sort((p, q) => p.d - q.d)[0];
      best = { level1: id, d, month: m, driver: drv ? lineShort(drv.k) : null, est: !!e };
    }
  }
  if (!best) return null;
  const names = new Map([...D.M.accounts.map(x => [x.level1, x.customer]), ...D.C.accounts.map(x => [x.level1, x.customer])]);
  return { ...best, customer: names.get(best.level1) || `Account ${best.level1}` };
}

// The month so far (Theran, 14 November 2026): this month's storage, confirmed on its bill, plus the work done so
// far priced at each account's own rates (est.), against the month before at the same share of its working days,
// the rule the line tiles use (lineView). Storage is a whole month's charge, so it is compared whole. Every customer
// row and every line adds to the total; jobs to check stay out of it and are listed apart. Citadel is not in the work
// (the linework queries leave it out); its storage is core and stays in.
//   monthToDate(D) → { month, prevMonth, latest, day, workdays, frac, storage, storageCarried, work, total,
//                      prevAt, change, jobs, jobsValue, byLine, byCustomer } | null
export function monthToDate(D) {
  const { W, months, val } = lineSeries(D);
  const month = W.est.length ? W.est[W.est.length - 1] : null, e = month && W.byMonth.get(month);
  if (!e) return null;
  const prevMonth = addMonths(month, -1), frac = e.frac;
  const st = storageOf(D.P), storageCarried = !st.has(month);
  const wd = weekdaysOf(month), day = wd.filter(d => d <= D.A.latestDone).length;
  const lineOf = k => ({ key: k, name: LINE_NAMES[k], v: val(k, month), prevAt: val(k, prevMonth) * (k === 'storage' ? 1 : frac) });
  const byLine = ['storage', ...SERVICE].map(lineOf).filter(l => l.v || l.prevAt);
  const storage = val('storage', month), work = sum(SERVICE, k => val(k, month));
  const total = storage + work, prevAt = sum(byLine, l => l.prevAt);

  // each account: its storage on this month's bill and its work so far; the month before the same way
  // the whole book (accountmonths), so every account's storage is there; the top-300 customers query if it is not
  const ser = seriesOf(D.AM || D.C);
  const storageIn = m => { const out = new Map(); for (const x of ser.values()) { const j = x.months.indexOf(m); if (j >= 0 && x.storage[j]) out.set(x.level1, x.storage[j]); } return out; };
  const workIn = m => {
    const out = new Map(), w = W.byMonth.get(m);
    if (w) for (const [id, a] of w.byAcc) out.set(id, sum(Object.values(a)));
    else for (const r of D.LW.priced) if (r.month === m) out.set(r.level1, (out.get(r.level1) || 0) + r.revenue);
    return out;
  };
  const sNow = storageIn(month), wNow = workIn(month), sThen = storageIn(prevMonth), wThen = workIn(prevMonth);
  const names = new Map([...(D.AM ? D.AM.accounts : []).map(a => [a.level1, a.customer]), ...D.M.accounts.map(a => [a.level1, a.customer]), ...D.C.accounts.map(a => [a.level1, a.customer])]);
  const ids = new Set([...sNow.keys(), ...wNow.keys()]);
  const rows = [...ids].map(id => {
    const s = sNow.get(id) || 0, w = wNow.get(id) || 0, then = (sThen.get(id) || 0) + (wThen.get(id) || 0) * frac;
    return { level1: id, customer: names.get(id) || `Account ${id}`, storage: s, work: w, total: s + w, prevAt: then, change: ch(s + w, then) };
  }).filter(r => Math.abs(r.total) >= 0.5).sort((a, b) => b.total - a.total || a.level1 - b.level1);
  // storage on the bill that no account row carries is shown as its own row, never spread
  const unplaced = storageCarried ? 0 : storage - sum(rows, r => r.storage);
  const byCustomer = Math.abs(unplaced) >= 1 ? [...rows, { level1: null, customer: 'Storage not on an account', storage: unplaced, work: 0, total: unplaced, prevAt: null, change: null }] : rows;
  const jobs = e.jobs.map(j => ({ ...j, customer: names.get(j.level1) || `Account ${j.level1}` }));
  return {
    month, prevMonth, latest: D.A.latestDone, day, workdays: wd.length, frac, storage, storageCarried, work, total, prevAt,
    change: ch(total, prevAt), jobs, jobsValue: e.jobsValue, byLine, byCustomer, how: e.how, priced: months.includes(prevMonth),
  };
}

// The estimate of a month's work to date, for pricing the month's done services
export function estimateToDate(D, month) {
  const W = workEstimate(D.LW, D.A, D.P), e = W.byMonth.get(month);
  if (!e) return null;
  const done = sum(dailyFrom(D.P, D.A).filter(r => r.date.startsWith(month.slice(0, 7)) && r.date <= D.A.latestDone), r => r.done);
  return done > 0 ? { total: e.total, done, per: e.total / done, jobs: e.jobsValue, jobCount: e.jobs.length, frac: e.frac } : null;
}
