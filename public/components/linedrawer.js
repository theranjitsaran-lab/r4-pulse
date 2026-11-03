// One line of business in a right-hand drawer: three lit points, four small figures, twelve months, its five largest
// customers over twelve months, the five to act on (price gaps against the book and cross-sells, tagged) and a flag where
// an account buys the line but spends far less than comparable accounts. Every figure from the same functions as the page.
import * as Fmt from './format.js';
import { esc, getJson, titleCase } from './data.js';
import { openPop } from './pop.js';
import { moneyK } from './chart.js';
import { storageGaps, serviceMedians, unitSuspect, CITADEL } from './levers.js';
import { drawPoints, barsSvg, chip } from './lit.js';
import { accountKind } from './acctkind.js';

const addMonths = (m, n) => { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const mon = (d, f = 'long') => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: f, timeZone: 'UTC' });

// What R4 would bill if each account on this line paid the book's median: storage box-weighted, services by code
async function lineGaps(key) {
  const PR = await getJson('pricing');
  if (key === 'storage') return storageGaps(PR).rows.map(r => ({ level1: r.level1, name: titleCase(r.customer), worth: r.worth * 12, say: `${Fmt.money(r.rate, { dp: 3 })} a box against ${Fmt.money(r.med, { dp: 3 })} on ${Fmt.num(r.boxes)} boxes` }));
  const M = await getJson('margin'), inLine = new Set(M.lines.filter(l => (l.family && l.family !== 'none' ? l.family : 'other') === key).map(l => l.servcode)), meds = serviceMedians(PR), by = new Map();
  for (const r of PR.rates) {
    const med = meds[r.servcode];
    if (!inLine.has(r.servcode) || !med || r.level1 === CITADEL || !(r.modal_rate > 0) || r.modal_rate >= med || !(r.units > 0) || unitSuspect(r.modal_rate, med)) continue;
    const worth = (med - r.modal_rate) * r.units, a = by.get(r.level1);
    if (!a || worth > a.top) by.set(r.level1, { level1: r.level1, name: titleCase(r.customer), worth: (a ? a.worth : 0) + worth, top: worth, say: `${titleCase(String(r.service).trim())} at ${Fmt.money(r.modal_rate, { dp: 2 })} against ${Fmt.money(med, { dp: 2 })}` });
    else a.worth += worth;
  }
  return [...by.values()];
}

