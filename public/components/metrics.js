// One definition, one label. A figure or term shown on more than one screen is defined here, and the
// screens import it, so they cannot drift apart. model/metrics.test.js holds them to it.
import { quantile } from './strip.js';

export const LABELS = {
  invoiced: 'Invoiced in VCK',
  normalDay: d => `normal for a ${d}`,
  normalRoute: 'normal for this route',
  slipping: 'still invoicing, the last 3 months at least 10% and $250 a month below the account\'s own prior 12',
  activeAccounts: 'active accounts (over $1,000 in the last 12 months)',
  invoicedThisMonth: 'Accounts invoiced this month',
  crossSell: 'a month if each account bought the lines its peers buy',
  volume: 'Work volume',
  value: 'Value of work',
  gridColours: 'Colours: each month against the six months before it',
};

const WEEKS = 8;
const sorted = a => [...a].sort((x, y) => x - y);
const median = a => a.length ? quantile(sorted(a), 0.5) : null;
const weekday = d => new Date(d + 'T00:00:00Z').getUTCDay();
const daysBack = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);

// Normal for a day: the median of that weekday's total done services over the last eight weeks
export function normalForDay(P, A, date) {
  const daily = new Map((P.dailyDone || []).map(r => [r.date, r.done]));
  if (!daily.size) for (const r of A.routeDays) daily.set(r.date, (daily.get(r.date) || 0) + (r.services_done || 0));
  const same = [...daily.entries()].filter(([d, n]) => d < date && weekday(d) === weekday(date) && n > 0)
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, WEEKS).map(([, n]) => n);
  return median(same);
}

// Normal for a route: its median on that weekday over the last eight weeks; a route that has run that
// weekday fewer than three times, its median over every day it ran in those eight weeks
export function routeNorms(A, date) {
  const from = daysBack(date, WEEKS * 7), out = {};
  const ran = A.routeDays.filter(r => r.route && r.route !== '--' && r.services_done > 0 && r.date < date && r.date >= from);
  for (const route of new Set(ran.map(r => r.route))) {
    const all = ran.filter(r => r.route === route), same = all.filter(r => weekday(r.date) === weekday(date));
    const use = same.length >= 3 ? same : all;
    out[route] = { done: median(use.map(r => r.services_done)), days: use.length, sameDay: use === same };
  }
  return out;
}
