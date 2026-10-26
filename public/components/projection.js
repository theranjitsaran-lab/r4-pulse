// Where the month lands. The work done this month becomes next month's bill (service bills in
// arrears; storage in advance), so the projection is in services done, priced at last month's value
// per done service ◇:
//   done to date (Veri-Shred done orders)
//   + the working days left × the median daily pace of the last six complete months
//   = the month's services; × value per service, + the storage carried forward = next month's bill.
// The band is not a guess: each of the last twelve months is projected from the same working day
// with only what was known then, and the spread of how those projections missed sets the band.
// Each month is tested against a band built from the other months (leave one out), so "inside the
// band in N of 12" is an honest score, not the band scoring itself.
// Bookings × R4's own completion rate is shown beside it as a second, independent estimate.
import { quantile } from './strip.js';

const ym = d => d.slice(0, 7);
export const monthStart = d => d.slice(0, 8) + '01';
export const addMonths = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 10);
const isWeekday = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w > 0 && w < 6; };
// the weekdays of a month, in order
export function weekdaysOf(month) {
  const out = [];
  for (let d = new Date(month + 'T00:00:00Z'); d.getUTCMonth() === +month.slice(5, 7) - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const s = d.toISOString().slice(0, 10);
    if (isWeekday(s)) out.push(s);
  }
  return out;
}

// Daily done and booked services. The snapshot's fifteen months (P.dailyDone) when present, else
// what the route days hold (about six weeks); booked always from the route days, which run ahead.
export function dailyFrom(P, A) {
  const by = new Map();
  if (P && P.dailyDone && P.dailyDone.length) for (const r of P.dailyDone) by.set(r.date, { date: r.date, done: r.done || 0, booked: r.booked || 0 });
  else for (const r of A.routeDays) {
    const x = by.get(r.date) || { date: r.date, done: 0, booked: 0 };
    x.done += r.services_done || 0; x.booked += r.services || 0; by.set(r.date, x);
  }
  return [...by.values()].filter(r => r.date <= A.latestDone).sort((a, b) => a.date.localeCompare(b.date));
}

// complete months in the series, oldest first: the first month is skipped unless it starts on its 1st
// working days, so a partial month never sets the pace
function completeMonths(daily, before) {
  if (!daily.length) return [];
  const first = daily[0].date, months = [...new Set(daily.map(r => ym(r.date)))].map(m => m + '-01').filter(m => m < before);
  return months.filter(m => m > monthStart(first) || first <= weekdaysOf(m)[0]);
}

const sum = (rows, f) => rows.reduce((t, r) => t + f(r), 0);
const median = xs => quantile(xs.slice().sort((a, b) => a - b), 0.5);

