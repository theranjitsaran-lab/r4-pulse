// All accounts: three lit points, four tiles, the book by line (each line opens a drawer), who moved, then every
// account in one table (components/accttable.js). Every figure opens a pop-out that says why it is what it is.
// Figures from components/custbook.js and home2data.js, the same ones Home and Ask read.
import * as Fmt from '/components/format.js';
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { pricePosition, sizePeers, FAMS } from '/components/custbook.js';
import { customerView } from '/components/home2data.js';
import { FAMILY_NAMES } from '/components/margin.js';
import { serviceMedians, slippingAccounts, CITADEL } from '/components/levers.js';
import { LINES } from '/components/whitespace.js';
import { openPop } from '/components/pop.js';
import { costsVisible } from '/components/access.js';
import { LABELS, changeWord, isLumpy } from '/components/metrics.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { accountTable } from '/components/accttable.js';
import { litCard, drawPoints, tile, chip, chipText } from '/components/lit.js';
import { phoneFold } from '/components/phonekit.js';
import { openLine } from '/components/linedrawer.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const pct = v => `${Fmt.pct(v, { abs: true })}`;
const signedK = v => v == null ? '—' : (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
const unitMoney = (v, unit) => v == null ? '—' : '$' + (unit === 'box a month' || unit === 'lb' ? Fmt.fixed(v, 3) : Fmt.fixed(v, 2));

export async function render(main, C, params, tabs) {
  // the customer book and the book by line, worked out on the server (server/views.js)
  const [P, VW, R] = await Promise.all([getJson('pulse'), getJson('view/customers'), loadRates()]);
  const B = { rows: VW.rows, book: VW.book, months: VW.months, ws: VW.ws }, seg = VW.seg, PR = null;
  const cust = customerView({ C });
  const last = P.monthly[P.monthly.length - 1], prev = P.monthly[P.monthly.length - 2], ly = P.monthly[P.monthly.length - 13];
  const active = B.rows.filter(r => r.last > 0 && !r.citadel).length, activePrev = C.accounts.filter(a => a.level1 !== CITADEL && (a.storage[a.storage.length - 2] + a.service[a.service.length - 2]) > 0).length;
  const slip = slippingAccounts(C), slipV = slip.reduce((t, s) => t - s.move.d, 0);
  const crossV = B.ws.total / 12;
  const changeOf = v => v == null ? '' : Math.abs(v) < .01 ? 'level' : `${v > 0 ? 'up' : 'down'} ${Fmt.pct(v, { abs: true })}`;
  const topCross = VW.rows.filter(r => r.oppRow && r.oppRow.opp > 0).sort((a, b) => b.oppRow.opp - a.oppRow.opp)[0];
  const bestCell = r => Object.entries(r.oppRow.cells).filter(([, c]) => !c.have && c.opp > 0).sort((x, y) => y[1].opp - x[1].opp)[0];
  const lineWord = k => { const n = (LINES.find(x => x.key === k) || { name: k }).name; return n === 'ITAD' ? n : n.toLowerCase(); };
  const st = seg && seg.rows.find(x => x.key === 'storage');
  const mPct = last.core / prev.core - 1, biggest = slip.slice().sort((a, b) => a.move.d - b.move.d)[0];
  const pts = [
    slip.length ? { key: 'slip', tone: 'r', lead: `${slip.length} accounts are slipping,`, rest: `${moneyK(slipV)} a month below their own run.${biggest ? ` The biggest is ${titleCase(biggest.customer)}, down ${moneyK(-biggest.move.d)} a month.` : ''}` } : { key: 'slip', tone: 'g', lead: 'No account is slipping', rest: 'against its own run.' },
    { key: 'month', tone: mPct <= -.05 ? 'a' : 'g', lead: `Invoiced ${moneyK(last.core)} in ${mon(last.month)},`, rest: `${changeOf(mPct)} on ${mon(prev.month)}${ly ? ` and ${changeOf(last.core / ly.core - 1)} on a year ago` : ''}.${st ? ` Storage is ${moneyK(st.lm)} of the ${mon(seg.month)} lines.` : ''}` },
    { key: 'cross', tone: 'a', lead: `Cross-sell is worth up to ${moneyK(crossV)} a month`, rest: `if accounts bought like comparable ones.${topCross ? ` Start with ${titleCase(topCross.customer)}: ${lineWord(bestCell(topCross)[0])}.` : ''}` },
  ];

  const kpis = `<section class="ktiles">
    ${tile({ lead: true, label: `${LABELS.invoiced}, ${mon(last.month)}`, big: moneyK(last.core), sub: `${chip(mPct)} on ${esc(mon(prev.month))}${ly ? `, ${esc(changeOf(last.core / ly.core - 1))} on a year ago` : ''}`, spark: P.monthly.slice(-12).map(m => m.core) })}
    ${tile({ d: 80, label: LABELS.invoicedThisMonth, big: String(active), sub: `${chip(active / activePrev - 1)} on the month before` })}
    ${tile({ d: 160, href: '#customers?view=slipping', label: 'Slipping', big: String(slip.length), sub: `${chipText('−' + moneyK(slipV) + ' a month', 'down')} below their own run` })}
    ${tile({ d: 240, href: '#customers?view=whitespace', label: 'Cross-sell est.', big: moneyK(crossV), sub: 'a month, if each bought like its peers' })}
  </section>`;

  // the book by line: one bar, greens and greys, two columns; a line opens its drawer
  const lobCard = seg ? `<section class="h2-card" data-in><div class="h2-ch"><h2>${esc(mon(seg.month))} by line of business</h2><small>${moneyK(seg.total)}. Tap a line for its trend, top customers and what to do next.</small></div>
      <div class="lob-bar" aria-hidden="true">${seg.rows.map((s, i) => `<i class="l${i + 1}" style="flex:${Math.max(.2, s.lm / seg.total * 100).toFixed(2)} 0 0;--i:${i}"></i>`).join('')}</div>
      <div class="lob-list">${seg.rows.map((s, i) => `<button type="button" class="lob-row" data-line="${s.key}"><i class="l${i + 1}"></i><span>${esc(s.name)}</span><b>${moneyK(s.lm)}</b>${chip(s.lmPct) || '<span></span>'}<em class="chev"></em></button>`).join('')}</div></section>` : '';

  const movedCol = (title, tone, kind, list, val, more = '') => { const mx = Math.max(1, ...list.map(r => Math.abs(val(r)))); return `<div class="mv-col"><h3><span><span class="light ${tone}"></span>${title}</span>${more}</h3>${list.map((r, i) => { const v = val(r); return `<a class="mv-row" href="#customer/${r.level1}"><span>${esc(titleCase(r.customer))}</span><b class="${kind}">${kind === 'lgst' ? moneyK(v) : signedK(v)}</b><i class="${kind}" style="--s:${(Math.abs(v) / mx).toFixed(3)};--i:${i}"></i></a>`; }).join('')}<small>${kind === 'lgst' ? 'a month' : kind === 'up' ? 'a month on its own run' : 'a month below its own run'}</small></div>`; };
  const moved = `<section class="h2-card" data-tour="moved" data-in><div class="h2-ch"><h2>Who moved</h2><small>Last three months against each account's own year before</small></div><div class="mv-grid">
    ${movedCol('Largest', 'g', 'lgst', cust.top, r => r.last3)}${movedCol('Rising', 'g', 'up', cust.rising, r => r.d)}${movedCol('Slipping', 'r', 'down', cust.falling, r => r.d, `<a class="chev" href="#customers?view=slipping">All ${cust.slipping}</a>`)}</div></section>`;

  main.innerHTML = `<div class="cust c2 h2 ac">
    <h1>Accounts</h1>
    ${tabs}
    ${litCard('ac-lit', undefined, 'accounts-lit')}
    ${kpis}
    ${lobCard ? phoneFold('the book by line', lobCard) : ''}
    ${phoneFold('who moved', moved)}
    <section class="h2-card c2-tablecard" data-in>
      <div id="c2-dt"></div>
      <div class="src">Sales as invoiced, Citadel held apart from totals${costsVisible() ? '. Margin and cost a unit est. are modelled from GL pools over twelve months, provisional' : ''}. Tap an account for its lines, a month for its invoices.</div>
    </section>
  </div>`;
  drawPoints(main.querySelector('#ac-lit'), pts);
  main.querySelectorAll('.lob-row').forEach(b => b.addEventListener('click', () => openLine(seg.rows.find(s => s.key === b.dataset.line), { VW, seg })));

  const cellBtn = (r, inner, x) => `<button class="c2-x" data-x="${x}" data-id="${r.level1}">${inner}</button>`;
  const extra = [
    { k: 'd', l: 'Against its own run, a month', short: 'Own run', get: r => r.d, fmt: r => r.d == null ? '—' : cellBtn(r, `<span class="h2-cv ${r.movePct >= .2 ? 'up' : r.movePct <= -.2 ? 'down' : ''}">${signedK(r.d)}</span>`, 'sales') },
    { k: 'opp', l: 'Cross-sell est., a month', short: 'Cross-sell est.', get: r => r.opp ? r.opp / 12 : 0, fmt: r => r.opp > 0 ? cellBtn(r, moneyK(r.opp / 12), 'opp') : '—' },
    { k: 'gap', l: 'Under the book, a year', short: 'Under book', get: r => r.gap, fmt: r => r.gap > 0 ? cellBtn(r, moneyK(r.gap), 'gap') : '—' },
    { k: 'spark', l: '13 months', csv: () => '', fmt: r => r.spark ? sparkline(r.spark, { w: 84, h: 22, cls: 'service' }) : '' },
  ];
  if (params.line) history.replaceState(null, '', location.hash.replace(/([?&])line=/, '$1f_line='));   // links saved before the filter bar
  VW.lines = async r => { const v = await getJson('view/account-lines?level1=' + r.level1); return v.rows.map(l => ({ name: l.name, values: Object.fromEntries(v.months.map((m, i) => [m, l.values[i]])) })); };
  VW.explain = (b, r) => explain(b.dataset.x, r, { B, PR, line: null, R });
  accountTable(main.querySelector('#c2-dt'), { key: 'accounts', VW, C, R, B, P, extra });
  document.documentElement.classList.add('js');
  const root = main.querySelector('.c2');
  if (firstPlay('r4-accounts-played')) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }
}

