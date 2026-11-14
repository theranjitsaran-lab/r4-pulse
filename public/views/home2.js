// Home (#pulse) — two phone screens, ten seconds. The briefing and its four headed points; the month in three
// figures, tied to VCK; lines of business as one list, each row one comparison and a tap for the rest; yesterday;
// three things to act on, each with its owner; the weeks. Everything analytical lives on its own tab.
// Every figure from components/home2data.js, which the Ask sheet (server/ask.js) reads too.
import { phoneFold } from '/components/phonekit.js';
import * as Fmt from '/components/format.js';
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, titleCase, esc } from '/components/data.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { parseHome2, checkNumbers } from '/components/summary.js';
import { openPop } from '/components/pop.js';
import { openExplain } from '/components/explain-drawer.js';

import { LABELS, changeWord, isLumpy } from '/components/metrics.js';
import { closedMonth } from '/components/linework.js';
import { drawHomeMap } from '/components/homemap.js';

// one line under the figures: the invoiced month adds up to VCK's invoices, or it has moved and says by how much
const tieLine = t => !t ? '' : t.ok ? `<p class="h2-tie">✓ ${Fmt.grouped(t.invoices)} VCK invoices add up to the invoiced figure</p>` : `<p class="h2-tie late">VCK now holds ${moneyK(t.core)}: ${moneyK(Math.abs(t.moved))} ${t.moved > 0 ? 'posted' : 'removed'} since this was built</p>`;
// a card's method, behind one mark
const info = text => `<details class="h2-i"><summary aria-label="How this is worked out">ⓘ</summary><p>${esc(text)}</p></details>`;

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monS = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pctW = v => v == null ? '' : `${Fmt.pct(v, { abs: true })}`;
const tone = v => v == null ? 'flat' : v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'flat';
const chip = (v, quiet) => v == null ? '<span class="h2-d flat">—</span>' : `<span class="h2-d ${quiet ? 'quiet' : v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'flat'}">${changeWord(v)}</span>`;
const signedK = v => (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
// a lumpy line's move reads in dollars, not a percentage
const move = (key, v, pct) => pct == null || pct <= -1 || !isLumpy(key, v / (1 + pct)) ? chip(pct) : `<span class="h2-d quiet">${signedK(v - v / (1 + pct))}</span>`;
const ICON = { useful: '<path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a1 1 0 0 1 1 1.2l-1.6 8a1 1 0 0 1-1 .8H7"/>', knew: '<path d="M4 12.5l5 5L20 6.5"/>', wrong: '<path d="M5 21V4h13l-3 4.5 3 4.5H5"/>' };
const fbIcon = (v, label) => `<button type="button" data-v="${v}" title="${label}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[v]}</svg></button>`;
const word = v => Math.abs(v) < 0.02 ? 'level with' : v > 0 ? `${pctW(v)} ahead of` : `${pctW(v)} behind`;

export async function render(main, P) {
  if (!main) return;
  // the figures, worked out on the server by the same functions (server/views.js)
  const V = await getJson('view/home');
  const { month: m, weeks: w } = V;

  const billShown = m.bill.core != null ? { month: m.bill.month, v: m.bill.core, d: m.bill.vsLast, vs: m.bill.lastMonth } : { month: m.bill.lastMonth, v: m.bill.lastCore, d: null };
  // a note on why the headline moved, for its first week
  const changedNote = Date.now() < Date.UTC(2026, 10, 22) ? 'Changed 14 Nov: the main figure is now the month so far, against last month at the same point. The forecast is the fainter figure.' : '';
  // the month so far: storage on its bill plus the work done so far, priced est. (linework.js monthToDate)
  const S = V.soFar;
  const soFarCh = S && S.change != null ? (Math.abs(S.change) < 0.005 ? 'level with' : `${S.change > 0 ? 'up' : 'down'} ${pctW(S.change)} on`) : null;
  const jobWord = n => `${n} job${n === 1 ? '' : 's'} to check`;
  const jobsNote = m.next && m.next.jobCount ? `, before ${jobWord(m.next.jobCount)}` : '';
  const sheet = [
    S ? { key: 'month', lead: true, href: '#pulse', line: `${mon(S.month)} so far: ${moneyK(S.total)} est.${soFarCh ? `, ${soFarCh} ${mon(S.prevMonth)} at the same point` : ''}`, say: `${mon(S.month)} so far: ${moneyK(S.total)} est.${soFarCh ? `, ${soFarCh} ${mon(S.prevMonth)} at the same point` : ''}.` }
      : m.next && { key: 'month', lead: true, href: '#pulse', line: `${mon(m.workMonth)}'s work bills about ${moneyK(m.next.central)} est. in ${mon(m.next.month)}${jobsNote}`, say: `${mon(m.workMonth)}'s work bills about ${moneyK(m.next.central)} est. in ${mon(m.next.month)}${jobsNote}.` },
    ...(V.points || []).map(p => ({ key: p.key, bullet: true, href: p.href, title: p.title, line: p.line, say: p.say })),
  ].filter(Boolean);
  const hrefOf = Object.fromEntries(sheet.map(f => [f.key, f.href])), titleOf = Object.fromEntries(sheet.map(f => [f.key, f.title]));
  const alertOf = Object.fromEntries((V.points || []).map(p => [p.key, !!p.alert]));


  const kpis = `<section class="h2-kpis bills" data-tour="t-kpis">
      ${S ? `<button type="button" class="h2-kpi lead h2-sofar" id="h2-sofar" data-in style="--d:150ms" aria-label="${esc(`${mon(S.month)} so far, ${moneyK(S.total)} est.: open by customer and by service line`)}"><span>${mon(S.month)} so far, to ${dm(S.latest)} (day ${S.day} of ${S.workdays})</span><b data-count data-delay="400">${moneyK(S.total)}</b>
        <small>${S.change != null ? `${chip(S.change)} on ${monS(S.prevMonth)} at day ${S.day}` : 'est.'}</small>
        ${m.next ? `<small class="h2-fc">Heading for about ${moneyK(m.next.central)} est. in ${mon(m.next.month)}${m.next.jobCount ? `, + up to ${moneyK(m.next.jobs)} to check` : ''}</small>` : ''}<i class="h2-chev" aria-hidden="true"></i></button>`
      : `<div class="h2-kpi lead" data-in style="--d:150ms"><span>${m.next ? `${mon(m.workMonth)}'s work → ${mon(m.next.month)} bill (est.)` : 'Next bill'}</span><b data-count data-delay="400">${m.next ? '≈ ' + moneyK(m.next.central) : '—'}</b>
        <small>${m.next ? (m.next.jobCount ? `+ up to ${moneyK(m.next.jobs)}: ${jobWord(m.next.jobCount)}` : Math.round(m.next.lo / 1000) !== Math.round(m.next.hi / 1000) ? `${moneyK(m.next.lo)}–${moneyK(m.next.hi)}` : '') : ''}</small></div>`}
      <a class="h2-kpi" data-in style="--d:230ms" href="#customers?view=grid"><span>${esc(LABELS.invoiced)}, ${mon(billShown.month)}</span><b data-count data-delay="480">${moneyK(billShown.v)}</b><small>${billShown.d != null ? `${chip(billShown.d)} on ${monS(billShown.vs)}` : 'posted, core'}</small></a>
      <a class="h2-kpi" data-in style="--d:310ms" href="#opportunities"><span>Gap to $1.0M</span><b data-count data-delay="560">${moneyK(m.gap)}</b><small>a month${S ? ', on the forecast' : ''}${m.next && m.next.jobCount ? ', before jobs to check' : ''}</small></a>
    </section>${tieLine(V.tie)}`;

  const sumCard = `<section class="h2-card h2-sum" data-tour="hero" data-in>
      <h1 class="h2-head" id="h2-head"></h1>${tracking(m, S)}${changedNote ? `<p class="h2-by">${esc(changedNote)}</p>` : ''}
      <ul class="h2-bul" id="h2-bul"></ul>
    </section>`;

  const LV = V.lines;
  let lineMonth = LV ? closedMonth(LV) : null;
  const segCard = LV ? `<section class="h2-card" id="h2-lines" data-tour="t-lines" data-in data-grow>
      <div class="h2-ch h2-chi"><div><h2 id="h2-lines-t"></h2><small id="h2-lines-s"></small></div>${info("Storage by the month it bills, service by the month of the work, Citadel apart. Estimated months are hatched: work orders at each account's own prices, charges added at the run carried from the last priced month. A job to check is left out until someone has looked at it.")}</div>
      <div class="seg h2-months" id="h2-months">${LV.pick.slice(-4).map(x => `<button data-m="${x}">${esc(monS(x))}${LV.meta[x].est ? ' est.' : ''}</button>`).join('')}</div>
      <ul class="h2-rows" id="h2-tiles"></ul>
      <svg class="h2-defs" aria-hidden="true" width="0" height="0"><defs><pattern id="h2-est" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs></svg>
    </section>` : '';

  // yesterday, in a line, opening Routes
  const Y = V.yesterday;
  const yesterday = Y ? `<a class="h2-card h2-yest" data-tour="t-yest" href="#activity" data-in><span class="h2-eyebrow">${esc(Y.label)}</span><span>${esc(Y.text)}</span><i class="h2-chev" aria-hidden="true"></i></a>` : '';

  // three things to act on, each with its owner
  const OWNER = { trisha: 'Trisha', anne: 'Anne', mike: 'Mike' };
  const fbBtns = i => `<span class="fb" data-key="${esc(i.key)}" data-subject="${esc(i.subject)}">${fbIcon('useful', 'Useful')}${fbIcon('knew', 'I knew this')}${fbIcon('wrong', 'Not right')}</span>`;
  const acts = V.actions && V.actions.length ? `<section class="h2-card h2-acts" data-tour="t-acts" data-in><div class="h2-ch"><h2>Three things to act on</h2></div><ul>${V.actions.map(i => `<li><a href="${esc(i.href)}"><b>${esc(OWNER[i.owner] || i.owner)}</b><span>${esc(i.text)}</span></a>${fbBtns(i)}${i.move ? (i.move.owner ? `<span class="h2-listed"><span class="h2-lg">With ${esc(OWNER[i.move.owner] || i.move.owner)} on Opportunities</span><span class="h2-sm">Listed</span></span>` : `<button type="button" class="linkbtn h2-send" data-key="${esc(i.move.key)}" aria-label="Send to Opportunities, with ${esc(OWNER[i.owner] || i.owner)}"><span class="h2-lg">Send to Opportunities, with ${esc(OWNER[i.owner] || i.owner)}</span><span class="h2-sm">To the list</span></button>`) : ''}</li>`).join('')}</ul></section>` : '';

  const weeks = `<section class="h2-card" data-tour="t-weeks" data-in data-grow><div class="h2-ch h2-chi"><div><h2>${w.lastFull ? `Last week ${moneyK(w.lastFull.value)} est., ${w.vsAvg >= 0 ? 'up' : 'down'} ${pctW(w.vsAvg)}` : 'Weeks'}</h2></div>${info(`${LABELS.veriShred} Work done each week, priced at that month's value a service, against the weeks before.`)}</div><div id="h2-weeks"></div></section>`;

  const mapCard = `<section class="h2-card h2-mapc" id="h2-map" data-tour="t-map" data-in><h2 id="hm-title">Where the work is</h2><p class="hm-sum" id="hm-sum" aria-live="polite"></p>
      <div class="hm-days" id="hm-days" role="group" aria-label="Day"></div><div class="hm-routes" id="hm-chips" role="group" aria-label="Route"></div>
      <div class="hm-grid"><div class="hm-stage"><div id="hm-svg"><p class="sub">Loading the map…</p></div><div class="hm-tip" id="hm-tip" role="status"></div><div class="hm-key" id="hm-key"></div></div>
      <div class="hm-side"><p class="hm-say" id="hm-say"></p>${phoneFold('the busiest postcodes', '<ol class="hm-top" id="hm-top"></ol>')}</div></div>
      <p class="src">Shading: Veri-Shred done services by postcode district, last twelve months, on the Census's postcode areas. Dashed lines: last week's routes from the yard and back, one per driver, in the likely stop order, joined along the main roads. Not GPS, which was never captured.</p></section>`;

  main.innerHTML = `<div class="h2">${sumCard}${kpis}<div class="h2-split">${segCard ? phoneFold('the lines of business', segCard) : ''}<div class="h2-stack">${yesterday}${phoneFold('the last weeks', weeks)}${acts}</div></div>${mapCard}
    <div class="h2-foot">${esc(LABELS.estWord)} · Citadel held apart</div>
  </div>`;

  // the summary: the template now, Claude's when it arrives and passes the checks
  const draw = (text, by) => {
    const p = parseHome2(text, sheet);
    if (!p) return false;
    main.querySelector('#h2-head').textContent = p.headline;
    main.querySelector('#h2-bul').innerHTML = p.bullets.map((b, i) => `<li style="--n:${i}" class="${esc(b.key)}${alertOf[b.key] ? ' alert' : ''}"><a href="${esc(hrefOf[b.key] || '#pulse')}"><i class="h2-light"${alertOf[b.key] ? ' role="img" aria-label="Needs attention" title="Needs attention"' : ' aria-hidden="true"'}></i><span><b>${esc(titleOf[b.key] || '')}</b>${esc(b.text)}</span><i class="h2-chev" aria-hidden="true"></i></a></li>`).join('');
    return true;
  };
  const tmpl = [sheet.find(f => f.lead) || sheet[0], ...sheet.filter(f => f.bullet)];
  draw([tmpl[0].say || tmpl[0].line, ...tmpl.slice(1, 5).map(f => `[${f.key}] ${f.say || f.line}`)].join('\n'), '');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'home2', sheet: sheet.map(({ key, line, say, lead, bullet }) => ({ key, line, say, lead, bullet })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, sheet).ok && main.isConnected) draw(j.text, ''); })
    .catch(() => {});

  // Activity scrolls to the lines rather than leaving the page; a customer call-out opens the one drawer (why, what to do)
  main.querySelector('#h2-bul').addEventListener('click', ev => {
    const c = ev.target.closest('a[href^="#customer/"]');
    if (c) { ev.preventDefault(); const p = (V.points || []).find(x => x.href === c.getAttribute('href')); openExplain({ level1: +c.getAttribute('href').split('/')[1], name: p && p.name ? p.name : '' }); return; }
    const a = ev.target.closest('a[href="#h2-lines"]'); if (!a) return;
    ev.preventDefault(); const t = main.querySelector('#h2-lines'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // the month so far, opened: by customer and by service line, each adding to the figure
  const sf = main.querySelector('#h2-sofar');
  if (sf) sf.addEventListener('click', () => openSoFar(S, LV));

  // the lines: a month picked, its figures and comparisons; a tap opens the customers behind a line
  const drawLines = () => {
    if (!LV) return;
    const x = lineMonth, meta = LV.meta[x], work = mon(x), bill = mon(new Date(Date.UTC(+x.slice(0, 4), +x.slice(5, 7), 1)).toISOString().slice(0, 10));
    main.querySelector('#h2-lines-t').textContent = `${work} by line of business${meta.est ? ' est.' : ''}`;
    main.querySelector('#h2-lines-s').textContent = meta.est ? `on ${bill}'s bill` : `${work}'s storage and work`;
    main.querySelectorAll('#h2-months button').forEach(b => b.classList.toggle('on', b.dataset.m === x));
    main.querySelector('#h2-tiles').innerHTML = LV.rows.map(r => { const k = r.by[x], jobs = r.jobs[x] || 0;
      return `<li><button class="h2-lr" data-k="${r.key}" type="button"><span class="h2-lr-n">${esc(r.name)}${jobs ? `<small>+${moneyK(jobs)} to check</small>` : ''}</span><b data-count>${moneyK(k.v)}</b>${move(r.key, k.v, k.pct)}${monthBars(r.bars, x, { w: 72, h: 24 })}</button></li>`; }).join('')
      + `<li class="h2-lr-tot"><span>Total${meta.est ? ' (est.)' : ''}</span><b data-count data-delay="300">${moneyK(LV.totals[x])}</b></li>`;
  };
  if (LV) {
    drawLines();
    main.querySelector('#h2-months').addEventListener('click', ev => { const b = ev.target.closest('button[data-m]'); if (b) { lineMonth = b.dataset.m; drawLines(); } });
    main.querySelector('#h2-tiles').addEventListener('click', ev => { const b = ev.target.closest('.h2-lr[data-k]'); if (b) openLine(b.dataset.k, lineMonth, LV); });
  }

  weekBars(main.querySelector('#h2-weeks'), w);

  // feedback on a line
  const actsEl = main.querySelector('.h2-acts');
  if (actsEl) actsEl.addEventListener('click', async ev => {
    const send = ev.target.closest('.h2-send');
    if (send) {
      const i = V.actions.find(x => x.move && x.move.key === send.dataset.key); if (!i) return;
      send.disabled = true;
      const res = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: i.move.key, level1: i.move.level1, status: i.move.status || 'open', owner: i.owner, value: i.move.value, note: i.move.note || null, next_step: i.move.next || null }) }).catch(() => null);
      if (!res || !res.ok) { send.disabled = false; send.textContent = 'That did not save. Try again'; return; }
      const done = document.createElement('span'); done.className = 'h2-listed'; done.innerHTML = `<span class="h2-lg">With ${esc(OWNER[i.owner] || i.owner)} on Opportunities</span><span class="h2-sm">Listed</span>`; send.replaceWith(done);
      return;
    }
    const b = ev.target.closest('.fb button'); if (!b) return;
    b.classList.add('pop');
    const box = b.closest('.fb'), li = b.closest('li');
    // "Not right" asks one question first
    if (b.dataset.v === 'wrong' && !b.classList.contains('fb-send')) {
      box.innerHTML = '<label>What\'s wrong? <input type="text" maxlength="300"></label><button type="button" class="fb-send" data-v="wrong">Send</button>';
      const inp = box.querySelector('input'); inp.focus();
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('.fb-send').click(); });
      return;
    }
    const note = box.querySelector('input') ? box.querySelector('input').value.trim() : '';
    box.querySelectorAll('button').forEach(x => x.disabled = true);
    try {
      const r = await fetch('/api/feedback', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: box.dataset.key, subject: box.dataset.subject, verdict: b.dataset.v, note: note || undefined, brief_date: V.latestDone }) });
      if (!r.ok) throw new Error('not saved');
      await new Promise(ok => setTimeout(ok, 320));   // let the press finish
      box.innerHTML = `<em>${b.dataset.v === 'useful' ? 'Noted: useful' : b.dataset.v === 'knew' ? 'Held back for 30 days' : 'Sent, thank you'}</em>`;
      if (b.dataset.v !== 'useful') li.classList.add('held');
    } catch (e) { box.querySelectorAll('button').forEach(x => x.disabled = false); }
  });

  document.documentElement.classList.add('js');   // what starts hidden is only ever hidden when scripts run
  const play = firstPlay('r4-home-played');
  const root = main.querySelector('.h2');
  drawHomeMap(main.querySelector('#h2-map'), { play });
  if (play) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }
}

