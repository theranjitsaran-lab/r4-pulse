// One definition, one label. A figure or term shown on more than one screen is defined here, and the
// screens import it, so they cannot drift apart. model/metrics.test.js holds them to it.
import { quantile } from './strip.js';

export const LABELS = {
  invoiced: 'Invoiced in VCK',
  veriShred: 'Done is what drivers confirmed in Veri-Shred.',
  estWord: 'est. means estimated',
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

// The stamp at the top of every screen: how far the data runs and when it last moved. Amber when done
// work is older than the last working day, naming the feed that is late.
const dayShort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export function lastWorkingDay(today) {
  for (let i = 1; i <= 7; i++) { const d = daysBack(today, i), w = weekday(d); if (w > 0 && w < 6) return d; }
  return today;
}
export function freshStamp(h, today) {
  if (!h || !h.done_work) return null;
  const late = h.done_work < lastWorkingDay(today);
  const at = h.updated ? ` · last update ${dayShort(h.updated.slice(0, 10))} ${h.updated.slice(11, 16)}` : '';
  return { late, text: `Data to ${dayShort(h.done_work)}${at}${late ? ` · late: Veri-Shred has sent no finished work since then` : ''}` };
}

// The tie-out: the latest invoiced month on screen against VCK's own invoices for that month. It holds
// unless an invoice has been posted, changed or removed since the month's figures were built.
export function tieOut(P) {
  const last = P.monthly[P.monthly.length - 1], r = (P.tieout || []).find(x => x.month === last.month);
  if (!r) return null;
  const core = r.storage + r.service - r.citadel, moved = core - last.core;
  return { month: last.month, invoices: r.invoices, core, shown: last.core, moved, ok: Math.abs(moved) < 1 };
}

// Yesterday in a line: services against normal for that day, and the routes that ran thin against their own.
export const THIN = 0.6;
const routeWord = r => /\d/.test(r || '') ? r : String(r || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase());
export function yesterdayLine(P, A, date = A.latestDone) {
  const rows = A.routeDays.filter(r => r.date === date && r.route && r.route !== '--' && r.services_done > 0);
  if (!rows.length) return null;
  const done = rows.reduce((t, r) => t + r.services_done, 0), name = new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const normal = normalForDay(P, A, date), norms = routeNorms(A, date);
  const thin = rows.filter(r => norms[r.route] && r.services_done < THIN * norms[r.route].done).map(r => routeWord(r.route));
  return { date, label: new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }), done, thin,
    text: `${done.toLocaleString('en-US')} services on ${rows.length} route${rows.length === 1 ? '' : 's'}${normal != null ? `, ${Math.round(normal)} ${LABELS.normalDay(name)}` : ''}.${thin.length ? ` Thin: ${thin.join(', ')}.` : ''}` };
}

// Three things to act on: what changed first, then the calls most at stake; each with its owner and where it opens.
const hrefOf = subject => { const s = String(subject || ''); return s.startsWith('account:') ? '#customer/' + s.slice(8) : s.startsWith('route:') || s === 'day' ? '#activity' : '#numbers'; };
export function topActions({ lines = [], calls = [] }, n = 3) {
  const short = t => String(t).replace(/ \(.*?\)/, '').replace(/ over the last three months.*$/, '').replace(/,? against its own run.*$/, '');
  const a = lines.map(i => ({ owner: i.owner, text: i.text, key: i.key, subject: i.subject, href: hrefOf(i.subject) }));
  const b = calls.map(c => ({ owner: 'anne', text: `${c.name}: ${short(c.ev)}`, key: 'call', subject: 'account:' + c.level1, href: '#customer/' + c.level1 }));
  return [...a, ...b].slice(0, n);
}

// A change as a word: a percentage, or "new" when the month before was too small for a percentage to mean anything
export function changeWord(v, base = null) {
  if (v == null) return '—';
  if ((base != null && base < 500) || v >= 5) return 'new';
  return `${v > 0.005 ? '▲ ' : v < -0.005 ? '▼ ' : ''}${Math.abs(Math.round(v * 100))}%`;
}

// R4's own accounts and placeholders, which are not customers to quote or chase
export const isInternal = name => /^r4\b|\br4 services\b|single invoice|^account \d+$|bear stearns/i.test(String(name || '').trim());
// account size, by twelve months' revenue; one set of bands everywhere
export const SIZE_BANDS = [['s', 'Under $10K a year', 0, 1e4], ['m', '$10K to $50K', 1e4, 5e4], ['l', '$50K to $250K', 5e4, 25e4], ['x', 'Over $250K', 25e4, Infinity]];
export const inBand = (k, v) => { const b = SIZE_BANDS.find(x => x[0] === k); return !!b && v >= b[2] && v < b[3]; };
