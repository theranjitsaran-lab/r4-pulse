// The morning emails: one each for Trisha, Anne and Mike, from the same lists the app shows
// (public/components/changes.js and lists.js), so the email and Home never disagree.
//   Trisha  the day in a sentence, her lines, the team's lines in one line, the month in one row,
//           what the team did last week
//   Anne    accounts that changed, and this week's conversations with a draft opening line
//   Mike    yesterday's routes that were not normal, and what is booked for today
// Every line carries three taps (useful · knew · not right): signed links to <url>/f/<token>.
// On a morning with no new data, each email says only that.
import { changesFor, daySentence } from '../public/components/changes.js';
import { anneList, mikeList, trishaView } from '../public/components/lists.js';
import { billNow, TARGET } from '../public/components/levers.js';
import { project, dailyFrom } from '../public/components/projection.js';
import { moneyK } from '../public/components/chart.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dayLong = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const isWork = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w > 0 && w < 6; };

// working days strictly between the latest done day and the morning of the email
export function workDaysSince(latest, today) {
  let n = 0;
  for (let d = new Date(latest + 'T00:00:00Z'); ; ) { d.setUTCDate(d.getUTCDate() + 1); const s = d.toISOString().slice(0, 10); if (s >= today) break; if (isWork(s)) n++; }
  return n;
}

const G = '#0e5116';
const wrap = (title, body, url) => `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" style="max-width:620px;background:#ffffff;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="background:${G};color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;font-size:14px"><b>R4 Pulse</b> · ${esc(title)}</td></tr>
<tr><td style="padding:18px 20px;font-size:15px;line-height:1.5">${body}
<p style="margin:20px 0 0;font-size:12px;color:#6e6e73">Tap Knew on a line you already knew and lines like it are left out for 30 days. <a href="${esc(url)}" style="color:${G}">Open R4 Pulse</a></p></td></tr>
</table></td></tr></table></body></html>`;

function lineHtml(i, taps) {
  const bar = i.level === 'down' ? '#c0392b' : i.level === 'up' ? '#2e7d32' : '#c7c7cc';
  return `<tr><td style="border-left:3px solid ${bar};padding:6px 0 6px 10px;font-size:14px">${esc(i.text)}<br>${taps(i)}</td></tr>`;
}

