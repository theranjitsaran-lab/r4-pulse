// Home (#pulse) — two phone screens, ten seconds. The briefing and its four headed points; the month in three
// figures, tied to VCK; lines of business as one list, each row one comparison and a tap for the rest; yesterday;
// three things to act on, each with its owner; the weeks. Everything analytical lives on its own tab.
// Every figure from components/home2data.js, which the Ask sheet (server/ask.js) reads too.
import { money0, moneyK, sparkline } from '/components/chart.js';
import { getJson, titleCase, esc } from '/components/data.js';
import { reveal } from '/components/motion.js';
import { parseHome2, checkNumbers } from '/components/summary.js';
import { openPop } from '/components/pop.js';

import { LABELS, changeWord, isLumpy } from '/components/metrics.js';
import { closedMonth } from '/components/linework.js';

// one line under the figures: the invoiced month adds up to VCK's invoices, or it has moved and says by how much
const tieLine = t => !t ? '' : t.ok ? `<p class="h2-tie">✓ ${t.invoices.toLocaleString('en-US')} VCK invoices add up to the invoiced figure</p>` : `<p class="h2-tie late">VCK now holds ${moneyK(t.core)}: ${moneyK(Math.abs(t.moved))} ${t.moved > 0 ? 'posted' : 'removed'} since this was built</p>`;
// a card's method, behind one mark
const info = text => `<details class="h2-i"><summary aria-label="How this is worked out">ⓘ</summary><p>${esc(text)}</p></details>`;

