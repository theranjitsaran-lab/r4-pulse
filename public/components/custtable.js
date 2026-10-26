// The customer table: each account's last posted month against the month before and the same month
// last year, its year to date against last year's, and this month so far.
//   Posted months are exact (kpi.customer_monthly, invoice date, Citadel apart).
//   This month so far is modelled ◇: VCK prices work only at the month-end run, so it is the
//   account's done services this month (Veri-Shred) × its own value per done service in the weeks
//   before (priced work ÷ done services, same days), against its done services at the same working
//   day last month. Accounts with no priced work in those weeks take the book's value per service.
// One function, used by Home's preview and the Customers table, so the two always agree.
import { seriesOf } from './series.js';
import { weekdaysOf, monthStart, addMonths } from './projection.js';
import { moneyK, sparkline } from './chart.js';

const sum = a => a.reduce((t, v) => t + (v || 0), 0);
const ch = (a, b) => b > 0 ? a / b - 1 : null;

// done services by account and day: the snapshot's account days when present, else the route
// orders (about three weeks)
function doneByDay(A) {
  const out = new Map();   // level1 → Map(date → done)
  const add = (id, d, n) => { if (!out.has(id)) out.set(id, new Map()); const m = out.get(id); m.set(d, (m.get(d) || 0) + n); };
  if (A.accountDays && A.accountDays.length) for (const r of A.accountDays) add(r.level1, r.date, r.done);
  else for (const o of A.orders) if (o.done && o.level1 != null) add(o.level1, o.date, 1);
  return out;
}

export function customerTable(C, A, { exclude = [6714], bookPerService = null } = {}) {
  const ser = seriesOf(C), months = C.months, n = months.length, last = months[n - 1];
  const yi = months.lastIndexOf(last.slice(0, 4) + '-01-01');
  const latest = A.latestDone, month = monthStart(latest), prev = addMonths(month, -1);
  const wd = weekdaysOf(month), k = wd.filter(d => d <= latest).length;
  const prevWd = weekdaysOf(prev), prevCut = prevWd[Math.min(k, prevWd.length) - 1];
  const byDay = doneByDay(A);
  // the comparison needs last month covered from its first day
  const firstDay = [...byDay.values()].flatMap(m => [...m.keys()]).sort()[0];
  const prevCovered = !!firstDay && firstDay <= prevWd[0];
  // value per done service: priced work ÷ done services over the same days
  const vFrom = A.dayValues.map(d => d.date).sort()[0], value = new Map();
  for (const d of A.dayValues) if (d.date < month) value.set(d.level1, (value.get(d.level1) || 0) + d.value);

  const rows = [];
  for (const s of ser.values()) {
    if (exclude.includes(s.level1)) continue;
    const t = s.total, L = t.length;
    const lastM = t[L - 1], before = t[L - 2], ly = t[L - 13];
    const ytd = yi >= 0 ? sum(t.slice(yi - (n - L))) : null;
    const lyStart = yi - 12 - (n - L), ytdLy = lyStart >= 0 ? sum(t.slice(lyStart, L - 12)) : null;
    const days = byDay.get(s.level1) || new Map();
    let mtd = 0, atK = 0, vDone = 0;
    for (const [d, c] of days) {
      if (d >= month && d <= latest) mtd += c;
      if (d >= prev && d <= prevCut) atK += c;
      if (vFrom && d >= vFrom && d < month) vDone += c;
    }
    const per = vDone > 0 && value.get(s.level1) > 0 ? value.get(s.level1) / vDone : bookPerService;
    if (!(lastM > 0 || before > 0 || ytd > 0 || mtd > 0)) continue;
    rows.push({
      level1: s.level1, customer: s.customer, s,
      last: lastM, lastPct: ch(lastM, before), dLast: lastM - (before || 0),
      lyPct: ch(lastM, ly), ytd, ytdLy, ytdPct: ytdLy ? ch(ytd, ytdLy) : null,
      mtd: { services: mtd, value: per != null ? mtd * per : null, own: vDone > 0, atK: prevCovered ? atK : null, pct: prevCovered && atK > 0 ? mtd / atK - 1 : null },
      spark: t.slice(-13),
    });
  }
  // work done this month for accounts outside the list (the customers fixture holds the larger ones)
  const outside = { services: 0, accounts: 0 };
  for (const [id, m] of byDay) {
    if (ser.has(id) || exclude.includes(id)) continue;
    let c = 0; for (const [d, v] of m) if (d >= month && d <= latest) c += v;
    if (c) { outside.services += c; outside.accounts++; }
  }
  return { rows, outside, last, before: months[n - 2], lyMonth: months[n - 13], month, prev, k, workdays: wd.length, prevCovered, latest };
}