export function project({ daily, latest, perService, storage, routeDays = [], window = 6 }) {
  const month = monthStart(latest), wd = weekdaysOf(month);
  const elapsed = wd.filter(d => d <= latest).length, remaining = wd.length - elapsed;
  const inMonth = (m, upto) => daily.filter(r => ym(r.date) === ym(m) && (!upto || r.date <= upto));
  const doneToDate = sum(inMonth(month, latest), r => r.done);

  const complete = completeMonths(daily, month);
  const paceOf = m => sum(inMonth(m), r => r.done) / weekdaysOf(m).length;
  const paces = complete.map(m => ({ month: m, done: sum(inMonth(m), r => r.done), pace: paceOf(m) }));
  const recent = paces.slice(-window);
  const pace = recent.length ? median(recent.map(p => p.pace)) : (elapsed ? doneToDate / elapsed : 0);
  const central = doneToDate + remaining * pace;

  // the backtest: each complete month with at least three complete months before it, projected from
  // the same working day as today with the pace known then
  const tests = [];
  complete.forEach((m, i) => {
    const prior = paces.slice(0, i).slice(-window);
    if (prior.length < 3) return;
    const days = weekdaysOf(m), k = Math.min(Math.max(elapsed, 1), days.length);
    const atK = sum(inMonth(m, days[k - 1]), r => r.done), actual = paces[i].done;
    const proj = atK + (days.length - k) * median(prior.map(p => p.pace));
    if (proj > 0) tests.push({ month: m, proj, actual, ratio: actual / proj });
  });
  const back = tests.slice(-12);
  const band = rs => { const s = rs.slice().sort((a, b) => a - b); return [quantile(s, 0.1), quantile(s, 0.9)]; };
  let lo, hi, backtest = null;
  if (back.length >= 4) {
    for (const t of back) {
      const [a, b] = band(back.filter(x => x !== t).map(x => x.ratio));
      t.hit = t.ratio >= a && t.ratio <= b;
    }
    const [a, b] = band(back.map(t => t.ratio));
    // the band is on the whole month, but what is done is done: never below the work already in
    lo = Math.max(doneToDate, central * a); hi = Math.max(lo, central * b);
    backtest = { months: back, hits: back.filter(t => t.hit).length, n: back.length, lo: a, hi: b };
  } else {
    // not enough history to test: with three months or more, the slowest and fastest month's pace;
    // with fewer, the middle half of the recent working days (an untested band, and said so)
    let a, b;
    if (recent.length >= 3) { a = Math.min(...recent.map(p => p.pace)); b = Math.max(...recent.map(p => p.pace)); }
    else {
      const days = daily.filter(r => isWeekday(r.date) && r.date < month).slice(-22).map(r => r.done).sort((x, y) => x - y);
      a = days.length ? quantile(days, 0.25) : pace; b = days.length ? quantile(days, 0.75) : pace;
    }
    lo = doneToDate + remaining * Math.min(a, pace); hi = doneToDate + remaining * Math.max(b, pace);
  }

  // bookings: what is booked for the rest of the month × the share of bookings that get done
  const rd = new Map();
  for (const r of routeDays) { const x = rd.get(r.date) || { done: 0, booked: 0 }; x.done += r.services_done || 0; x.booked += r.services || 0; rd.set(r.date, x); }
  const pastDates = [...rd.keys()].filter(d => d <= latest && d >= addMonths(month, -3));
  const pastBooked = sum(pastDates, d => rd.get(d).booked), pastDone = sum(pastDates, d => rd.get(d).done);
  const ahead = [...rd.keys()].filter(d => d > latest && ym(d) === ym(month)).sort();
  const completion = pastBooked ? pastDone / pastBooked : null;
  const bookings = completion && ahead.length ? {
    done: doneToDate + completion * sum(ahead, d => rd.get(d).booked),
    completion, horizon: ahead[ahead.length - 1], covers: ahead[ahead.length - 1] >= wd[wd.length - 1],
  } : null;

  const v = n => perService ? n * perService : null;
  return {
    month, latest, elapsed, remaining, workdays: wd.length, doneToDate, pace, paces: recent,
    services: { central, lo, hi },
    value: { central: v(central), lo: v(lo), hi: v(hi), toDate: v(doneToDate) },
    bill: perService ? { central: storage + v(central), lo: storage + v(lo), hi: storage + v(hi) } : null,
    storage, perService, backtest, bookings,
  };
}

// The cumulative bill through a month, by working day: the storage it carries plus the work done so
// far at a value per service. Past months are priced so they end on what they actually billed.
export function curve(daily, month, perService, storage, upto) {
  const wd = weekdaysOf(month), add = new Array(wd.length).fill(0);
  // weekend work counts on the working day before it (the month's first, if none)
  for (const r of daily) {
    if (ym(r.date) !== ym(month) || (upto && r.date > upto)) continue;
    let i = wd.length - 1; while (i > 0 && wd[i] > r.date) i--;
    add[i] += r.done;
  }
  let t = 0;
  return wd.filter(d => !upto || d <= upto).map((d, i) => ({ day: i + 1, date: d, done: (t += add[i]), y: storage + t * perService }));
}