// how far the month gets toward $1.0M: so far, solid; where it is heading, faint and hatched; jobs to check after.
// Without a month in progress, the forecast as before. The same figures as the tiles.
function tracking(m, S) {
  if (!m.next) return '';
  const T = 1e6, w = v => Math.max(0, Math.min(100, v / T * 100)).toFixed(2) + '%', jobs = m.next.jobs || 0;
  if (S) {
    const rest = Math.max(0, m.next.central - S.total);
    return `<div class="h2-tobar" role="img" aria-label="${esc(`${moneyK(S.total)} so far, heading for about ${moneyK(m.next.central)}, of $1.0M a month`)}"><i class="pr" style="width:${w(S.total)}"></i>${rest ? `<i class="fc" style="width:${w(rest)}"></i>` : ''}${jobs ? `<i class="ck" style="width:${w(jobs)}"></i>` : ''}</div>
    <div class="h2-tokey"><span><i class="pr"></i><span data-count data-delay="250" data-dur="1100">${esc(moneyK(S.total))} so far est.</span></span>${rest ? `<span class="h2-fck"><i class="fc"></i>heading for ${esc(moneyK(m.next.central))} est.</span>` : ''}${jobs ? `<span><i class="ck"></i><span data-count data-delay="1250" data-dur="600">${esc(moneyK(jobs))} to check</span></span>` : ''}<span class="end">$1.0M a month</span></div>`;
  }
  return `<div class="h2-tobar" role="img" aria-label="${esc(moneyK(m.next.central))} priced, ${esc(moneyK(jobs))} to check, of $1.0M a month"><i class="pr" style="width:${w(m.next.central)}"></i>${jobs ? `<i class="ck" style="width:${w(jobs)}"></i>` : ''}</div>
    <div class="h2-tokey"><span><i class="pr"></i><span data-count data-delay="250" data-dur="1100">${esc(moneyK(m.next.central))} est. priced</span></span>${jobs ? `<span><i class="ck"></i><span data-count data-delay="1250" data-dur="600">${esc(moneyK(jobs))} to check</span></span>` : ''}<span class="end">$1.0M a month</span></div>`;
}