// filters: falling and rising are on the last posted month against the month before, in dollars
export function falling(T) { return T.rows.filter(r => r.dLast < 0 && r.lastPct != null).sort((a, b) => a.dLast - b.dLast); }
export function rising(T) { return T.rows.filter(r => r.dLast > 0 && r.lastPct != null).sort((a, b) => b.dLast - a.dLast); }

// ── the table as HTML: Home shows a few rows, Customers the lot. Columns collapse on a phone to
// customer, last month and this month so far (CSS in components.css, .ctab).
const mon = (d, y) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', ...(y ? { year: '2-digit' } : {}), timeZone: 'UTC' }).replace(' ', " '");
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Llp|Llc|Pc|Inc)\b/g, w => w.toUpperCase());
// past threefold, a multiple reads better than a four-figure percentage
const pc = v => v == null ? '<span class="delta flat">—</span>' : `<span class="delta ${v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat'}">${v > 0 ? '▲' : v < 0 ? '▼' : ''} ${v >= 2 ? Math.round(v + 1) + '×' : Math.abs(Math.round(v * 100)) + '%'}</span>`;

export const COLUMNS = [
  { key: 'last', by: r => r.last },
  { key: 'lastPct', by: r => r.lastPct ?? -9 },
  { key: 'lyPct', by: r => r.lyPct ?? -9 },
  { key: 'ytd', by: r => r.ytd || 0 },
  { key: 'ytdPct', by: r => r.ytdPct ?? -9 },
  { key: 'mtd', by: r => r.mtd.value || 0 },
  { key: 'mtdPct', by: r => r.mtd.pct ?? -9 },
];

export function tableHtml(T, rows, { sort, dir } = {}) {
  const th = (key, label, cls = '') => `<th class="${cls}"${key ? ` data-sort="${key}" aria-sort="${sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'}" tabindex="0"` : ''}>${label}${key && sort === key ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  const so = `${mon(T.month)} so far ◇`;
  return `<table class="ctab"><thead><tr>
    ${th(null, 'Customer', 'nm')}${th('last', mon(T.last), 'n')}${th('lastPct', 'vs ' + mon(T.before), 'n')}${th('lyPct', 'vs ' + mon(T.lyMonth, 1), 'n x')}
    ${th('ytd', 'Year to date', 'n x')}${th('ytdPct', 'vs last year', 'n x')}${th('mtd', so, 'n')}${th('mtdPct', `vs ${mon(T.prev)}, day ${T.k}`, 'n x')}<th class="x sp">13 months</th>
  </tr></thead><tbody>${rows.map(r => `<tr data-href="#customer/${r.level1}">
    <td class="nm"><a href="#customer/${r.level1}">${esc(title(r.customer))}</a></td>
    <td class="n">${moneyK(r.last)}</td><td class="n">${pc(r.lastPct)}</td><td class="n x">${pc(r.lyPct)}</td>
    <td class="n x">${r.ytd != null ? moneyK(r.ytd) : '—'}</td><td class="n x">${pc(r.ytdPct)}</td>
    <td class="n">${r.mtd.services ? `${r.mtd.value != null ? moneyK(r.mtd.value) : '—'}<small>${r.mtd.services.toLocaleString('en-US')} done${r.mtd.own ? '' : ' · book rate'}</small>` : '<span class="pend">none done yet</span>'}</td>
    <td class="n x">${T.prevCovered ? pc(r.mtd.pct) : '<span class="pend">next snapshot</span>'}</td>
    <td class="x sp">${sparkline(r.spark, { w: 96, h: 26, cls: r.lastPct < -0.02 ? 'down' : r.lastPct > 0.02 ? 'up' : '' })}</td>
  </tr>`).join('')}</tbody></table>`;
}

export function sortRows(rows, sort, dir) {
  const c = COLUMNS.find(x => x.key === sort);
  return c ? rows.slice().sort((a, b) => (c.by(a) - c.by(b)) * dir) : rows;
}
