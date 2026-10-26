// What changed: the few things about a day that are not normal, each against its own norm, so the
// brief and each section say only what Anne, Mike and Trisha would not already know.
//
//   changesFor(P, A, date?) → { date, items: [{ key, owner, level, text, subject, figures }], quiet }
//
// Signals, each with the threshold that makes it worth a line (tuned by backtest(): a signal that
// fires on most days is noise and gets tightened, not shown):
//   day        services done against the same weekday over the last eight weeks, outside all of them
//   undone     booked services not done, against the same weekday's usual share
//   route      a route that did under 30% of its own usual day (routes doing 20 or more usually)
//   quiet      an account served most weeks that has now gone ten working days without a service,
//              said on the day it crosses (not every day after)
//   pace       month to date against last month at the same working day, beyond ±10%, said on Mondays
import { quantile } from './strip.js';
import { weekdaysOf } from './projection.js';

const wd = d => new Date(d + 'T00:00:00Z').getUTCDay();
const isWork = d => { const w = wd(d); return w > 0 && w < 6; };
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const dayName = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
const dayMon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const n0 = v => Math.round(v || 0).toLocaleString('en-US');
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
const routeName = r => /\d/.test(r || '') ? r : title(r);
const sorted = a => a.slice().sort((x, y) => x - y);

// Tuned by backtest over the 40 working days to 22 October 2026: with these, each signal fires on a
// quarter of days or fewer and half of all days are quiet (the 10th–90th band and a 50% route
// threshold fired on 15 and 29 days of 40).
export const RULES = { weeks: 8, lo: 0, hi: 1, thinShare: 0.3, thinMin: 20, quietDays: 10, usualWeeks: 4, pace: 0.10 };

// working days back from a date (exclusive), newest first
function workDaysBefore(date, n) { const out = []; for (let d = addDays(date, -1); out.length < n; d = addDays(d, -1)) if (isWork(d)) out.push(d); return out; }

export function changesFor(P, A, date = A.latestDone, opts = {}) {
  const R = { ...RULES, ...opts }, items = [];
  const daily = new Map((P.dailyDone || []).map(r => [r.date, r]));
  if (!daily.size) for (const r of A.routeDays) { const x = daily.get(r.date) || { date: r.date, done: 0, booked: 0 }; x.done += r.services_done || 0; x.booked += r.services || 0; daily.set(r.date, x); }
  const today = daily.get(date);

  // day: services done against the same weekday
  const same = [...daily.values()].filter(r => r.date < date && wd(r.date) === wd(date) && r.done > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, R.weeks);
  if (today && same.length >= 4) {
    const s = sorted(same.map(r => r.done)), lo = quantile(s, R.lo), hi = quantile(s, R.hi), med = quantile(s, 0.5);
    if (today.done < lo || today.done > hi) items.push({ key: 'day', owner: 'mike', level: today.done < lo ? 'down' : 'up', subject: 'day',
      text: `${dayName(date)}: ${n0(today.done)} services done, ${today.done < lo ? 'fewer' : 'more'} than a usual ${dayName(date)} (${n0(med)}; ${n0(lo)} to ${n0(hi)} over the last ${same.length}).`,
      figures: { done: today.done, median: med, lo, hi } });
    // undone: booked but not done
    const shares = sorted(same.filter(r => r.booked > 0).map(r => 1 - r.done / r.booked));
    if (today.booked > 0 && shares.length >= 4) {
      const share = 1 - today.done / today.booked, hiS = quantile(shares, R.hi);
      if (share > hiS && today.booked - today.done >= 20) items.push({ key: 'undone', owner: 'mike', level: 'down', subject: 'day',
        text: `${n0(today.booked - today.done)} of ${n0(today.booked)} services booked for ${dayName(date)} were not done (${Math.round(share * 100)}%; usually ${Math.round(quantile(shares, 0.5) * 100)}%).`,
        figures: { booked: today.booked, undone: today.booked - today.done } });
    }
  }

  // route: under half its own usual day
  const real = A.routeDays.filter(r => r.route && r.route !== '--' && r.date <= A.latestDone);
  const norm = {};
  for (const r of real.filter(x => x.services_done > 0 && x.date < date)) { const n = norm[r.route] = norm[r.route] || { days: 0, done: 0 }; n.days++; n.done += r.services_done; }
  for (const r of real.filter(x => x.date === date && x.services_done > 0)) {
    const n = norm[r.route]; if (!n || n.days < 4) continue;
    const usual = n.done / n.days;
    if (usual >= R.thinMin && r.services_done < R.thinShare * usual) items.push({ key: 'route', owner: 'mike', level: 'down', subject: 'route:' + r.route,
      text: `${routeName(r.route)} did ${n0(r.services_done)} services against its usual ${n0(usual)}${r.customers ? `, ${r.customers} customer${r.customers === 1 ? '' : 's'}` : ''}.`,
      figures: { route: r.route, done: r.services_done, usual } });
  }

  // quiet: served most weeks, now ten working days without a service; said the day it crosses
  if (A.accountDays && A.accountDays.length) {
    const by = new Map();
    for (const r of A.accountDays) if (r.done > 0 && r.date <= date) { if (!by.has(r.level1)) by.set(r.level1, []); by.get(r.level1).push(r.date); }
    const back = workDaysBefore(date, R.quietDays + 25), cross = back[R.quietDays - 1];   // the day the gap reaches the threshold
    const windowFrom = addDays(cross, -7 * (R.usualWeeks + 2));
    const names = new Map((A.orders || []).map(o => [o.level1, o.company]));
    for (const [id, dates] of by) {
      const lastServed = dates.sort().slice(-1)[0];
      if (lastServed !== cross) continue;   // crossed today, not before
      const weeks = new Set(dates.filter(d => d >= windowFrom && d <= cross).map(d => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.toISOString().slice(0, 10); }));
      if (weeks.size < R.usualWeeks) continue;
      items.push({ key: 'quiet', owner: 'anne', level: 'down', subject: 'account:' + id,
        text: `${title(names.get(id) || 'Account ' + id)} has had no service since ${dayMon(lastServed)}; it was served ${weeks.size} of the ${R.usualWeeks + 2} weeks before.`,
        figures: { level1: id, last: lastServed } });
    }
  }

  // pace: month to date against last month at the same working day, on Mondays
  if (wd(date) === 1) {
    const m = date.slice(0, 8) + '01', prev = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
    const k = weekdaysOf(m).filter(d => d <= date).length, pw = weekdaysOf(prev), cut = pw[Math.min(k, pw.length) - 1];
    const sumTo = (from, to) => [...daily.values()].filter(r => r.date >= from && r.date <= to).reduce((t, r) => t + r.done, 0);
    const now = sumTo(m, date), then = sumTo(prev, cut);
    if (then > 0 && Math.abs(now / then - 1) > R.pace) items.push({ key: 'pace', owner: 'trisha', level: now > then ? 'up' : 'down', subject: 'month',
      text: `Month to date: ${n0(now)} services done in ${k} working days, ${Math.round(Math.abs(now / then - 1) * 100)}% ${now > then ? 'ahead of' : 'behind'} last month at the same point (${n0(then)}).`,
      figures: { now, then, k } });
  }

  return { date, items, quiet: items.length === 0 };
}