export function buildBriefs({ P, A, C, PR, CA, log = [], feedback = [], today, url, sign, people }) {
  const date = A.latestDone, behind = workDaysSince(date, today);
  const tapLink = (who, i, v) => `${url}/f/${sign({ who, key: i.key, subject: i.subject, verdict: v, brief_date: date })}`;
  const taps = who => i => ['useful', 'knew', 'wrong'].map(v => `<a href="${esc(tapLink(who, i, v))}" style="font-size:12px;color:#6e6e73;margin-right:12px">${v === 'useful' ? 'Useful' : v === 'knew' ? 'Knew' : 'Not right'}</a>`).join('');
  const out = [];

  if (behind > 1) {
    const msg = `No new data since ${dayLong(date)}: the overnight load has not run. Nothing below would be new, so this is all for today.`;
    for (const p of people) out.push({ who: p.who, to: p.to, subject: `R4 Pulse: no new data since ${dayLong(date)}`, text: msg, html: wrap('no new data', `<p style="margin:0">${esc(msg)}</p>`, url), sheet: null, stale: true });
    return out;
  }

  const CH = changesFor(P, A), DS = daySentence(P, A);
  const daySay = DS ? DS.text : '';
  for (const p of people) {
    if (p.who === 'trisha') {
      const T = trishaView({ CA, log, feedback, changes: CH, who: p.who });
      const own = T.lines.filter(i => i.owner === 'trisha'), team = T.lines.filter(i => i.owner !== 'trisha');
      const BN = billNow(P, A), X = project({ daily: dailyFrom(P, A), latest: A.latestDone, perService: BN.perService, storage: BN.storage, routeDays: A.routeDays });
      const nb = new Date(Date.UTC(+BN.month.slice(0, 4), +BN.month.slice(5, 7), 1)).toISOString().slice(0, 10);
      const month = X.bill ? `${mon(nb)}'s bill is heading for about ${moneyK(X.bill.central)} ◇ (${moneyK(X.bill.lo)} to ${moneyK(X.bill.hi)}), ${moneyK(TARGET - X.bill.central)} short of $1.0M.` : '';
      const t = T.team;
      const teamSay = `Last 7 days: ${t.called} called, ${t.emailed} emailed, rates moved on ${t.ratesMoved} accounts in 30 days.`;
      const sheet = [{ key: 'day', line: daySay }, ...own.map(i => ({ key: i.key, line: i.text })), ...team.map(i => ({ key: i.key, line: `${i.owner === 'mike' ? 'Mike' : 'Anne'}: ${i.text}` })), month && { key: 'month', line: month }].filter(x => x && x.line);
      const body = `<p style="margin:0 0 10px;font-size:17px" data-opening>${esc(daySay)}</p>
        ${own.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${own.map(i => lineHtml(i, taps(p.who))).join('')}</table>` : ''}
        ${['mike', 'anne'].map(o => { const ls = team.filter(i => i.owner === o); return ls.length ? `<p style="margin:12px 0 0;font-size:14px;color:#3a3a3c"><b>For ${o === 'mike' ? 'Mike' : 'Anne'}:</b> ${ls.map(i => esc(i.text)).join(' ')}</p>` : ''; }).join('')}
        ${month ? `<p style="margin:12px 0 0;font-size:14px">${esc(month)}</p>` : ''}
        <p style="margin:12px 0 0;font-size:13px;color:#6e6e73">${esc(teamSay)}</p>`;
      out.push({ who: p.who, to: p.to, subject: `R4 Pulse · ${dayLong(date)}${own.length + team.length ? ` · ${own.length + team.length} to know` : ' · a normal day'}`, html: wrap(dayLong(date), body, url), text: [daySay, ...own.map(i => i.text), ...team.map(i => i.text), month, teamSay].filter(Boolean).join('\n'), sheet });
    } else if (p.who === 'anne') {
      const L = anneList({ C, PR, CA, log, feedback, changes: CH, who: p.who, n: 5 });
      const callT = c => ({ key: 'call', subject: 'account:' + c.level1 });
      const body = `${L.lines.length ? `<p style="margin:0 0 6px;font-weight:600">Changed</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${L.lines.map(i => lineHtml(i, taps(p.who))).join('')}</table>` : ''}
        <p style="margin:${L.lines.length ? '14px' : '0'} 0 6px;font-weight:600">This week's conversations</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${L.calls.map((c, k) => `<tr><td style="padding:8px 0;border-top:1px solid #e5e5ea;font-size:14px">
          <b>${k + 1}. <a href="${esc(url)}/#customer/${c.level1}" style="color:#1d1d1f;text-decoration:none">${esc(c.name)}</a></b>${c.stake ? ` · ${moneyK(c.stake)} a year at stake` : ''}<br>
          <span style="color:#3a3a3c">${esc(c.sigs[0].ev)}</span><br>
          <span style="color:#6e6e73;font-style:italic">Draft opening: “${esc(c.opener)}”</span><br>${taps(p.who)(callT(c))}</td></tr>`).join('')}</table>`;
      out.push({ who: p.who, to: p.to, subject: `R4 Pulse · ${L.lines.length ? `${L.lines.length} account${L.lines.length === 1 ? '' : 's'} changed · ` : ''}${L.calls.length} conversations this week`, html: wrap('this week', body, url), text: [...L.lines.map(i => i.text), ...L.calls.map(c => `${c.name}: ${c.sigs[0].ev}`)].join('\n'), sheet: null });
    } else if (p.who === 'mike') {
      const L = mikeList({ A, feedback, changes: CH, who: p.who });
      const body = `<p style="margin:0 0 10px">${esc(daySay)}</p>
        ${L.lines.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${L.lines.map(i => lineHtml(i, taps(p.who))).join('')}</table>` : '<p style="margin:0;color:#3a3a3c">Every route was within its usual range.</p>'}
        ${L.next ? `<p style="margin:14px 0 0">Booked for ${esc(L.next.label)}: ${L.next.services.toLocaleString('en-US')} services on ${L.next.routes.length} routes${L.next.routes.length ? ` (${esc(L.next.routes.map(r => `${r.route} ${r.services}`).join(', '))})` : ''}.</p>` : ''}`;
      out.push({ who: p.who, to: p.to, subject: `R4 Pulse · ${dayLong(date)}${L.lines.length ? ` · ${L.lines.length} route line${L.lines.length === 1 ? '' : 's'}` : ' · routes normal'}`, html: wrap(dayLong(date), body, url), text: [daySay, ...L.lines.map(i => i.text)].join('\n'), sheet: null });
    }
  }
  return out;
}