// ── the last thirteen weeks of work, priced est.; the week in progress hatched, the usual week a line ──
function weekBars(el, w) {
  if (!el || !w.rows.length) return;
  const W = Math.max(280, Math.min(1300, el.clientWidth || 360)), H = W < 500 ? 88 : 170, T = 14, B = 20;
  const max = Math.max(...w.rows.map(r => r.value)) * 1.1, slot = W / w.rows.length, bw = Math.min(18, slot * .62);
  const fy = v => T + (1 - v / max) * (H - T - B);
  let g = `<defs><pattern id="h2-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs>`;
  w.rows.forEach((r, i) => {
    const x = slot * (i + .5) - bw / 2, y = fy(r.value), h = H - B - y, rr = Math.min(4, h);
    g += `<path style="--i:${i}" class="h2-bar${r.partial ? ' partial' : ''}${i === w.rows.length - (r.partial ? 2 : 1) ? ' last' : ''}" d="M${x},${H - B} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H - B} Z"><title>Week of ${dm(r.week)}: ${money0(r.value)} est., ${r.done} services${r.partial ? ' (so far)' : ''}</title></path>`;
    if (i % 4 === 0 || i === w.rows.length - 1) g += `<text class="c-axis" x="${slot * (i + .5)}" y="${H - 6}" text-anchor="middle">${dm(r.week)}</text>`;
  });
  if (w.avg) g += `<line class="h2-avg" x1="0" x2="${W}" y1="${fy(w.avg)}" y2="${fy(w.avg)}"/><text class="c-axis h2-avgt" x="0" y="${fy(w.avg) - 5}">usual ${moneyK(w.avg)}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="Work done each week, priced">${g}</svg>`;
}

