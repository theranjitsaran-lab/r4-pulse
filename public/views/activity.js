// Routes — Mike, desktop first, 06:30. A day by route against each route's own norm; tap a route
// for its stops in order with what each customer's work billed; the week as a grid; booked ahead.
// From /api/activity (Veri-Shred service orders through v_route_day). Route-day margin waits for
// driver pay rates; GPS and times were never captured, so nothing here needs them.
import { money0, moneyK } from '/components/chart.js';
import { titleCase, esc } from '/components/data.js';
const routeName = r => /\d/.test(r || '') ? r : titleCase(r);

const STYLE = `
.rt h1 { font-size: var(--fs-display); font-weight: 700; letter-spacing: var(--track-tight); margin: 0; }
.rt .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.rt .day { display: flex; align-items: center; gap: 8px; }
.rt .day button { border: 1px solid var(--rule-3); background: var(--surface); border-radius: 9px; width: 34px; height: 34px; font-size: 18px; color: var(--ink-2); cursor: pointer; }
.rt .day button:disabled { opacity: .35; cursor: default; }
.rt .day b { font-size: 17px; min-width: 150px; text-align: center; }
.rt .sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 14px; }
.rt .r { display: grid; grid-template-columns: 110px minmax(0, 1fr) 170px 90px 12px; gap: 14px; align-items: center; padding: 12px 0; border-top: 1px solid var(--rule); cursor: pointer; }
.rt .r:first-child { border-top: 0; }
.rt .r.open { background: var(--well); margin: 0 -12px; padding: 12px; border-radius: 10px; }
.rt .r .nm { font-weight: 700; }
.rt .r .nm small { display: block; font-weight: 400; color: var(--ink-3); font-size: 12px; }
.rt .r .meter { display: block; margin-bottom: 4px; height: 8px; background: var(--well-2); border-radius: 4px; position: relative; }
.rt .r .meter i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--s-storage); border-radius: 4px; }
.rt .r .meter b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); opacity: .55; }
.rt .r .v { text-align: right; font-variant-numeric: tabular-nums; }
.rt .r .go { color: var(--ink-5); }
.rt .stops { padding: 6px 0 12px 124px; }
.rt .stop { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto; gap: 12px; align-items: baseline; padding: 7px 0; border-top: 1px solid var(--rule); font-size: 14px; }
.rt .stop:first-child { border-top: 0; }
.rt .stop .n { color: var(--ink-4); font-variant-numeric: tabular-nums; }
.rt .stop .v { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rt .grid { display: grid; gap: 4px; }
.rt .grid .h { font-size: 12px; color: var(--ink-3); text-align: center; padding-bottom: 2px; }
.rt .grid .rl { font-size: 13px; font-weight: 600; align-self: center; }
.rt .grid .c { border-radius: 8px; min-height: 46px; display: flex; flex-direction: column; justify-content: center; align-items: center; font-variant-numeric: tabular-nums; cursor: pointer; border: 1px solid transparent; }
.rt .grid .c b { font-size: 15px; }
.rt .grid .c small { font-size: 11px; opacity: .8; }
.rt .grid .c.sel { border-color: var(--ink); }
.rt .grid .c.none { background: var(--well); color: var(--ink-5); cursor: default; }
.rt .two { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; margin-top: 14px; align-items: start; }
@media (max-width: 860px) {
  .rt h1 { font-size: 28px; }
  .rt .sum { grid-template-columns: 1fr 1fr; }
  .rt .r { grid-template-columns: 84px minmax(0, 1fr) 70px 12px; }
  .rt .r .who { display: none; }
  .rt .stops { padding-left: 0; }
  .rt .two { grid-template-columns: 1fr; }
}`;

function injectCss() {
  if (document.getElementById('rt-css')) return;
  const s = document.createElement('style'); s.id = 'rt-css'; s.textContent = STYLE; document.head.appendChild(s);
}
const dlabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dshort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();   // 0 Sun … 6 Sat
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pct = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(Math.round(v * 100)) + '%';
const dcls = v => v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat';

