// Home (#pulse; #home2 while it was on trial) — Trisha's morning on her phone. White ground, R4 green, few words.
//   the summary: one headline and four headed points, each opening what is behind it (Claude's, checked, or the template)
//   the month: the bill known and the next one building ◇, each by its top three lines; the gap to $1.0M
//   lines of business: a month picker, each line's figure and thirteen monthly bars; a tap opens the customers behind it
//   the pulse: this month's work against last month's at the same working day; the last thirteen weeks
//   customers: the largest, rising and slipping five
//   where the money is: cross-sell ◇, route density ◇, what shredding the eligible boxes does to the P&L ◇
// Every figure from components/home2data.js, which the Ask sheet (server/ask.js) reads too.
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, titleCase, esc } from '/components/data.js';
import { reveal, drawIn } from '/components/motion.js';
import { parseHome2, checkNumbers } from '/components/summary.js';
import { areaFrame, landLayer, postcodeLayer, yardMark } from '/components/areamap.js';
import { openPop } from '/components/pop.js';

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monS = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pctW = v => v == null ? '' : `${Math.abs(Math.round(v * 100))}%`;
const tone = v => v == null ? 'flat' : v > 0.02 ? 'up' : v < -0.02 ? 'down' : 'flat';
const chip = (v, quiet) => v == null ? '<span class="h2-d flat">—</span>' : `<span class="h2-d ${quiet ? 'quiet' : tone(v)}">${v > 0.005 ? '▲' : v < -0.005 ? '▼' : ''}${v >= 2 ? ' ' + Math.round(v + 1) + '×' : ' ' + pctW(v)}</span>`;
const signedK = v => (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
const word = v => Math.abs(v) < 0.02 ? 'level with' : v > 0 ? `${pctW(v)} ahead of` : `${pctW(v)} behind`;

export async function render(main, P) {
  if (!main) return;
  // the figures, worked out on the server by the same functions (server/views.js): a few KB, not the
  // megabytes they come from; the map outline is cached by the browser for a day
  const [V, base] = await Promise.all([
    getJson('view/home'),
    fetch('/data/basemap.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const { month: m, weeks: w, seg, cust, cross, dens, dest } = V;
  const A = { latestDone: V.latestDone };

  const age = Math.round((Date.now() - Date.parse(A.latestDone + 'T12:00:00Z')) / 864e5);
  const dayLabel = new Date(A.latestDone + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const billShown = m.bill.core != null ? { month: m.bill.month, v: m.bill.core, d: m.bill.vsLast, vs: m.bill.lastMonth } : { month: m.bill.lastMonth, v: m.bill.lastCore, d: null };
  const jobWord = n => `${n} job${n === 1 ? '' : 's'} to check`;
  const jobsNote = m.next && m.next.jobCount ? `, before ${jobWord(m.next.jobCount)}` : '';
  const sheet = [
    m.next && { key: 'month', lead: true, href: '#pulse', line: `${mon(m.next.month)}'s bill is heading for about ${moneyK(m.next.central)} ◇${jobsNote}`, say: `${mon(m.next.month)}'s bill is heading for about ${moneyK(m.next.central)} ◇${jobsNote}.` },
    ...(V.points || []).map(p => ({ key: p.key, bullet: true, href: p.href, title: p.title, line: p.line, say: p.say })),
  ].filter(Boolean);
  const hrefOf = Object.fromEntries(sheet.map(f => [f.key, f.href])), titleOf = Object.fromEntries(sheet.map(f => [f.key, f.title]));

  // a bill's top three lines and the rest, which add up to the figure above them
  const billParts = (B, lead) => B ? `<ul class="h2-parts${lead ? ' lead' : ''}">${B.top.map(p => `<li><span>${esc(p.name)}</span><b>${moneyK(p.v)}</b></li>`).join('')}<li class="rest"><span>Other lines</span><b>${moneyK(B.rest)}</b></li></ul>` : '';
  const B = V.bills || {};

  const kpis = `<section class="h2-kpis bills" data-rv>
      <div class="h2-kpi lead"><span>${m.next ? `${mon(m.next.month)}'s bill, building ◇` : 'Next bill'}</span><b>${m.next ? '≈ ' + moneyK(m.next.central) : '—'}</b>
        <small>${m.next ? (m.next.jobCount ? `+ up to ${moneyK(m.next.jobs)}: ${jobWord(m.next.jobCount)}` : `${moneyK(m.next.lo)}–${moneyK(m.next.hi)} · day ${m.next.day} of ${m.next.workdays}`) : ''}</small>
        ${billParts(B.next, true)}</div>
      <a class="h2-kpi" href="#customers"><span>${mon(billShown.month)} billed</span><b>${moneyK(billShown.v)}</b><small>${billShown.d != null ? `${chip(billShown.d)} on ${mon(billShown.vs)}` : 'posted, core'}</small>
        ${billParts(B.billed)}</a>
      <a class="h2-kpi gap" href="#customers?view=opportunities"><span>Gap to $1.0M ›</span><b>${moneyK(m.gap)}</b><small>a month${m.next && m.next.jobCount ? ', before jobs to check' : ''}${V.sell ? ` · won this month ${moneyK(V.sell.won.value)}${V.sell.inPlay.n ? `, ${moneyK(V.sell.inPlay.value)} in play` : ''}` : ''}</small></a>
    </section>`;

  const sumCard = `<section class="h2-card h2-sum" data-rv>
      <div class="h2-sum-top"><span class="h2-date">${esc(dayLabel)}</span>${age > 2 ? `<span class="h2-stale">${age} days old</span>` : ''}<button class="h2-ask-inline" type="button">Ask ›</button></div>
      <h1 class="h2-head" id="h2-head"></h1>
      <ul class="h2-bul" id="h2-bul"></ul>
      <p class="h2-by" id="h2-by">From the figures below</p>
    </section>`;

  const pulse = `<div class="h2-row">
      <section class="h2-card h2-wide" data-rv><div class="h2-ch"><h2>${m.vsLast != null ? `${esc(mon(m.workMonth))}'s services done are ${word(m.vsLast)} ${esc(mon(m.prevMonth))}'s` : 'This month\'s services done'}</h2><small>the amount of work, by working day, at ${esc(mon(m.prevMonth))}'s value a service ◇</small></div><div id="h2-trend"></div></section>
      <section class="h2-card" data-rv><div class="h2-ch"><h2>${w.lastFull ? `Last week ${moneyK(w.lastFull.value)} ◇, ${w.vsAvg >= 0 ? 'up' : 'down'} ${pctW(w.vsAvg)}` : 'Weeks'}</h2><small>work done each week against the weeks before</small></div><div id="h2-weeks"></div></section>
    </div>`;

  const LV = V.lines;
  let lineMonth = LV ? LV.latest : null;
  const segCard = LV ? `<section class="h2-card" id="h2-lines" data-rv>
      <div class="h2-ch"><h2 id="h2-lines-t"></h2><small id="h2-lines-s"></small></div>
      <div class="seg h2-months" id="h2-months">${LV.pick.map(x => `<button data-m="${x}">${esc(monS(x))}${LV.meta[x].est ? ' ◇' : ''}</button>`).join('')}</div>
      <div class="h2-segs" id="h2-tiles"></div>
      <svg class="h2-defs" aria-hidden="true" width="0" height="0"><defs><pattern id="h2-est" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs></svg>
      <div class="src">Tap a line for the customers behind it · storage by the month it bills, service by the month of the work, Citadel apart · ◇ not yet billed: work orders at each account's own prices, charges added at the run carried from the last priced month; a job to check is left out until someone has looked at it</div></section>` :
    `<section class="h2-card pending" data-rv>Lines of business arrive with the next snapshot (npm run snapshot).</section>`;

  const custRow = (r, kind) => `<li><a href="#customer/${r.level1}"><span class="h2-cn">${esc(titleCase(r.customer))}</span>${sparkline(r.spark, { w: 72, h: 22, cls: 'service' })}
      <span class="h2-cv ${kind === 'top' ? '' : kind === 'rising' ? 'up' : 'down'}">${kind === 'top' ? moneyK(r.last3) : signedK(r.d)}<small>a month</small></span></a></li>`;
  const custCard = `<section class="h2-card" data-rv><div class="h2-ch"><h2>Customers</h2><small>last three months against each account's own year</small></div>
      <div class="seg h2-tabs"><button data-k="top" class="on">Largest</button><button data-k="rising">Rising</button><button data-k="falling">Slipping</button></div>
      <div class="h2-cols">
        <div class="h2-col" data-k="top"><h3>Largest</h3><ul class="h2-cl">${cust.top.map(r => custRow(r, 'top')).join('')}</ul></div>
        <div class="h2-col" data-k="rising"><h3>Rising</h3><ul class="h2-cl">${cust.rising.map(r => custRow(r, 'rising')).join('')}</ul></div>
        <div class="h2-col" data-k="falling"><h3>Slipping <a href="#customers?view=slipping">all ${cust.slipping} ›</a></h3><ul class="h2-cl">${cust.falling.map(r => custRow(r, 'falling')).join('')}</ul></div>
      </div></section>`;

  // ── where the money is ──
  const maxX = Math.max(...cross.rows.map(r => r.total + r.opp));
  const crossCard = `<section class="h2-card" data-rv><div class="h2-ch"><h2>${cross.rows.length} accounts could add ${moneyK(cross.rows.reduce((t, r) => t + r.opp, 0))} a year ◇</h2><small>what they buy, and what comparable accounts also buy</small></div>
      <ul class="h2-xs">${cross.rows.map(r => `<li><a href="#customer/${r.level1}"><span class="h2-cn">${esc(titleCase(r.customer))}</span>
        <span class="h2-xbar"><i class="have" style="--w:${(r.total / maxX * 100).toFixed(1)}%"></i><i class="opp" style="--w:${(r.opp / maxX * 100).toFixed(1)}%"></i></span>
        <span class="h2-chips">${r.lines.filter(l => !l.have && l.opp > 0).map(l => `<em>${esc(l.name)}</em>`).join('')}</span></a></li>`).join('')}</ul>
      <div class="h2-key"><span><i class="k have"></i>buys today</span><span><i class="k opp"></i>could add ◇</span></div>
      <p class="h2-note">${cross.byLine[0] ? `${esc(cross.byLine[0].name)} is the line missed most: ${cross.byLine[0].accounts} accounts, ${moneyK(cross.byLine[0].opp / 12)} a month ◇ at the ceiling.` : ''} <a href="#customers?view=whitespace">Every gap ›</a></p></section>`;

  const mapCard = dens ? `<section class="h2-card h2-wide" data-rv><div class="h2-ch"><h2>One more customer in these ${dens.save.length} postcodes saves ${moneyK(dens.saving)} a year ◇</h2><small>R4 already drives there; a second stop shares the trip</small></div>
      <div id="h2-map"></div>
      <ol class="h2-pc">${dens.save.slice(0, 4).map((r, i) => `<li><b>${i + 1}</b><span>${esc(r.postcode)} · ${Math.round(r.visitsYear)} visits a year · ${Math.round(r.miles)} mi</span><em>${moneyK(r.saving)}</em></li>`).join('')}</ol>
      <div class="src">${dens.points.length} postcodes visited · ${dens.single} with one customer · dot size is visits · straight-line miles from the yard (no GPS was ever captured)</div></section>` :
    `<section class="h2-card pending h2-wide" data-rv>The density map needs the postcode centres (public/data/zcta.json).</section>`;

  const payback = dest ? Math.round(dest.fee / (dest.lostYear / 12)) : null;
  const destCard = dest ? `<section class="h2-card" data-rv><div class="h2-ch"><h2>Shredding ${Math.round(dest.eligible / 1000)}K eligible boxes pays ${moneyK(dest.fee)} once ◇, then costs ${moneyK(dest.lostYear / 12)} a month</h2><small>${Math.round(dest.share * 100)}% of the building · the fee covers ${payback} months of lost storage unless new boxes refill the space</small></div>
      <div id="h2-dest"></div>
      <ul class="h2-dl">${dest.rows.slice(0, 3).map(r => `<li><a href="#customer/${r.level1}"><span class="h2-cn">${esc(titleCase(r.customer))}</span><span>${Math.round(r.eligible / 1000)}K boxes</span><em>${moneyK(r.fee)} once · −${moneyK(r.lostYear)} a year</em></a></li>`).join('')}</ul>
      <div class="src">Retention review overdue, not on hold or permanent · fee at the book's median $${dest.perBox.toFixed(2)} a box · storage at each account's own rate, refill at the median $${dest.med.toFixed(2)} a box a month</div></section>` : '';

  // ── yesterday: the day in a sentence, only what was not normal (components/changes.js), each line with
  // useful · knew · not right (a knew or wrong line is held back 30 days), and the team's lists ──
  const DS = V.day, TV = V.team.trisha, AN = V.team.anne, MK = V.team.mike;
  const fbBtns = i => `<span class="fb" data-key="${esc(i.key)}" data-subject="${esc(i.subject)}"><button data-v="useful">Useful</button><button data-v="knew">Knew</button><button data-v="wrong">Not right</button></span>`;
  const lines = ls => `<ul class="chg">${ls.map(i => `<li class="${i.level}"><span>${esc(i.text)}</span>${fbBtns(i)}</li>`).join('')}</ul>`;
  const t = TV.team;
  const dayCard = `<section class="h2-card h2-day" data-rv>
      <div class="h2-ch"><h2>${esc(dayLabel)}</h2><small>${DS ? esc(DS.text) : ''}</small></div>
      ${TV.lines.length ? lines(TV.lines.slice(0, 4)) : `<p class="quiet">Nothing unusual: the day's work and every route were within their usual range.</p>`}
      <div class="h2-team">
        <div><h3>Anne · this week <a href="#customers?view=conversations">all ›</a></h3><ol class="calls">${AN.calls.map(c => `<li><a href="#customer/${c.level1}"><b>${esc(titleCase(c.name))}</b><small>${esc(c.ev)}</small></a><span>${c.stake ? moneyK(c.stake) : ''}</span></li>`).join('')}</ol></div>
        <div><h3>Mike · next <a href="#activity">routes ›</a></h3>${MK.next ? `<p class="next">Booked for ${esc(MK.next.label)}: ${MK.next.services.toLocaleString('en-US')} services on ${MK.next.routes.length} routes${MK.next.routes.length ? ` (${MK.next.routes.slice(0, 4).map(r => `${esc(r.route)} ${r.services}`).join(', ')})` : ''}.</p>` : '<p class="quiet">Nothing booked ahead in the data.</p>'}</div>
      </div>
      <p class="h2-by">Last 7 days: ${t.called} called · ${t.emailed} emailed · rates moved on ${t.ratesMoved} accounts in 30 days · lines marked useful ${t.useful}, already known ${t.knew}, not right ${t.wrong}</p>
    </section>`;

  main.innerHTML = `<div class="h2">${sumCard}${kpis}${segCard}${pulse}${dayCard}${custCard}
    <details class="h2-fold" id="h2-money" ${innerWidth > 700 ? 'open' : ''}><summary class="h2-sec" data-rv>Where the money is<small>route density, cross-sell, shredding · ${innerWidth > 700 ? '' : 'open'}</small></summary>
    <div class="h2-row">${mapCard}${crossCard}</div>
    ${destCard}</details>
    <div class="h2-foot">Posted through ${mon(P.monthly[P.monthly.length - 1].month)} · work done through ${dm(A.latestDone)} · ◇ modelled: work priced at last month's value a service, costs from model/rates.js · Citadel held apart</div>
  </div>`;

  // the summary: the template now, Claude's when it arrives and passes the checks
  const draw = (text, by) => {
    const p = parseHome2(text, sheet);
    if (!p) return false;
    main.querySelector('#h2-head').textContent = p.headline;
    main.querySelector('#h2-bul').innerHTML = p.bullets.map(b => `<li class="${esc(b.key)}"><a href="${esc(hrefOf[b.key] || '#pulse')}"><span><b>${esc(titleOf[b.key] || '')}</b>${esc(b.text)}</span><i>›</i></a></li>`).join('');
    main.querySelector('#h2-by').textContent = by;
    return true;
  };
  const tmpl = [sheet.find(f => f.lead) || sheet[0], ...sheet.filter(f => f.bullet)];
  draw([tmpl[0].say || tmpl[0].line, ...tmpl.slice(1, 5).map(f => `[${f.key}] ${f.say || f.line}`)].join('\n'), 'From the figures below');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'home2', sheet: sheet.map(({ key, line, say, lead, bullet }) => ({ key, line, say, lead, bullet })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, sheet).ok && main.isConnected) draw(j.text, 'Written by Claude from these figures; every number checked'); })
    .catch(() => {});

  // Activity scrolls to the lines rather than leaving the page
  main.querySelector('#h2-bul').addEventListener('click', ev => {
    const a = ev.target.closest('a[href="#h2-lines"]'); if (!a) return;
    ev.preventDefault(); const t = main.querySelector('#h2-lines'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // the lines: a month picked, its figures and comparisons; a tap opens the customers behind a line
  const drawLines = () => {
    if (!LV) return;
    const x = lineMonth, meta = LV.meta[x], work = mon(x), bill = mon(new Date(Date.UTC(+x.slice(0, 4), +x.slice(5, 7), 1)).toISOString().slice(0, 10));
    main.querySelector('#h2-lines-t').textContent = `${work} by line of business${meta.est ? ' ◇' : ''}`;
    main.querySelector('#h2-lines-s').textContent = `${moneyK(LV.totals[x])}${meta.est ? ` · work so far, estimated; on ${bill}'s bill` : ` · ${work}'s storage and work, on ${work}'s and ${bill}'s bills`}${meta.jobs ? ` · ${jobWord(meta.jobCount)} (${moneyK(meta.jobs)})` : ''}`;
    main.querySelectorAll('#h2-months button').forEach(b => b.classList.toggle('on', b.dataset.m === x));
    main.querySelector('#h2-tiles').innerHTML = LV.rows.map(r => { const k = r.by[x], jobs = r.jobs[x] || 0;
      return `<button class="h2-seg" data-k="${r.key}" type="button"><span class="h2-seg-n">${esc(r.name)}</span><b>${moneyK(k.v)}</b>${chip(k.pct)}
        ${monthBars(r.bars, x, { w: 150, h: 40 })}
        <small>${jobs ? `+${moneyK(jobs)} to check` : `3M ${chip(k.p3, true)} · YTD ${chip(k.ytd, true)}`}</small></button>`; }).join('');
  };
  if (LV) {
    drawLines();
    main.querySelector('#h2-months').addEventListener('click', ev => { const b = ev.target.closest('button[data-m]'); if (b) { lineMonth = b.dataset.m; drawLines(); } });
    main.querySelector('#h2-tiles').addEventListener('click', ev => { const b = ev.target.closest('.h2-seg[data-k]'); if (b) openLine(b.dataset.k, lineMonth, LV); });
  }

  // customers: three columns on a desk, tabs on a phone
  const tabs = main.querySelectorAll('.h2-tabs button'), cols = main.querySelectorAll('.h2-col');
  const pick = k => { tabs.forEach(b => b.classList.toggle('on', b.dataset.k === k)); cols.forEach(c => c.classList.toggle('on', c.dataset.k === k)); };
  tabs.forEach(b => b.addEventListener('click', () => pick(b.dataset.k)));
  pick('top');

  trend(main.querySelector('#h2-trend'), m);
  weekBars(main.querySelector('#h2-weeks'), w);
  // the money section: drawn at its on-screen width, so on a phone when it is opened
  const money = main.querySelector('#h2-money');
  const drawMoney = () => { if (dens) densityMap(main.querySelector('#h2-map'), dens, base); if (dest) destChart(main.querySelector('#h2-dest'), dest); };
  if (money.open) drawMoney(); else money.addEventListener('toggle', () => { if (money.open && !money.dataset.drawn) { money.dataset.drawn = '1'; drawMoney(); } });

  // feedback on a line
  main.querySelector('.h2-day').addEventListener('click', async ev => {
    const b = ev.target.closest('.fb button'); if (!b) return;
    const box = b.closest('.fb'), li = b.closest('li');
    box.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      const r = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: box.dataset.key, subject: box.dataset.subject, verdict: b.dataset.v, brief_date: A.latestDone }) });
      if (!r.ok) throw new Error('not saved');
      box.innerHTML = `<em>${b.dataset.v === 'useful' ? 'Noted: useful' : b.dataset.v === 'knew' ? 'Held back for 30 days' : 'Marked not right'}</em>`;
      if (b.dataset.v !== 'useful') li.classList.add('held');
    } catch (e) { box.querySelectorAll('button').forEach(x => x.disabled = false); }
  });

  // the Ask button lives in the app shell (app.js); this one opens the same sheet
  main.querySelectorAll('.h2-ask-inline').forEach(b => b.addEventListener('click', () => dispatchEvent(new Event('open-ask'))));
  reveal(main.querySelector('.h2'));
}

// ── this month's work against last month's, by working day: last month a faint line, this month
// green over a wash, its value at the latest day marked ──
function trend(el, m) {
  if (!el || !m.thisMonth.length) return;
  const W = Math.max(300, Math.min(900, el.clientWidth || 600)), H = W < 500 ? 170 : 200, L = 6, Rr = W < 500 ? 46 : 56, T = 14, B = 22;
  const days = Math.max(m.workdays, m.lastMonth.length), top = Math.max(...m.lastMonth.map(p => p.y), ...m.thisMonth.map(p => p.y)) * 1.08;
  const step = top > 400e3 ? 100e3 : 50e3;
  const fx = d => L + (d - 1) / (days - 1) * (W - L - Rr), fy = y => T + (1 - y / top) * (H - T - B);
  let g = '';
  for (let v = step; v < top; v += step) g += `<line class="c-grid" x1="${L}" x2="${W - Rr}" y1="${fy(v)}" y2="${fy(v)}"/><text class="c-axis" x="${W - Rr + 6}" y="${fy(v) + 4}">${moneyK(v)}</text>`;
  g += `<line class="c-zero" x1="${L}" x2="${W - Rr}" y1="${fy(0)}" y2="${fy(0)}"/>`;
  for (const d of [1, 10, days]) g += `<text class="c-axis" x="${fx(d)}" y="${H - 6}" text-anchor="${d === 1 ? 'start' : d === days ? 'end' : 'middle'}">${d === 1 ? 'day 1' : d}</text>`;
  const pts = p => p.map(q => `${fx(q.day).toFixed(1)},${fy(q.y).toFixed(1)}`).join(' ');
  g += `<polyline class="h2-ghost" points="${pts(m.lastMonth)}"/>`;
  const e = m.thisMonth[m.thisMonth.length - 1], le = m.lastMonth[m.lastMonth.length - 1];
  g += `<text class="h2-lab ghost" x="${fx(le.day) - 4}" y="${fy(le.y) - 8}" text-anchor="end">${esc(monS(m.prevMonth))} ${moneyK(le.y)}</text>`;
  g += `<polygon class="h2-wash" points="${fx(1)},${fy(0)} ${pts(m.thisMonth)} ${fx(e.day)},${fy(0)}"/><polyline class="h2-line" points="${pts(m.thisMonth)}"/>`;
  g += `<circle class="h2-dot" cx="${fx(e.day)}" cy="${fy(e.y)}" r="4.5"/><text class="h2-lab" x="${fx(e.day) + 8}" y="${fy(e.y) + 4}">${moneyK(e.y)} ◇</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="This month's work by working day against last month's">${g}</svg>
    <div class="h2-key"><span><i class="k line"></i>${esc(mon(m.workMonth))}, to ${esc(dm(m.latestDone))}</span><span><i class="k ghost"></i>${esc(mon(m.prevMonth))}</span></div>`;
  drawIn(el.querySelector('svg'), { x: L, y: T, w: W - L, h: H - T - B });
}

// ── the last thirteen weeks of work, priced ◇; the week in progress hatched, the usual week a line ──
function weekBars(el, w) {
  if (!el || !w.rows.length) return;
  const W = Math.max(280, Math.min(600, el.clientWidth || 360)), H = 170, T = 16, B = 22;
  const max = Math.max(...w.rows.map(r => r.value)) * 1.1, slot = W / w.rows.length, bw = Math.min(18, slot * .62);
  const fy = v => T + (1 - v / max) * (H - T - B);
  let g = `<defs><pattern id="h2-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs>`;
  w.rows.forEach((r, i) => {
    const x = slot * (i + .5) - bw / 2, y = fy(r.value), h = H - B - y, rr = Math.min(4, h);
    g += `<path class="h2-bar${r.partial ? ' partial' : ''}${i === w.rows.length - (r.partial ? 2 : 1) ? ' last' : ''}" d="M${x},${H - B} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H - B} Z"><title>Week of ${dm(r.week)}: ${money0(r.value)} ◇, ${r.done} services${r.partial ? ' (so far)' : ''}</title></path>`;
    if (i % 4 === 0 || i === w.rows.length - 1) g += `<text class="c-axis" x="${slot * (i + .5)}" y="${H - 6}" text-anchor="middle">${dm(r.week)}</text>`;
  });
  if (w.avg) g += `<line class="h2-avg" x1="0" x2="${W}" y1="${fy(w.avg)}" y2="${fy(w.avg)}"/><text class="c-axis" x="0" y="${fy(w.avg) - 5}">usual ${moneyK(w.avg)}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="Work done each week, priced">${g}</svg>`;
}

// ── the sales layer: every postcode R4 visits, sized by visits; the ones where one more customer saves
// most, in green and numbered; the yard a square ──
function densityMap(el, d, base) {
  if (!el) return;
  const W = Math.max(300, Math.min(900, el.clientWidth || 600)), H = Math.round(W < 500 ? W * 0.95 : W * 0.6);
  const F = areaFrame(d.points.map(p => p.pt), W, H);
  let g = landLayer(base, F) + postcodeLayer(d.points.filter(p => !p.best), F) + yardMark(F);
  d.save.forEach((r, i) => {
    const pt = d.points.find(p => p.postcode === r.postcode); if (!pt) return;
    const [x, y] = F.P(pt.pt);
    g += `<g class="h2-best" transform="translate(${Math.max(10, Math.min(W - 10, x)).toFixed(1)},${Math.max(10, Math.min(H - 10, y)).toFixed(1)})"><circle r="10"/><text y="4" text-anchor="middle">${i + 1}</text><title>${esc(r.postcode)}: one more customer saves about ${money0(r.saving)} a year ◇</title></g>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-map" role="img" aria-label="Postcodes R4 visits, sized by visits, with the best places for one more customer numbered">${g}</svg>
    <div class="h2-key"><span><i class="k best"></i>one more customer saves most</span><span><i class="k pt"></i>visited, by visits a year</span><span><i class="k single"></i>one customer only</span></div>`;
}

// ── shredding the eligible boxes, over five years ◇: the fee once, then the storage lost each month
// (space left empty), against the space refilled at the book's median rate ──
function destChart(el, x) {
  if (!el) return;
  const W = Math.max(300, Math.min(900, el.clientWidth || 600)), H = 180, L = 6, Rr = W < 500 ? 52 : 64, T = 14, B = 22, N = 60;
  const lostM = x.lostYear / 12, refillM = (x.refilled - x.fee) / 12;
  const empty = t => x.fee - lostM * t, full = t => x.fee + refillM * t;
  const ys = [0, x.fee, empty(N), full(N)], lo = Math.min(...ys) * 1.1, hi = Math.max(...ys) * 1.1;
  const fx = t => L + t / N * (W - L - Rr), fy = v => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = `<line class="c-zero" x1="${L}" x2="${W - Rr}" y1="${fy(0)}" y2="${fy(0)}"/>`;
  for (const t of [0, 12, 24, 36, 48, 60]) g += `<text class="c-axis" x="${fx(t)}" y="${H - 6}" text-anchor="${t === 0 ? 'start' : t === N ? 'end' : 'middle'}">${t === 0 ? 'now' : `${t / 12} yr`}</text>`;
  const pts = f => Array.from({ length: N + 1 }, (_, t) => `${fx(t).toFixed(1)},${fy(f(t)).toFixed(1)}`).join(' ');
  g += `<polyline class="h2-line soft" points="${pts(full)}"/><polyline class="h2-line warn" points="${pts(empty)}"/>`;
  const be = x.fee / lostM;
  if (be <= N) g += `<circle class="h2-dot warn" cx="${fx(be)}" cy="${fy(0)}" r="4"/><text class="h2-lab" x="${fx(be)}" y="${fy(0) - 9}" text-anchor="middle">even at ${Math.round(be)} months</text>`;
  g += `<text class="h2-lab" x="${W - Rr + 6}" y="${fy(full(N)) + 4}">${moneyK(full(N))}</text><text class="h2-lab" x="${W - Rr + 6}" y="${fy(empty(N)) + 4}">${moneyK(empty(N))}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="Running effect on revenue of shredding the eligible boxes, over five years">${g}</svg>
    <div class="h2-key"><span><i class="k soft"></i>space refilled at the median</span><span><i class="k warn"></i>space left empty</span></div>`;
}

// ── thirteen monthly bars: the picked month dark, an estimated month hatched ──
function monthBars(bars, on, { w = 150, h = 40, labels = false } = {}) {
  const T = 2, B = labels ? 16 : 1, max = Math.max(...bars.map(b => b.v), 1), slot = w / bars.length, bw = Math.max(2, slot * .68);
  const g = bars.map((b, i) => {
    const bh = Math.max(b.v > 0 ? 1.5 : 0, Math.max(0, b.v) / max * (h - T - B)), x = slot * i + (slot - bw) / 2;
    const lab = labels && (i % 3 === 0 || i === bars.length - 1) ? `<text class="c-axis" x="${(x + bw / 2).toFixed(1)}" y="${h - 3}" text-anchor="middle">${esc(monS(b.m))}</text>` : '';
    return `<rect class="h2-mb${b.m === on ? ' on' : ''}${b.est ? ' est' : ''}" data-m="${b.m}" x="${x.toFixed(1)}" y="${(h - B - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"><title>${esc(monS(b.m))}: ${moneyK(b.v)}${b.est ? ' ◇' : ''}</title></rect>${lab}`;
  }).join('');
  return `<svg class="h2-mbs" viewBox="0 0 ${w} ${h}" aria-hidden="true">${g}</svg>`;
}

// ── a line's pop-out: the note, the months, this month, the customers behind it, what rose and fell ──
const nmL = s => esc(titleCase(s));
// why a job is left out, in a line: its size against what the account has bought, or no price of its own
const whyHeld = j => {
  const u = Math.round(j.units).toLocaleString('en-US'), at = '$' + j.rate.toFixed(2);
  if (j.reason === 'check') return `${u} hours at its own ${at}, against ${Math.round(j.maxUnits).toLocaleString('en-US')} at most before (last ${dm(j.lastDate)}). May be a keying error.`;
  return `${u} units, never bought before. Priced at the book's ${at}, usually what a first-time buyer pays.`;
};
async function openLine(key, month, LV) {
  const r = LV.rows.find(x => x.key === key), k = r.by[month], meta = LV.meta[month];
  const title = `${r.name} · ${mon(month)}${k.est ? ' ◇' : ''}`;
  openPop({ title, sub: moneyK(k.v), html: '<p class="hint">Reading the customers behind it…</p>', ask: `What is driving ${r.name} in ${mon(month)}?` });
  let d;
  try { d = await getJson(`view/line?key=${encodeURIComponent(key)}&month=${encodeURIComponent(month)}`); }
  catch (e) { openPop({ title, sub: moneyK(k.v), html: `<p>${esc(e.message)}</p>` }); return; }
  const sgn = v => (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
  const row = (x, right) => `<li><a href="#customer/${x.level1}"><span>${nmL(x.customer)}</span>${right}</a></li>`;
  const prevName = d.prevMonth ? mon(d.prevMonth) : 'the month before';
  // the facts the note is written from: every figure as the panel shows it
  const up = d.up[0], dn = d.down[0], jobsTxt = d.jobs.length ? `${d.jobs.length} job${d.jobs.length === 1 ? '' : 's'} (${moneyK(d.jobsValue)}) to check, not in this figure.` : '';
  const facts = [
    { key: 'total', line: `${r.name} in ${mon(month)}: ${moneyK(d.total)}${d.est ? ' ◇' : ''}${d.prev != null ? `, against ${moneyK(d.prev)} in ${prevName}` : ''}${k.pct != null ? (Math.abs(k.pct) < 0.005 ? ', level' : `, ${k.pct >= 0 ? 'up' : 'down'} ${pctW(k.pct)}`) + (d.partial ? ' at the same point in the month' : '') : ''}.` },
    k.p3 != null && { key: 'p3', line: `The last three months are ${k.p3 >= 0 ? 'up' : 'down'} ${pctW(k.p3)} on the three before${k.ytd != null ? `, and the year to date is ${k.ytd >= 0 ? 'up' : 'down'} ${pctW(k.ytd)}` : ''}.` },
    up && { key: 'up', line: `Largest rise: ${titleCase(up.customer)}, ${sgn(up.d)}.` },
    dn && { key: 'down', line: `Largest fall: ${titleCase(dn.customer)}, ${sgn(dn.d)}.` },
    jobsTxt && { key: 'jobs', line: jobsTxt },
  ].filter(Boolean);
  const tone2 = v => v == null ? '' : v > 0 ? 'up' : 'down';
  const html = `<p class="p2-lede" id="h2-note">${esc(facts.map(f => f.line).join(' '))}</p><p class="h2-by" id="h2-note-by">From the figures below</p>
    <div class="p2-mbs">${monthBars(d.bars, month, { w: 340, h: 92, labels: true })}</div>
    <ul class="h2-stats"><li><span>This month</span><b>${moneyK(d.total)}${d.est ? ' ◇' : ''}</b></li><li><span>On ${esc(monS(d.prevMonth || month))}</span><b>${chip(k.pct)}</b></li><li><span>3 months</span><b>${chip(k.p3)}</b></li><li><span>Year to date</span><b>${chip(k.ytd)}</b></li></ul>
    ${d.jobs.length ? `<h3>To check, not in the figure ◇</h3><ul class="h2-pl job">${d.jobs.map(j => `<li><a href="#customer/${j.level1}"><span>${nmL(j.customer)}<em>${esc(whyHeld(j))}</em></span><b>about ${moneyK(j.value)}</b></a></li>`).join('')}</ul>` : ''}
    <h3>Top 5 customers</h3><ul class="h2-pl">${d.top.map(x => row(x, `<small>${x.share != null ? Math.round(x.share * 100) + '%' : ''}</small><b>${moneyK(x.v)}</b>`)).join('')}<li class="rest"><span>All others</span><b>${moneyK(d.others)}</b></li></ul>
    ${d.up.length ? `<h3>Rising on ${esc(prevName)}</h3><ul class="h2-pl">${d.up.map(x => row(x, `<b class="h2-cv up">${sgn(x.d)}</b>`)).join('')}</ul>` : ''}
    ${d.down.length ? `<h3>Falling on ${esc(prevName)}</h3><ul class="h2-pl">${d.down.map(x => row(x, `<b class="h2-cv down">${sgn(x.d)}</b>`)).join('')}</ul>` : ''}
    ${d.est ? '<p class="src">◇ Work orders priced at each account\'s own rates; charges added at the run carried from the last priced month. Replaced by the invoices when the run posts.</p>' : ''}`;
  openPop({ title, sub: moneyK(d.total), html, ask: `What is driving ${r.name} in ${mon(month)}, and what should we do?` });
  const note = document.querySelector('#h2-note'), by = document.querySelector('#h2-note-by');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'line', sheet: facts }) })
    .then(x => x.ok ? x.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, facts).ok && note && note.isConnected) { note.textContent = j.text; by.textContent = 'Written by Claude from these figures; every number checked'; } })
    .catch(() => {});
}