// ── thirteen monthly bars: the picked month dark, an estimated month hatched ──
function monthBars(bars, on, { w = 150, h = 40, labels = false } = {}) {
  const T = 2, B = labels ? 16 : 1, max = Math.max(...bars.map(b => b.v), 1), slot = w / bars.length, bw = Math.max(2, slot * .68);
  const g = bars.map((b, i) => {
    const bh = Math.max(b.v > 0 ? 1.5 : 0, Math.max(0, b.v) / max * (h - T - B)), x = slot * i + (slot - bw) / 2;
    const lab = labels && (i % 3 === 0 || i === bars.length - 1) ? `<text class="c-axis" x="${(x + bw / 2).toFixed(1)}" y="${h - 3}" text-anchor="middle">${esc(monS(b.m))}</text>` : '';
    return `<rect style="--i:${i}" class="h2-mb${b.m === on ? ' on' : ''}${b.est ? ' est' : ''}" data-m="${b.m}" x="${x.toFixed(1)}" y="${(h - B - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"><title>${esc(monS(b.m))}: ${moneyK(b.v)}${b.est ? ' est.' : ''}</title></rect>${lab}`;
  }).join('');
  return `<svg class="h2-mbs" viewBox="0 0 ${w} ${h}" aria-hidden="true">${g}</svg>`;
}