const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
const monS = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const dm = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const pctW = v => v == null ? '' : `${Math.abs(Math.round(v * 100))}%`;
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
  const changedNote = Date.now() < Date.UTC(2026, 10, 9) ? 'Changed 1 Nov: large jobs now use each customer\'s own price.' : '';
  const jobWord = n => `${n} job${n === 1 ? '' : 's'} to check`;
  const jobsNote = m.next && m.next.jobCount ? `, before ${jobWord(m.next.jobCount)}` : '';
  const sheet = [
    m.next && { key: 'month', lead: true, href: '#pulse', line: `${mon(m.workMonth)}'s work bills about ${moneyK(m.next.central)} est. in ${mon(m.next.month)}${jobsNote}`, say: `${mon(m.workMonth)}'s work bills about ${moneyK(m.next.central)} est. in ${mon(m.next.month)}${jobsNote}.` },
    ...(V.points || []).map(p => ({ key: p.key, bullet: true, href: p.href, title: p.title, line: p.line, say: p.say })),
  ].filter(Boolean);
  const hrefOf = Object.fromEntries(sheet.map(f => [f.key, f.href])), titleOf = Object.fromEntries(sheet.map(f => [f.key, f.title]));


  const kpis = `<section class="h2-kpis bills" data-rv>
      <div class="h2-kpi lead"><span>${m.next ? `${mon(m.workMonth)}'s work → ${mon(m.next.month)} bill (est.)` : 'Next bill'}</span><b>${m.next ? '≈ ' + moneyK(m.next.central) : '—'}</b>
        <small>${m.next ? (m.next.jobCount ? `+ up to ${moneyK(m.next.jobs)}: ${jobWord(m.next.jobCount)}` : Math.round(m.next.lo / 1000) !== Math.round(m.next.hi / 1000) ? `${moneyK(m.next.lo)}–${moneyK(m.next.hi)}` : '') : ''}</small></div>
      <a class="h2-kpi" href="#numbers"><span>${esc(LABELS.invoiced)}, ${mon(billShown.month)}</span><b>${moneyK(billShown.v)}</b><small>${billShown.d != null ? `${chip(billShown.d)} on ${monS(billShown.vs)}` : 'posted, core'}</small></a>
      <a class="h2-kpi" href="#customers?view=opportunities"><span>Gap to $1.0M</span><b>${moneyK(m.gap)}</b><small>a month${m.next && m.next.jobCount ? ', before jobs to check' : ''}</small></a>
    </section>${tieLine(V.tie)}`;

  const sumCard = `<section class="h2-card h2-sum" data-rv>
      <h1 class="h2-head" id="h2-head"></h1>${changedNote ? `<p class="h2-by">${esc(changedNote)}</p>` : ''}
      <ul class="h2-bul" id="h2-bul"></ul>
    </section>`;

  const LV = V.lines;
  let lineMonth = LV ? closedMonth(LV) : null;
  const segCard = LV ? `<section class="h2-card" id="h2-lines" data-rv>
      <div class="h2-ch h2-chi"><div><h2 id="h2-lines-t"></h2><small id="h2-lines-s"></small></div>${info("Storage by the month it bills, service by the month of the work, Citadel apart. Estimated months are hatched: work orders at each account's own prices, charges added at the run carried from the last priced month. A job to check is left out until someone has looked at it.")}</div>
      <div class="seg h2-months" id="h2-months">${LV.pick.slice(-4).map(x => `<button data-m="${x}">${esc(monS(x))}${LV.meta[x].est ? ' est.' : ''}</button>`).join('')}</div>
      <ul class="h2-rows" id="h2-tiles"></ul>
      <svg class="h2-defs" aria-hidden="true" width="0" height="0"><defs><pattern id="h2-est" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs></svg>
    </section>` : '';

  // yesterday, in a line, opening Routes
  const Y = V.yesterday;
  const yesterday = Y ? `<a class="h2-card h2-yest" href="#activity" data-rv><span class="h2-eyebrow">${esc(Y.label)}</span><span>${esc(Y.text)}</span><i>›</i></a>` : '';

  // three things to act on, each with its owner
  const OWNER = { trisha: 'Trisha', anne: 'Anne', mike: 'Mike' };
  const fbBtns = i => `<span class="fb" data-key="${esc(i.key)}" data-subject="${esc(i.subject)}">${fbIcon('useful', 'Useful')}${fbIcon('knew', 'I knew this')}${fbIcon('wrong', 'Not right')}</span>`;
  const acts = V.actions && V.actions.length ? `<section class="h2-card h2-acts" data-rv><div class="h2-ch"><h2>Three things to act on</h2></div><ul>${V.actions.map(i => `<li><a href="${esc(i.href)}"><b>${esc(OWNER[i.owner] || i.owner)}</b><span>${esc(i.text)}</span></a>${fbBtns(i)}</li>`).join('')}</ul></section>` : '';

  const weeks = `<section class="h2-card" data-rv><div class="h2-ch h2-chi"><div><h2>${w.lastFull ? `Last week ${moneyK(w.lastFull.value)} est., ${w.vsAvg >= 0 ? 'up' : 'down'} ${pctW(w.vsAvg)}` : 'Weeks'}</h2></div>${info(`${LABELS.veriShred} Work done each week, priced at that month's value a service, against the weeks before.`)}</div><div id="h2-weeks"></div></section>`;

  main.innerHTML = `<div class="h2">${sumCard}${kpis}${segCard}${yesterday}${acts}${weeks}
    <div class="h2-foot">${esc(LABELS.estWord)} · Citadel held apart</div>
  </div>`;

  // the summary: the template now, Claude's when it arrives and passes the checks
  const draw = (text, by) => {
    const p = parseHome2(text, sheet);
    if (!p) return false;
    main.querySelector('#h2-head').textContent = p.headline;
    main.querySelector('#h2-bul').innerHTML = p.bullets.map(b => `<li class="${esc(b.key)}"><a href="${esc(hrefOf[b.key] || '#pulse')}"><span><b>${esc(titleOf[b.key] || '')}</b>${esc(b.text)}</span><i>›</i></a></li>`).join('');
    return true;
  };
  const tmpl = [sheet.find(f => f.lead) || sheet[0], ...sheet.filter(f => f.bullet)];
  draw([tmpl[0].say || tmpl[0].line, ...tmpl.slice(1, 5).map(f => `[${f.key}] ${f.say || f.line}`)].join('\n'), '');
  fetch('/api/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'home2', sheet: sheet.map(({ key, line, say, lead, bullet }) => ({ key, line, say, lead, bullet })) }) })
    .then(r => r.ok ? r.json() : null)
    .then(j => { if (j && j.source === 'claude' && checkNumbers(j.text, sheet).ok && main.isConnected) draw(j.text, ''); })
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
    main.querySelector('#h2-lines-t').textContent = `${work} by line of business${meta.est ? ' est.' : ''}`;
    main.querySelector('#h2-lines-s').textContent = meta.est ? `on ${bill}'s bill` : `${work}'s storage and work`;
    main.querySelectorAll('#h2-months button').forEach(b => b.classList.toggle('on', b.dataset.m === x));
    main.querySelector('#h2-tiles').innerHTML = LV.rows.map(r => { const k = r.by[x], jobs = r.jobs[x] || 0;
      return `<li><button class="h2-lr" data-k="${r.key}" type="button"><span class="h2-lr-n">${esc(r.name)}${jobs ? `<small>+${moneyK(jobs)} to check</small>` : ''}</span><b>${moneyK(k.v)}</b>${move(r.key, k.v, k.pct)}${monthBars(r.bars, x, { w: 72, h: 24 })}</button></li>`; }).join('')
      + `<li class="h2-lr-tot"><span>Total${meta.est ? ' (est.)' : ''}</span><b>${moneyK(LV.totals[x])}</b></li>`;
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
    const b = ev.target.closest('.fb button'); if (!b) return;
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
      box.innerHTML = `<em>${b.dataset.v === 'useful' ? 'Noted: useful' : b.dataset.v === 'knew' ? 'Held back for 30 days' : 'Sent, thank you'}</em>`;
      if (b.dataset.v !== 'useful') li.classList.add('held');
    } catch (e) { box.querySelectorAll('button').forEach(x => x.disabled = false); }
  });

  reveal(main.querySelector('.h2'));
}

// ── the last thirteen weeks of work, priced est.; the week in progress hatched, the usual week a line ──
function weekBars(el, w) {
  if (!el || !w.rows.length) return;
  const W = Math.max(280, Math.min(1300, el.clientWidth || 360)), H = W < 500 ? 110 : 170, T = 14, B = 20;
  const max = Math.max(...w.rows.map(r => r.value)) * 1.1, slot = W / w.rows.length, bw = Math.min(18, slot * .62);
  const fy = v => T + (1 - v / max) * (H - T - B);
  let g = `<defs><pattern id="h2-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="h2-hatch"/></pattern></defs>`;
  w.rows.forEach((r, i) => {
    const x = slot * (i + .5) - bw / 2, y = fy(r.value), h = H - B - y, rr = Math.min(4, h);
    g += `<path class="h2-bar${r.partial ? ' partial' : ''}${i === w.rows.length - (r.partial ? 2 : 1) ? ' last' : ''}" d="M${x},${H - B} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + bw - rr} Q${x + bw},${y} ${x + bw},${y + rr} V${H - B} Z"><title>Week of ${dm(r.week)}: ${money0(r.value)} est., ${r.done} services${r.partial ? ' (so far)' : ''}</title></path>`;
    if (i % 4 === 0 || i === w.rows.length - 1) g += `<text class="c-axis" x="${slot * (i + .5)}" y="${H - 6}" text-anchor="middle">${dm(r.week)}</text>`;
  });
  if (w.avg) g += `<line class="h2-avg" x1="0" x2="${W}" y1="${fy(w.avg)}" y2="${fy(w.avg)}"/><text class="c-axis" x="0" y="${fy(w.avg) - 5}">usual ${moneyK(w.avg)}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-svg" role="img" aria-label="Work done each week, priced">${g}</svg>`;
}

