// Home (#pulse; #home2 while it was on trial) — Trisha's morning on her phone. White ground, R4 green, few words.
//   the summary: one headline and three bullets, each opening its list (Claude's, checked, or the template)
//   the month: the bill known, the next one building ◇, the gap to $1.0M
//   the pulse: this month's work against last month's at the same working day; the last thirteen weeks
//   lines of business: last month, three months and the year, each against the period before
//   customers: the largest, rising and slipping five
//   where the money is: cross-sell ◇, route density ◇, what shredding the eligible boxes does to the P&L ◇
// Every figure from components/home2data.js, which the Ask sheet (server/ask.js) reads too.
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, loadRates, titleCase, esc } from '/components/data.js';
import { reveal, drawIn } from '/components/motion.js';
import { parseHome2, checkNumbers } from '/components/summary.js';
import { areaFrame, landLayer, postcodeLayer, yardMark } from '/components/areamap.js';
import { homeView } from '/components/home2data.js';

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
  const [A, C, M, PR, CA, S, SG, R, Z, base] = await Promise.all([
    getJson('activity'), getJson('customers'), getJson('margin'), getJson('pricing'), getJson('calls'), getJson('storage'),
    getJson('segments').catch(() => null), loadRates(),
    fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    fetch('/data/basemap.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);
  const V = homeView({ P, A, C, M, PR, CA, S, SG, R, Z });
  const { month: m, weeks: w, seg, cust, cross, dens, dest } = V;

  const age = Math.round((Date.now() - Date.parse(A.latestDone + 'T12:00:00Z')) / 864e5);
  const dayLabel = new Date(A.latestDone + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const billShown = m.bill.core != null ? { month: m.bill.month, v: m.bill.core, d: m.bill.vsLast, vs: m.bill.lastMonth } : { month: m.bill.lastMonth, v: m.bill.lastCore, d: null };
  const lastSeg = seg ? seg.rows.slice().sort((a, b) => Math.abs((b.lmPct || 0) * b.lm) - Math.abs((a.lmPct || 0) * a.lm))[0] : null;
  const fall = cust.falling[0], rise = cust.rising[0];

  // the sheet the summary is written from: one fact a line, the template's sentence, where it opens
  const sheet = [
    age > 2 && { key: 'stale', line: `The data stops on ${dm(A.latestDone)}, ${age} days ago`, say: `Data stops on ${dm(A.latestDone)}, ${age} days ago.`, href: '#pulse' },
    m.next && { key: 'month', lead: true, href: '#pulse',
      line: `${mon(m.next.month)}'s bill is building towards about ${moneyK(m.next.central)} ◇ (likely ${moneyK(m.next.lo)} to ${moneyK(m.next.hi)}), ${moneyK(m.gap)} short of the $1.0M target`,
      say: `${mon(m.next.month)} is heading for about ${moneyK(m.next.central)} ◇, ${moneyK(m.gap)} short of $1.0M.` },
    m.vsLast != null && { key: 'pace', bullet: true, href: '#pulse', line: `${mon(m.workMonth)}'s work is ${word(m.vsLast)} ${mon(m.prevMonth)}'s at working day ${m.day}`,
      say: `${mon(m.workMonth)}'s work is ${word(m.vsLast)} ${mon(m.prevMonth)}'s at day ${m.day}.` },
    fall && { key: 'slipping', bullet: true, href: `#customer/${fall.level1}`, line: `${titleCase(fall.customer)} is slipping most, ${moneyK(Math.abs(fall.d))} a month below its own run; ${cust.slipping} accounts are slipping`,
      say: `${titleCase(fall.customer)} is down ${moneyK(Math.abs(fall.d))} a month on its own run.` },
    w.lastFull && w.vsAvg != null && { key: 'week', href: '#activity', line: `Last full week's work was ${moneyK(w.lastFull.value)} ◇, ${pctW(w.vsAvg)} ${w.vsAvg >= 0 ? 'above' : 'below'} the weeks before` },
    rise && { key: 'rising', href: `#customer/${rise.level1}`, line: `${titleCase(rise.customer)} is rising most, ${moneyK(rise.d)} a month above its own run` },
    lastSeg && lastSeg.lmPct != null && { key: 'segment', href: '#pulse', line: `${lastSeg.name} billed ${moneyK(lastSeg.lm)} in ${mon(seg.month)}, ${lastSeg.lmPct > 0 ? 'up' : 'down'} ${pctW(lastSeg.lmPct)} on the month before` },
    { key: 'cross', bullet: true, href: '#customers?view=whitespace', line: `Selling existing customers what they don't buy yet is worth up to ${moneyK(cross.totalMonth)} a month ◇; ${cross.byLine[0] ? `${cross.byLine[0].name} is missed most, by ${cross.byLine[0].accounts} accounts` : ''}`,
      say: `Cross-sell is worth up to ${moneyK(cross.totalMonth)} a month ◇${cross.byLine[0] ? `, ${cross.byLine[0].name} most of all` : ''}.` },
    dest && { key: 'shred', href: '#activity?tab=warehouse', line: `${Math.round(dest.eligible / 1000)}K boxes are eligible to shred: ${moneyK(dest.fee)} once ◇, then ${moneyK(dest.lostYear / 12)} a month of storage lost` },
  ].filter(Boolean);
  const hrefOf = Object.fromEntries(sheet.map(f => [f.key, f.href]));

  const kpis = `<section class="h2-kpis" data-rv>
      <div class="h2-kpi lead"><span>${m.next ? `${mon(m.next.month)}'s bill, building ◇` : 'Next bill'}</span><b>${m.next ? '≈ ' + moneyK(m.next.central) : '—'}</b><small>${m.next ? `${moneyK(m.next.lo)}–${moneyK(m.next.hi)} · day ${m.next.day} of ${m.next.workdays}` : ''}</small>
        <i class="h2-track"><i style="--w:${Math.min(100, (m.next ? m.next.central : billShown.v) / 1e6 * 100).toFixed(1)}%"></i></i></div>
      <a class="h2-kpi" href="#customers"><span>${mon(billShown.month)} billed</span><b>${moneyK(billShown.v)}</b><small>${billShown.d != null ? `${chip(billShown.d)} on ${mon(billShown.vs)}` : 'posted, core'}</small></a>
      <div class="h2-kpi"><span>Gap to $1.0M</span><b>${moneyK(m.gap)}</b><small>a month</small></div>
    </section>`;

  const sumCard = `<section class="h2-card h2-sum" data-rv>
      <div class="h2-sum-top"><span class="h2-date">${esc(dayLabel)}</span>${age > 2 ? `<span class="h2-stale">${age} days old</span>` : ''}<button class="h2-ask-inline" type="button">Ask ›</button></div>
      <h1 class="h2-head" id="h2-head"></h1>
      <ul class="h2-bul" id="h2-bul"></ul>
      <p class="h2-by" id="h2-by">From the figures below</p>
    </section>`;

  const pulse = `<div class="h2-row">
      <section class="h2-card h2-wide" data-rv><div class="h2-ch"><h2>${m.vsLast != null ? `${esc(mon(m.workMonth))}'s work is ${word(m.vsLast)} ${esc(mon(m.prevMonth))}'s` : 'This month\'s work'}</h2><small>by working day, priced ◇</small></div><div id="h2-trend"></div></section>
      <section class="h2-card" data-rv><div class="h2-ch"><h2>${w.lastFull ? `Last week ${moneyK(w.lastFull.value)} ◇, ${w.vsAvg >= 0 ? 'up' : 'down'} ${pctW(w.vsAvg)}` : 'Weeks'}</h2><small>work done each week against the weeks before</small></div><div id="h2-weeks"></div></section>
    </div>`;

  const segCard = seg ? `<section class="h2-card" data-rv><div class="h2-ch"><h2>${esc(mon(seg.month))} by line of business</h2><small>${moneyK(seg.total)} · against the month, three months and year before</small></div>
      <div class="h2-segs">${seg.rows.map(s => `<div class="h2-seg"><span class="h2-seg-n">${esc(s.name)}</span><b>${moneyK(s.lm)}</b>${chip(s.lmPct)}
        ${sparkline(s.spark, { w: 120, h: 28, cls: s.key === 'storage' ? 'storage' : 'service' })}
        <small>3M ${chip(s.l3mPct, true)} · YTD ${chip(s.ytdPct, true)}</small></div>`).join('')}</div>
      <div class="src">Service by month of work, storage by month billed · VCK priced lines · Citadel apart</div></section>` :
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

  main.innerHTML = `<div class="h2">${sumCard}${kpis}${pulse}${segCard}${custCard}
    <h2 class="h2-sec" data-rv>Where the money is</h2>
    <div class="h2-row">${mapCard}${crossCard}</div>
    ${destCard}
    <div class="h2-foot">Posted through ${mon(P.monthly[P.monthly.length - 1].month)} · work done through ${dm(A.latestDone)} · ◇ modelled: work priced at last month's value a service, costs from model/rates.js · Citadel held apart</div>
  </div>`;

  // the summary: the template now, Claude's when it arrives and passes the checks
  const draw = (text, by) => {
    const p = parseHome2(text, sheet);
    if (!p) return false;
    main.querySelector('#h2-head').textContent = p.headline;
    main.querySelector('#h2-bul').innerHTML = p.bullets.map(b => `<li class="${esc(b.key)}"><a href="${esc(hrefOf[b.key] || '#pulse')}"><span>${esc(b.text)}</span><i>›</i></a></li>`).join('');
    main.querySelector('#h2-by').textContent = by;
    return true;
  };
  const tmpl = [sheet.find(f => f.lead) || sheet[0], ...sheet.filter(f => f.bullet)];
  draw([tmpl[0].say || tmpl[0].line, ...tmpl.slice(1, 4).map(f => `[${f.key}] ${f.say || f.line}`)].join('\n'), 'From the figures below');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'home2', sheet: sheet.map(({ key, line, say, lead, bullet }) => ({ key, line, say, lead, bullet })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, sheet).ok && main.isConnected) draw(j.text, 'Written by Claude from these figures; every number checked'); })
    .catch(() => {});

  // customers: three columns on a desk, tabs on a phone
  const tabs = main.querySelectorAll('.h2-tabs button'), cols = main.querySelectorAll('.h2-col');
  const pick = k => { tabs.forEach(b => b.classList.toggle('on', b.dataset.k === k)); cols.forEach(c => c.classList.toggle('on', c.dataset.k === k)); };
  tabs.forEach(b => b.addEventListener('click', () => pick(b.dataset.k)));
  pick('top');

  trend(main.querySelector('#h2-trend'), m);
  weekBars(main.querySelector('#h2-weeks'), w);
  if (dens) densityMap(main.querySelector('#h2-map'), dens, base);
  if (dest) destChart(main.querySelector('#h2-dest'), dest);

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