export function render(main, A, params) {
  if (!main) return;
  injectCss();
  const real = A.routeDays.filter(r => r.route && r.route !== '--');
  const doneDays = [...new Set(real.filter(r => r.services_done > 0).map(r => r.date))].sort();
  let day = params.date && doneDays.includes(params.date) ? params.date : A.latestDone;

  // each route's own norm: mean done services on the days it ran, over the history in the fixture
  const norm = {};
  for (const r of real.filter(x => x.services_done > 0 && x.date <= A.latestDone)) {
    const n = norm[r.route] = norm[r.route] || { days: 0, done: 0, stops: 0 };
    n.days++; n.done += r.services_done; n.stops += r.stops_done;
  }
  for (const k in norm) { norm[k].done /= norm[k].days; norm[k].stops /= norm[k].days; }
  const value = new Map(A.dayValues.map(v => [v.date + '|' + v.level1, v.value]));

  main.innerHTML = `
  <div class="rt">
    <div class="top">
      <div><h1>Routes</h1><div class="sub">Done is what drivers confirmed in Veri-Shred; booked includes work not yet done.</div></div>
      <div class="day"><button id="rt-prev" aria-label="Previous day">‹</button><b id="rt-day"></b><button id="rt-next" aria-label="Next day">›</button></div>
    </div>
    <div class="sum" id="rt-sum"></div>
    <div class="card"><div class="card-head"><h3>By route</h3><small>done against each route's own norm · tap for stops</small></div><div id="rt-routes"></div></div>
    <div class="two">
      <div class="card"><div class="card-head"><h3>The week</h3><small>done services · tap a day</small></div><div id="rt-week"></div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Booked ahead</h3><small>services on the books</small></div><div id="rt-ahead"></div></div>
        <div class="card"><div class="card-head"><h3>Margin per route day</h3></div><div class="pending">Starts when driver pay rates by person are loaded: the day's invoiced work less driver pay and the vehicle share of a route day.</div></div>
      </div>
    </div>
  </div>`;
  const $ = id => main.querySelector('#' + id);

  function drawDay() {
    const rows = real.filter(r => r.date === day).sort((a, b) => b.services_done - a.services_done);
    const i = doneDays.indexOf(day);
    $('rt-day').textContent = dlabel(day);
    $('rt-prev').disabled = i <= 0; $('rt-next').disabled = i < 0 || i >= doneDays.length - 1;
    const done = rows.reduce((t, r) => t + r.services_done, 0), booked = rows.reduce((t, r) => t + r.services, 0);
    const normDay = rows.reduce((t, r) => t + (norm[r.route] ? norm[r.route].done : 0), 0);
    const pounds = rows.reduce((t, r) => t + r.pounds, 0);
    $('rt-sum').innerHTML = `
      <div class="card"><div class="lab">Services done</div><div class="big">${done.toLocaleString('en-US')}</div><div class="sub">${normDay ? `<span class="delta ${dcls(done / normDay - 1)}">${pct(done / normDay - 1)}</span> on these routes' norm of ${Math.round(normDay)}` : ''}</div></div>
      <div class="card"><div class="lab">Booked, not done</div><div class="big ${booked - done > done * .5 ? 'is-warn' : ''}">${(booked - done).toLocaleString('en-US')}</div><div class="sub">of ${booked.toLocaleString('en-US')} booked</div></div>
      <div class="card"><div class="lab">Routes out</div><div class="big">${rows.filter(r => r.services_done > 0).length}</div><div class="sub">${rows.reduce((t, r) => t + r.stops_done, 0)} stops done</div></div>
      <div class="card"><div class="lab">Pounds recorded</div><div class="big">${Math.round(pounds).toLocaleString('en-US')}</div><div class="sub">${pounds ? Math.round(rows.reduce((t, r) => t + r.pounds_exec_default, 0) / pounds * 100) + '% executive-bin defaults' : 'none recorded'}</div></div>`;

    const max = Math.max(1, ...rows.map(r => Math.max(r.services_done, norm[r.route] ? norm[r.route].done : 0)));
    $('rt-routes').innerHTML = rows.map(r => {
      const n = norm[r.route], d = n ? r.services_done / n.done - 1 : null;
      return `<div class="r" data-route="${esc(r.route)}">
        <span class="nm">${esc(routeName(r.route))}<small>${esc(r.driver || '')}</small></span>
        <span><span class="meter"><i style="width:${r.services_done / max * 100}%"></i>${n ? `<b style="left:${n.done / max * 100}%" title="norm ${Math.round(n.done)}"></b>` : ''}</span>
          <span class="sub">${r.services_done} of ${r.services} done · ${pl(r.stops_done, 'stop')} · ${pl(r.customers, 'customer')} · ${pl(r.postcodes, 'postcode')}</span></span>
        <span class="v who sub">${esc((r.postcode_list || '').split(' ').slice(0, 4).join(' '))}</span>
        <span class="v">${d == null ? '' : `<span class="delta ${dcls(d)}">${pct(d)}</span><span class="sub" style="display:block">norm ${Math.round(n.done)}</span>`}</span>
        <span class="go">›</span></div><div class="stops" data-for="${esc(r.route)}" hidden></div>`;
    }).join('') || '<p class="sub">No routes ran on this day.</p>';
  }

  function drawStops(route, box) {
    const os = A.orders.filter(o => o.date === day && o.route === route);
    if (!os.length) { box.innerHTML = '<p class="sub">Stops are kept for the last three weeks.</p>'; return; }
    const stops = [];
    for (const o of os) {
      let s = stops.find(x => x.stop === o.stop && x.level1 === o.level1);
      if (!s) { s = { stop: o.stop, level1: o.level1, company: o.company, seq: o.seq, postcode: o.postcode, n: 0, done: 0 }; stops.push(s); }
      s.n++; if (o.done) s.done++;
    }
    stops.sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
    // consecutive stops at one customer (a hospital's departments) fold into one line
    const runs = [];
    for (const st of stops) {
      const last = runs[runs.length - 1];
      if (last && last.level1 === st.level1) { last.stops++; last.n += st.n; last.done += st.done; }
      else runs.push({ ...st, stops: 1 });
    }
    const seen = new Set();
    let anyValue = false;
    box.innerHTML = runs.map((s, i) => {
      const v = !seen.has(s.level1) ? value.get(day + '|' + s.level1) : null; seen.add(s.level1);
      if (v != null) anyValue = true;
      return `<div class="stop"><span class="n">${i + 1}</span><span><a href="#customer/${s.level1}" style="color:inherit;text-decoration:none;font-weight:600">${esc(titleCase(s.company))}</a> <span class="sub">${s.stops > 1 ? s.stops + ' stops · ' : ''}${esc(s.postcode || '')}</span></span>
        <span class="sub">${s.done} of ${s.n} done</span><span class="v">${v != null ? money0(v) : ''}</span></div>`;
    }).join('') + `<p class="sub" style="margin:8px 0 0">${anyValue ? 'Value is what that customer\'s work billed on the day, shown at its first stop.' : 'Work on this day is not billed yet: VCK prices it at the month\'s run.'}</p>`;
  }

  function drawWeek() {
    const monday = addDays(day, -((dow(day) + 6) % 7));
    const dates = [0, 1, 2, 3, 4].map(n => addDays(monday, n));
    const routes = [...new Set(real.filter(r => dates.includes(r.date)).map(r => r.route))].sort();
    const max = Math.max(1, ...real.filter(r => dates.includes(r.date)).map(r => r.services_done));
    let g = `<div class="grid" style="grid-template-columns: 72px repeat(5, minmax(0, 1fr))"><span></span>${dates.map(d => `<span class="h">${dshort(d)}</span>`).join('')}`;
    for (const rt of routes) {
      g += `<span class="rl">${esc(routeName(rt))}</span>`;
      for (const d of dates) {
        const r = real.find(x => x.date === d && x.route === rt);
        if (!r || !r.services_done) { g += `<span class="c none">${r && r.services ? `<small>${r.services} booked</small>` : '—'}</span>`; continue; }
        const a = .12 + .55 * r.services_done / max;
        g += `<span class="c ${d === day ? 'sel' : ''}" data-d="${d}" style="background:color-mix(in srgb, var(--s-storage) ${Math.round(a * 100)}%, var(--surface))"><b>${r.services_done}</b><small>${pl(r.stops_done, 'stop')}</small></span>`;
      }
    }
    $('rt-week').innerHTML = g + '</div>';
  }

  function drawAhead() {
    const ahead = real.filter(r => r.date > A.latestDone && r.services > 0);
    const dates = [...new Set(ahead.map(r => r.date))].sort().slice(0, 7);
    $('rt-ahead').innerHTML = dates.map(d => {
      const rs = ahead.filter(r => r.date === d), tot = rs.reduce((t, r) => t + r.services, 0);
      return `<div class="stop" style="grid-template-columns: minmax(0,1fr) auto"><span><b>${dshort(d)}</b> <span class="sub">${rs.map(r => routeName(r.route)).join(', ')}</span></span><span class="v"><b>${tot}</b> <span class="sub">booked</span></span></div>`;
    }).join('') || '<p class="sub">Nothing booked beyond the latest day.</p>';
  }

  function redraw() { drawDay(); drawWeek(); history.replaceState(null, '', `#activity?date=${day}`); }
  $('rt-prev').addEventListener('click', () => { const i = doneDays.indexOf(day); if (i > 0) { day = doneDays[i - 1]; redraw(); } });
  $('rt-next').addEventListener('click', () => { const i = doneDays.indexOf(day); if (i < doneDays.length - 1) { day = doneDays[i + 1]; redraw(); } });
  $('rt-week').addEventListener('click', ev => { const c = ev.target.closest('.c[data-d]'); if (c) { day = c.dataset.d; redraw(); } });
  $('rt-routes').addEventListener('click', ev => {
    if (ev.target.closest('a')) return;
    const row = ev.target.closest('.r'); if (!row) return;
    const box = main.querySelector(`.stops[data-for="${CSS.escape(row.dataset.route)}"]`);
    const open = !box.hidden;
    main.querySelectorAll('.stops').forEach(b => { b.hidden = true; b.innerHTML = ''; });
    main.querySelectorAll('.r').forEach(r => r.classList.remove('open'));
    if (open) return;
    row.classList.add('open'); box.hidden = false; drawStops(row.dataset.route, box);
  });
  drawDay(); drawWeek(); drawAhead();
}