// ── thirteen monthly bars: the picked month dark, an estimated month hatched ──
function monthBars(bars, on, { w = 150, h = 40, labels = false } = {}) {
  const T = 2, B = labels ? 16 : 1, max = Math.max(...bars.map(b => b.v), 1), slot = w / bars.length, bw = Math.max(2, slot * .68);
  const g = bars.map((b, i) => {
    const bh = Math.max(b.v > 0 ? 1.5 : 0, Math.max(0, b.v) / max * (h - T - B)), x = slot * i + (slot - bw) / 2;
    const lab = labels && (i % 3 === 0 || i === bars.length - 1) ? `<text class="c-axis" x="${(x + bw / 2).toFixed(1)}" y="${h - 3}" text-anchor="middle">${esc(monS(b.m))}</text>` : '';
    return `<rect class="h2-mb${b.m === on ? ' on' : ''}${b.est ? ' est' : ''}" data-m="${b.m}" x="${x.toFixed(1)}" y="${(h - B - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"><title>${esc(monS(b.m))}: ${moneyK(b.v)}${b.est ? ' est.' : ''}</title></rect>${lab}`;
  }).join('');
  return `<svg class="h2-mbs" viewBox="0 0 ${w} ${h}" aria-hidden="true">${g}</svg>`;
}

// ── a line's pop-out: the note, the months, this month, the customers behind it, what rose and fell ──
const nmL = s => esc(titleCase(s));
// why a job is left out, in a line: its size against what the account has bought, or no price of its own
const whyHeld = j => {
  const u = Math.round(j.units).toLocaleString('en-US'), at = '$' + j.rate.toFixed(2);
  if (j.reason === 'check') return `${u} hours at its own ${at}, against ${Math.round(j.maxUnits).toLocaleString('en-US')} at most before (last ${dm(j.lastDate)} ${j.lastDate.slice(0, 4)}). May be a keying error.`;
  return `${u} ${j.family === 'labour' ? 'hours' : 'units'}, never bought before. Priced at the book's ${at}, usually what a first-time buyer pays.`;
};
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
    <h3>Top 5 customers</h3><ul class="h2-pl">${d.top.map(x => row(x, `<small>${x.share != null ? Math.round(x.share * 100) + '%' : ''}</small><b>${moneyK(x.v)}</b>`)).join('')}<li class="rest"><span>All others</span><b>${moneyK(d.others)}</b></li></ul>
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