// ── the pop-outs: why a figure is what it is, against similar accounts, and what to do ──
const bars = (items, max) => `<ul class="p2-bars">${items.map(i => `<li><span>${esc(i.name)}</span><i style="--w:${Math.max(1, i.v / max * 100).toFixed(1)}%" class="${i.cls || ''}"></i><b>${i.label}</b></li>`).join('')}</ul>`;

export async function explain(kind, r, { B, PR, line, R }) {
  if (kind === 'gap' && !PR) PR = await getJson('pricing');
  const name = titleCase(r.customer);
  const peers = sizePeers(B, r);
  if (kind === 'sales') {
    const fam = Object.entries(r.mfam).filter(([, v]) => v.revenue > 0).sort((a, b) => b[1].revenue - a[1].revenue);
    const max = Math.max(...fam.map(([, v]) => v.revenue), 1);
    const m = r.move;
    const missing = r.oppRow ? LINES.filter(x => !r.oppRow.cells[x.key].have && r.oppRow.cells[x.key].opp > 0) : [];
    return openPop({
      title: name, sub: `${moneyK(r.ltm)} in the last twelve months`, ask: `Why has ${name} moved the way it has, and what should we do?`,
      html: `${r.spark ? `<div class="p2-spark">${sparkline(r.spark, { w: 320, h: 70, cls: 'service' })}<small>13 months, storage and service</small></div>` : ''}
        ${m ? `<p class="p2-lede">The last three months averaged <b>${moneyK(m.last3)}</b> a month against its own <b>${moneyK(m.run)}</b> the year before: <b class="${m.d < 0 ? 'is-bad' : 'is-good'}">${signedK(m.d)}</b> a month${m.pct != null ? ` (${m.pct > 0 ? 'up' : 'down'} ${pct(m.pct)})` : ''}. Storage moved ${signedK(m.dStorage)}, service ${signedK(m.dService)}.</p>` : ''}
        ${peers.n && peers.move != null && m && m.pct != null ? `<p>Accounts of a similar size (${peers.n}) moved a median <b>${peers.move > 0 ? '+' : '−'}${pct(peers.move)}</b> over the same months, so this one is ${Math.abs(m.pct - peers.move) < .05 ? 'moving with the book' : m.pct < peers.move ? 'doing worse than its peers' : 'doing better than its peers'}.</p>` : ''}
        <h3>What it buys, last twelve months</h3>${bars(fam.map(([k, v]) => ({ name: FAMILY_NAMES[k] || k, v: v.revenue, label: moneyK(v.revenue) })), max)}
        ${missing.length ? `<h3>Not bought yet est.</h3><ul class="p2-list">${missing.map(x => `<li><b>${esc(x.name)}</b>: about ${moneyK(r.oppRow.cells[x.key].opp)} a year at ${esc(r.oppRow.cells[x.key].basis)}.</li>`).join('')}</ul>` : ''}
        ${B.months.length ? `<p class="p2-go"><a href="#" data-inv-id="${r.level1}" data-inv-m="${B.months[B.months.length - 1]}" data-inv-name="${esc(r.customer)}">See its invoices for ${esc(mon(B.months[B.months.length - 1]))} ›</a></p>` : ''}
        <p class="p2-go"><a href="#customer/${r.level1}">Open ${esc(name)} ›</a></p>`,
    });
  }
  if (kind === 'price') {
    const f = r.fam[line], p = pricePosition(B, r, line), fname = FAMS.find(x => x.key === line).name;
    let strip = '';
    if (p) {
      // the middle nine-tenths of the peers and this account; the odd outlier sits on the edge
      const W = 320, H = 54, at = k => p.all[Math.round(k * (p.all.length - 1))];
      const lo = Math.min(at(.05), f.price), hi = Math.max(at(.95), f.price), x = v => 8 + (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1) * (W - 16);
      const anchor = x(f.price) < 60 ? 'start' : x(f.price) > W - 60 ? 'end' : 'middle';
      strip = `<svg viewBox="0 0 ${W} ${H}" class="p2-strip" role="img" aria-label="Prices of similar accounts">
        <rect class="band" x="${x(p.p25)}" y="14" width="${Math.max(2, x(p.p75) - x(p.p25))}" height="18" rx="4"/>
        ${p.all.map(v => `<circle class="peer" cx="${x(v).toFixed(1)}" cy="23" r="2.5"/>`).join('')}
        <line class="med" x1="${x(p.med)}" x2="${x(p.med)}" y1="10" y2="36"/>
        <circle class="me" cx="${x(f.price)}" cy="23" r="6"/>
        <text x="${x(f.price)}" y="50" text-anchor="${anchor}">this account, ${unitMoney(f.price, f.unit)}</text></svg>`;
    }
    return openPop({
      title: `${name}, ${fname}`, sub: `${unitMoney(f.price, f.unit)} a ${f.unit}${f.costPer ? `; costs ${unitMoney(f.costPer, f.unit)} to serve est.` : ''}`, ask: `Is ${name} priced right for ${fname.toLowerCase()} against similar accounts?`,
      html: `${p ? `<p class="p2-lede">${p.widened ? `Few accounts buy ${fname.toLowerCase()} at ${esc(name)}'s volume, so this is the whole book (${p.n}), mostly smaller accounts that pay more a unit.` : `Against ${p.n} accounts buying ${fname.toLowerCase()} at a similar volume, it pays more than <b>${pct(p.pct)}</b> of them. Their middle half pays ${unitMoney(p.p25, p.unit)} to ${unitMoney(p.p75, p.unit)}, median ${unitMoney(p.med, p.unit)}.`}</p>${strip}` : '<p>Too few accounts buy this line in the same unit to compare.</p>'}
        <p>${f.costPer ? `It costs about <b>${unitMoney(f.costPer, f.unit)}</b> a ${esc(f.unit)} to serve est., so each one ${f.price >= f.costPer ? `leaves <b>${unitMoney(f.price - f.costPer, f.unit)}</b>` : `<b class="is-bad">loses ${unitMoney(f.costPer - f.price, f.unit)}</b>`}.` : ''}
        ${p && p.toMedian > 0 ? ` At its peers' median it would bill <b>+${moneyK(p.toMedian)} a year</b>.` : ''}</p>
        ${f.lines && f.lines.length ? `<h3>The cost working est.</h3><table class="p2-t"><tbody>${f.lines.map(l => `<tr><td class="tl">${esc(l[0])}<small>${esc(String(l[2] || '').split(/(?<=\.)\s/)[0])}</small></td><td>${money0(l[1])}</td></tr>`).join('')}</tbody></table>` : ''}
        ${p && !p.widened ? `<h3>Closest in volume</h3><ul class="p2-list">${p.names.map(n => `<li><a href="#customer/${n.level1}">${esc(titleCase(n.customer))}</a>: ${unitMoney(n.price, p.unit)} on ${Fmt.num(n.units)}</li>`).join('')}</ul>` : ''}`,
    });
  }
  if (kind === 'opp') {
    const row = r.oppRow, missing = LINES.filter(x => !row.cells[x.key].have && row.cells[x.key].opp > 0);
    return openPop({
      title: name, sub: `Could add about ${moneyK(row.opp / 12)} a month est.`, ask: `What should we sell ${name} next, and how?`,
      html: `<p class="p2-lede">${esc(name)} buys ${LINES.filter(x => row.cells[x.key].have).map(x => x.name.toLowerCase()).join(', ') || 'little'} today. Accounts like it also buy:</p>
        ${bars(missing.map(x => ({ name: x.name, v: row.cells[x.key].opp, label: moneyK(row.cells[x.key].opp), cls: 'opp' })), Math.max(...missing.map(x => row.cells[x.key].opp)))}
        <ul class="p2-list">${missing.map(x => `<li><b>${esc(x.name)}</b>: ${esc(row.cells[x.key].basis)}.</li>`).join('')}</ul>
        <p class="src">Estimates: A ceiling at what the median comparable spends, not a forecast. <a href="#customers?view=whitespace">Every gap on the Cross-sell grid ›</a></p>`,
    });
  }
  if (kind === 'gap') {
    const meds = serviceMedians(PR);
    const svc = PR.rates.filter(x => x.level1 === r.level1 && meds[x.servcode] && x.modal_rate > 0 && x.modal_rate < meds[x.servcode]);
    const st = PR.storage.find(x => x.level1 === r.level1);
    return openPop({
      title: name, sub: `About ${moneyK(r.gap)} a year under the book's median`, ask: `Which of ${name}'s prices should we raise first?`,
      html: `<p class="p2-lede">Where ${esc(name)} pays under the median account for the same service, and what the median would bill on its own volume.</p>
        <table class="p2-t"><thead><tr><th class="tl">Service</th><th>Pays</th><th>Median</th><th>A year</th></tr></thead><tbody>
        ${st ? `<tr><td class="tl">Storage, a box a month</td><td>${Fmt.money(st.rate_per_box, { dp: 3 })}</td><td colspan="2"><small>see Price gaps</small></td></tr>` : ''}
        ${svc.map(x => `<tr><td class="tl">${esc(titleCase(String(x.service).trim()))}<small>last moved ${esc(x.last_changed || '—')}</small></td><td>${Fmt.money(x.modal_rate, { dp: 2 })}</td><td>${Fmt.money(meds[x.servcode], { dp: 2 })}</td><td>${moneyK((meds[x.servcode] - x.modal_rate) * x.units)}</td></tr>`).join('')}</tbody></table>
        <p class="src">The median across accounts, not lines; a rate under a fifth of the median is left out as a likely unit mismatch. <a href="#pricing">Pricing ›</a></p>`,
    });
  }
}