export async function openLine(s, { VW, seg }) {
  const last = seg.month, name = s.name, key = s.key;
  openPop({ title: `${name}, ${mon(last)}`, sub: 'Reading its accounts…', html: '<p class="sub">Reading its accounts…</p>', size: 'mid', ask: `What should we do next on ${name}?` });
  const rows = VW.rows.filter(r => !r.citadel && r.mfam && r.mfam[key] && r.mfam[key].revenue > 0).sort((a, b) => b.mfam[key].revenue - a.mfam[key].revenue);
  const total = rows.reduce((t, r) => t + r.mfam[key].revenue, 0), top = rows.slice(0, 5), topV = top.reduce((t, r) => t + r.mfam[key].revenue, 0), maxT = top.length ? top[0].mfam[key].revenue : 1;
  const gaps = await lineGaps(key).catch(() => []);
  const cross = VW.rows.filter(r => r.oppRow && r.oppRow.cells[key] && !r.oppRow.cells[key].have && r.oppRow.cells[key].opp > 0).map(r => ({ level1: r.level1, name: titleCase(r.customer), worth: r.oppRow.cells[key].opp, say: r.oppRow.cells[key].basis, cross: true }));
  const act = [...gaps, ...cross].sort((a, b) => b.worth - a.worth).slice(0, 5), maxA = act.length ? act[0].worth : 1;
  const lows = VW.rows.filter(r => r.oppRow && r.oppRow.cells[key] && r.oppRow.cells[key].low).sort((a, b) => (b.oppRow.cells[key].expected - b.oppRow.cells[key].spend) - (a.oppRow.cells[key].expected - a.oppRow.cells[key].spend));
  const body = document.querySelector('.pop .pop-b'); if (!body) return;
  document.querySelector('.pop .pop-s').textContent = `${moneyK(s.lm)}${seg.total ? `, ${Fmt.pct(s.lm / seg.total)} of the month` : ''}`;
  const lo = Math.min(...s.spark), hi = Math.max(...s.spark), g = gaps.slice().sort((a, b) => b.worth - a.worth).slice(0, 3), gv = g.reduce((t, x) => t + x.worth, 0);
  const pts = [
    { key: 'trend', tone: s.l3mPct != null && s.l3mPct <= -.1 ? 'r' : s.l3mPct != null && s.l3mPct < -.02 ? 'a' : 'g', lead: `${moneyK(lo)} to ${moneyK(hi)} a month over the year:`, rest: top.length ? `the five largest accounts hold ${Fmt.pct(topV / (total || 1))} of ${moneyK(total)}.` : `${moneyK(total)} in all.` },
    g.length ? { key: 'gap', tone: 'r', lead: 'Priced under the book:', rest: `${g.map(x => x.name).join(', ')}: ${moneyK(gv)} a year at the median.` } : { key: 'gap', tone: 'g', lead: 'Priced at the book:', rest: 'no account is far under the median on this line.' },
    cross.length ? (() => { const c = cross.slice().sort((a, b) => b.worth - a.worth)[0]; return { key: 'add', tone: 'a', lead: 'Room to add:', rest: `${c.name} does not buy it yet, about ${moneyK(c.worth)} a year est.` }; })() : { key: 'add', tone: 'g', lead: 'Nothing obvious to add:', rest: 'the largest accounts already buy this line or are too small to size.' },
  ];
  const ms = s.spark.map((v, i) => ({ m: addMonths(last, i - s.spark.length + 1), v }));
  const low = lows[0];
  body.innerHTML = `<div class="ld">
    <div id="ld-pts"></div>
    <div class="ld-minis"><div><small>${esc(mon(last))}</small><b>${moneyK(s.lm)}</b></div><div><small>On ${esc(mon(addMonths(last, -1)))}</small><b>${chip(s.lmPct) || '—'}</b></div><div><small>3 months</small><b>${chip(s.l3mPct) || '—'}</b></div><div><small>Year to date</small><b>${chip(s.ytdPct) || '—'}</b></div></div>
    <h3>Twelve months</h3>${barsSvg(ms, { height: 120, label: `${name} by month: ${moneyK(lo)} to ${moneyK(hi)}` })}
    <h3>Top 5 customers, twelve months</h3>
    <ul class="ld-top">${top.map((r, i) => `<li><a href="#customer/${r.level1}">${esc(titleCase(r.customer))}<small>${esc(accountKind(r.customer))}</small></a><span>${Fmt.pct(r.mfam[key].revenue / (total || 1))}</span><b>${moneyK(r.mfam[key].revenue)}</b><i style="--s:${(r.mfam[key].revenue / maxT).toFixed(3)};--i:${i}"></i></li>`).join('') || '<li class="none">No accounts on this line.</li>'}${rows.length > 5 ? `<li class="none"><span>All others</span><span></span><b>${moneyK(total - topV)}</b></li>` : ''}</ul>
    <h3>Top 5 to act on, a year</h3>
    <ul class="ld-top">${act.map((x, i) => `<li><a href="#customer/${x.level1}"><em class="${x.cross ? 'xs' : 'pg'}">${x.cross ? 'Cross-sell' : 'Price gap'}</em>${esc(x.name)}<small>${esc(x.say)}</small></a><span></span><b>${moneyK(x.worth)}</b><i style="--s:${(x.worth / maxA).toFixed(3)};--i:${i}"></i></li>`).join('') || '<li class="none">Nothing sized on this line.</li>'}</ul>
    ${low ? `<p class="ld-flag"><b>Low for its type:</b> ${esc(low.oppRow.cells[key].note)}</p>` : ''}
    <p class="src">Twelve months by the line's priced work, storage as invoiced. A gap is the most there is to win, not a forecast.</p></div>`;
  drawPoints(body.querySelector('#ld-pts'), pts);
}