// Run the signals over the last n working days with data and count how often each fires. A brief that
// speaks every day is not "what changed"; each signal should fire on a minority of days.
export function backtest(P, A, n = 40, opts = {}) {
  const dates = (P.dailyDone && P.dailyDone.length ? P.dailyDone.map(r => r.date) : A.routeDays.map(r => r.date))
    .filter(d => isWork(d) && d <= A.latestDone);
  const days = [...new Set(dates)].sort().slice(-n);
  const fires = {}, perDay = [];
  for (const d of days) {
    const c = changesFor(P, A, d, opts);
    perDay.push({ date: d, n: c.items.length, keys: c.items.map(i => i.key) });
    for (const i of c.items) fires[i.key] = (fires[i.key] || 0) + 1;
  }
  return { days: days.length, fires, quietDays: perDay.filter(x => !x.n).length, perDay };
}

// The day in one sentence, normal or not: work done against a usual same weekday, routes out, and the
// month to date against last month at the same working day. Not a flag; the frame the lines sit in.
export function daySentence(P, A, date = A.latestDone) {
  const daily = new Map((P.dailyDone || []).map(r => [r.date, r]));
  if (!daily.size) for (const r of A.routeDays) { const x = daily.get(r.date) || { date: r.date, done: 0 }; x.done += r.services_done || 0; daily.set(r.date, x); }
  const today = daily.get(date);
  if (!today) return null;
  const same = [...daily.values()].filter(r => r.date < date && wd(r.date) === wd(date) && r.done > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, RULES.weeks);
  const med = same.length ? quantile(sorted(same.map(r => r.done)), 0.5) : null;
  const routes = new Set(A.routeDays.filter(r => r.date === date && r.services_done > 0 && r.route && r.route !== '--').map(r => r.route)).size;
  const m = date.slice(0, 8) + '01', prev = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  const k = weekdaysOf(m).filter(d => d <= date).length, pw = weekdaysOf(prev), cut = pw[Math.min(k, pw.length) - 1];
  const sumTo = (from, to) => [...daily.values()].filter(r => r.date >= from && r.date <= to).reduce((t, r) => t + r.done, 0);
  const now = sumTo(m, date), then = sumTo(prev, cut), d = then ? now / then - 1 : null;
  const vs = med == null ? '' : Math.abs(today.done / med - 1) < 0.1 ? `, about a usual ${dayName(date)} (${n0(med)})` : `, against a usual ${dayName(date)}'s ${n0(med)}`;
  const mtd = d == null ? '' : ` Month to date ${n0(now)}, ${Math.abs(d) < 0.02 ? 'level with' : `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'ahead of' : 'behind'}`} last month at working day ${k}.`;
  return { text: `${n0(today.done)} services done on ${routes} route${routes === 1 ? '' : 's'}${vs}.${mtd}`, done: today.done, median: med, routes, mtd: now, mtdPrev: then };
}