// ── a line's pop-out: the note, the months, this month, the customers behind it, what rose and fell ──
const nmL = s => esc(titleCase(s));
// why a job is left out, in a line: its size against what the account has bought, or no price of its own
const whyHeld = j => {
  const u = Fmt.num(j.units), at = Fmt.money(j.rate, { dp: 2 });
  if (j.reason === 'check') return `${u} hours at its own ${at}, against ${Fmt.num(j.maxUnits)} at most before (last ${dm(j.lastDate)} ${j.lastDate.slice(0, 4)}). May be a keying error.`;
  return `${u} ${j.family === 'labour' ? 'hours' : 'units'}, never bought before. Priced at the book's ${at}, usually what a first-time buyer pays.`;
};
// ── the month so far, opened: every customer and every service line, each list adding to the figure ──
// Customers: storage on the month's bill and work so far at their own prices; a row opens the customer. Lines: a tap
// opens the customers behind the line (openLine). Against the month before at the same share of its working days.
async function openSoFar(S, LV) {
  const title = `${mon(S.month)} so far, to ${dm(S.latest)}`, sub = `${moneyK(S.total)} est.`;
  openPop({ title, sub, wide: true, html: '<p class="hint">Reading the customers behind it…</p>' });
  let T;
  try { T = await getJson('view/so-far'); }
  catch (e) { openPop({ title, sub, html: `<p>${esc(e.message)}</p>` }); return; }
  const at = `${monS(T.prevMonth)} at day ${T.day}`;
  const cv = (v, then) => then == null || !(then > 0) ? '<span class="h2-d flat">new</span>' : chip(v / then - 1);
  const custRow = r => `<li>${r.level1 != null ? `<a href="#customer/${r.level1}">` : '<div class="h2-pl-r">'}<span>${nmL(r.customer)}<em>${r.storage ? `Storage ${moneyK(r.storage)}` : 'No storage'} · work so far ${moneyK(r.work)} est.</em></span>${r.level1 != null ? cv(r.total, r.prevAt) : ''}<b>${moneyK(r.total)}</b>${r.level1 != null ? '</a>' : '</div>'}</li>`;
  const TOP = 25, rows = T.byCustomer, top = rows.slice(0, TOP), rest = rows.slice(TOP);
  const restSum = f => rest.reduce((t, r) => t + f(r), 0);
  const custList = `<ul class="h2-pl sf-c">${top.map(custRow).join('')}${rest.length ? `<li class="rest sf-rest"><span>All others, ${Fmt.grouped(rest.length)} accounts</span><b>${moneyK(restSum(r => r.total))}</b></li>` : ''}<li class="rest sf-tot"><span>Total</span><b>${moneyK(T.total)}</b></li></ul>
    ${rest.length ? `<button type="button" class="linkbtn sf-all">Show all ${Fmt.grouped(rows.length)} accounts</button>` : ''}`;
  const lineList = `<ul class="h2-pl sf-l">${T.byLine.map(l => `<li><button type="button" class="sf-line" data-k="${esc(l.key)}"><span>${esc(l.name)}<em>${l.key === 'storage' ? 'on the month\'s bill' : 'work so far, priced est.'}</em></span>${cv(l.v, l.prevAt)}<b>${moneyK(l.v)}</b></button></li>`).join('')}<li class="rest sf-tot"><span>Total</span><b>${moneyK(T.total)}</b></li></ul>`;
  const jobs = T.jobs.length ? `<h3>To check, not in the figure</h3><ul class="h2-pl job">${T.jobs.map(j => `<li><a href="#customer/${j.level1}"><span>${nmL(j.customer)}<em>${esc(whyHeld(j))}</em></span><b>about ${moneyK(j.value)}</b></a></li>`).join('')}</ul>` : '';
  const html = `<ul class="h2-stats"><li><span>Storage, on the bill</span><b>${moneyK(T.storage)}</b></li><li><span>Work so far, est.</span><b>${moneyK(T.work)}</b></li><li><span>On ${esc(at)}</span><b>${T.change != null ? chip(T.change) : '—'}</b></li></ul>
    <div class="seg sf-tabs" role="tablist"><button type="button" role="tab" class="on" aria-selected="true" data-t="c">By customer</button><button type="button" role="tab" aria-selected="false" data-t="l">By service line</button></div>
    <div class="sf-p" data-p="c">${custList}</div><div class="sf-p" data-p="l" hidden>${lineList}</div>${jobs}
    <p class="src">Storage: each account's charge on ${esc(mon(T.month))}'s bill${T.storageCarried ? ', carried from the latest bill until it posts' : ''}. Work: Veri-Shred and VCK work orders done ${esc(dm(T.month))} to ${esc(dm(T.latest))}, priced at each account's own rates, est.; charges added at the run carried from the last priced month for ${Math.round(T.frac * 100)}% of the month. Against ${esc(mon(T.prevMonth))}: its storage, and its work scaled to the same share of its working days. Citadel's work held apart.</p>`;
  openPop({ title, sub, wide: true, html, ask: `What is driving ${mon(T.month)} so far against ${mon(T.prevMonth)}?` });
  const b = document.querySelector('.pop-b');
  if (!b) return;
  b.onclick = ev => {
    const t = ev.target.closest('.sf-tabs button');
    if (t) { b.querySelectorAll('.sf-tabs button').forEach(x => { const on = x === t; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); b.querySelectorAll('.sf-p').forEach(p => { p.hidden = p.dataset.p !== t.dataset.t; }); return; }
    const all = ev.target.closest('.sf-all');
    if (all) { b.querySelector('.sf-c').innerHTML = rows.map(custRow).join('') + `<li class="rest sf-tot"><span>Total</span><b>${moneyK(T.total)}</b></li>`; all.remove(); return; }
    const l = ev.target.closest('.sf-line');
    if (l && LV && LV.rows.some(r => r.key === l.dataset.k) && LV.rows.find(r => r.key === l.dataset.k).by[T.month]) openLine(l.dataset.k, T.month, LV);
  };
}

async function openLine(key, month, LV) {
  const r = LV.rows.find(x => x.key === key), k = r.by[month], meta = LV.meta[month];
  const title = `${r.name} · ${mon(month)}${k.est ? ' est.' : ''}`;
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
    { key: 'total', line: `${r.name} in ${mon(month)}: ${moneyK(d.total)}${d.est ? ' est.' : ''}${d.prev != null ? `, against ${moneyK(d.prev)} in ${prevName}` : ''}${k.pct != null ? (Math.abs(k.pct) < 0.005 ? ', level' : `, ${k.pct >= 0 ? 'up' : 'down'} ${pctW(k.pct)}`) + (d.partial ? ' at the same point in the month' : '') : ''}.` },
    k.p3 != null && { key: 'p3', line: `The last three months are ${k.p3 >= 0 ? 'up' : 'down'} ${pctW(k.p3)} on the three before${k.ytd != null ? `, and the year to date is ${k.ytd >= 0 ? 'up' : 'down'} ${pctW(k.ytd)}` : ''}.` },
    up && { key: 'up', line: `Largest rise: ${titleCase(up.customer)}, ${sgn(up.d)}.` },
    dn && { key: 'down', line: `Largest fall: ${titleCase(dn.customer)}, ${sgn(dn.d)}.` },
    jobsTxt && { key: 'jobs', line: jobsTxt },
  ].filter(Boolean);
  const tone2 = v => v == null ? '' : v > 0 ? 'up' : 'down';
  const html = `<p class="p2-lede" id="h2-note">${esc(facts.map(f => f.line).join(' '))}</p><p class="h2-by" id="h2-note-by"></p>
    <div class="p2-mbs">${monthBars(d.bars, month, { w: 340, h: 92, labels: true })}</div>
    <ul class="h2-stats"><li><span>This month</span><b>${moneyK(d.total)}${d.est ? ' est.' : ''}</b></li><li><span>On ${esc(monS(d.prevMonth || month))}</span><b>${chip(k.pct)}</b></li><li><span>3 months</span><b>${chip(k.p3)}</b></li><li><span>Year to date</span><b>${chip(k.ytd)}</b></li></ul>
    ${d.jobs.length ? `<h3>To check, not in the figure est.</h3><ul class="h2-pl job">${d.jobs.map(j => `<li><a href="#customer/${j.level1}"><span>${nmL(j.customer)}<em>${esc(whyHeld(j))}</em></span><b>about ${moneyK(j.value)}</b></a></li>`).join('')}</ul>` : ''}
    <h3>Top 5 customers</h3><ul class="h2-pl">${d.top.map(x => row(x, `<small>${x.share != null ? Fmt.pct(x.share) : ''}</small><b>${moneyK(x.v)}</b>`)).join('')}<li class="rest"><span>All others</span><b>${moneyK(d.others)}</b></li></ul>
    ${d.up.length ? `<h3>Rising on ${esc(prevName)}</h3><ul class="h2-pl">${d.up.map(x => row(x, `<b class="h2-cv up">${sgn(x.d)}</b>`)).join('')}</ul>` : ''}
    ${d.down.length ? `<h3>Falling on ${esc(prevName)}</h3><ul class="h2-pl">${d.down.map(x => row(x, `<b class="h2-cv down">${sgn(x.d)}</b>`)).join('')}</ul>` : ''}
    ${d.est ? '<p class="src">Estimates: Work orders priced at each account\'s own rates; charges added at the run carried from the last priced month. Replaced by the invoices when the run posts.</p>' : ''}`;
  openPop({ title, sub: moneyK(d.total), html, ask: `What is driving ${r.name} in ${mon(month)}, and what should we do?` });
  const note = document.querySelector('#h2-note'), by = document.querySelector('#h2-note-by');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'line', sheet: facts }) })
    .then(x => x.ok ? x.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, facts).ok && note && note.isConnected) { note.textContent = j.text; by.textContent = ''; } })
    .catch(() => {});
}
