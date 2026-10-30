// Routes — Mike, desktop first, 06:30. A day by route against each route's own norm; tap a route
// for its stops in order with what each customer's work billed; the week as a grid; booked ahead.
// From /api/activity (Veri-Shred service orders through v_route_day). Route-day margin waits for
// driver pay rates; GPS and times were never captured, so nothing here needs them.
// The long way round: postcodes far from the 35th Street yard with little work, from done orders,
// miles as the crow flies from US Census ZCTA centroids (public/data/zcta.json), visit cost from
// the cost model at that distance.
const YARD = [41.8307, -87.6573];   // 1301 W 35th St
const THIN = 0.6;                   // a route day under 60% of its own norm is thin
const miles = (a, b) => { const r = Math.PI / 180, R = 3958.8, dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dl / 2) ** 2)); };
import { money0, moneyK } from '/components/chart.js';
import { titleCase, esc, loadRates } from '/components/data.js';
import { allocate, mapSvg, loadBasemap, basemapNow, loadRoadnet } from '/components/routemap.js';
const routeName = r => /\d/.test(r || '') ? r : titleCase(r);


const dlabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dshort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();   // 0 Sun … 6 Sat
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pct = v => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '') + Math.abs(Math.round(v * 100)) + '%';
// colour for a fifth or more against the norm, as everywhere else; thin routes carry their own word
const dcls = v => v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'flat';

export async function render(main, A, params) {
  if (!main) return;
  // two tabs: the routes, and the warehouse (views/storage.js)
  const tabs = `<div class="top"><div><h1>${params.tab === 'warehouse' ? 'Warehouse' : 'Routes'}</h1></div><div class="seg rt-tabs"><a href="#activity" class="${params.tab === 'warehouse' ? '' : 'on'}">Routes</a><a href="#activity?tab=warehouse" class="${params.tab === 'warehouse' ? 'on' : ''}">Warehouse</a></div></div>`;
  if (params.tab === 'warehouse') return (await import('/views/storage.js')).render(main, tabs);
  const [R, Z] = await Promise.all([loadRates(), fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({})), loadRoadnet()]);
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
      <div><h1>Routes</h1><div class="sub">Done is what drivers confirmed in Veri-Shred; booked includes work not yet done.</div><div class="seg rt-tabs" style="margin-top:10px"><a href="#activity" class="on">Routes</a><a href="#activity?tab=warehouse">Warehouse</a></div></div>
      <div class="day"><button id="rt-prev" aria-label="Previous day">‹</button><b id="rt-day"></b><button id="rt-next" aria-label="Next day">›</button></div>
    </div>
    <p class="rt-say" id="rt-say"></p>
    <div class="sum" id="rt-sum"></div>
    <div class="card"><div class="card-head"><h3 id="rt-routes-h">By route</h3><small>against each route's own norm</small></div><div id="rt-routes"></div></div>
    <div class="two">
      <div class="card"><div class="card-head"><h3 id="rt-week-h">The week</h3></div><div id="rt-week"></div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3 id="rt-ahead-h">Booked after the latest day</h3></div><div id="rt-ahead"></div></div>
        <div class="card"><div class="card-head"><h3>Margin per route day</h3></div><div class="pending">Starts when driver pay rates by person are loaded: the day's invoiced work less driver pay and the vehicle share of a route day.</div></div>
      </div>
    </div>
    <div class="card" style="margin-top:var(--sp-4)" id="rt-far"></div>
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
    const thin = rows.filter(r => r.services_done > 0 && norm[r.route] && r.services_done < THIN * norm[r.route].done);
    const age = Math.round((Date.now() - Date.parse(A.latestDone + 'T12:00:00Z')) / 864e5);
    const stale = age > 2 ? `<span class="is-warn">The latest work in the data is ${esc(dlabel(A.latestDone))}, ${age} days ago: the daily refresh has not run since, so "booked" dates may already have passed.</span> ` : '';
    $('rt-say').innerHTML = stale + (done ? `${esc(dlabel(day))}: ${done.toLocaleString('en-US')} services done on ${pl(rows.filter(r => r.services_done > 0).length, 'route')}${normDay ? `, <span class="delta ${dcls(done / normDay - 1)}">${pct(done / normDay - 1)}</span> on these routes' own norm` : ''}.${thin.length ? ` <span class="is-warn">Thin: ${thin.map(r => `${esc(routeName(r.route))} (${r.services_done} against ${Math.round(norm[r.route].done)})`).join(', ')}.</span>` : ' No thin route.'}` : 'No work done on this day.');
    $('rt-sum').innerHTML = `
      <div class="card"><div class="lab">Services done</div><div class="big">${done.toLocaleString('en-US')}</div><div class="sub">${normDay ? `<span class="delta ${dcls(done / normDay - 1)}">${pct(done / normDay - 1)}</span> on these routes' norm of ${Math.round(normDay)}` : ''}</div></div>
      <div class="card"><div class="lab">Booked, not done</div><div class="big ${booked - done > done * .5 ? 'is-warn' : ''}">${(booked - done).toLocaleString('en-US')}</div><div class="sub">of ${booked.toLocaleString('en-US')} booked</div></div>
      <div class="card"><div class="lab">Routes out</div><div class="big">${rows.filter(r => r.services_done > 0).length}</div><div class="sub">${rows.reduce((t, r) => t + r.stops_done, 0)} stops done</div></div>
      <div class="card"><div class="lab">Pounds recorded</div><div class="big">${Math.round(pounds).toLocaleString('en-US')}</div><div class="sub">${pounds ? `${Math.round(rows.reduce((t, r) => t + r.pounds_exec_default, 0) / pounds * 100)}% of it is executive bins at a set weight, not weighed` : 'none recorded'}</div></div>`;

    // each card title says what it found, not what it is
    const out = rows.filter(r => r.services_done > 0).length;
    $('rt-routes-h').textContent = out ? `${pl(out, 'route')} out, ${thin.length ? `${thin.length} thin` : 'none thin'}` : 'No routes out';
    const max = Math.max(1, ...rows.map(r => Math.max(r.services_done, norm[r.route] ? norm[r.route].done : 0)));
    $('rt-routes').innerHTML = rows.map(r => {
      const n = norm[r.route], d = n ? r.services_done / n.done - 1 : null;
      return `<div class="r" data-route="${esc(r.route)}">
        <span class="nm">${esc(routeName(r.route))}<small>${esc(r.driver || '')}</small></span>
        <span><span class="meter"><i style="width:${r.services_done / max * 100}%"></i>${n ? `<b style="left:${n.done / max * 100}%" title="norm ${Math.round(n.done)}"></b>` : ''}</span>
          <span class="sub">${r.services_done} of ${r.services} done · ${pl(r.stops_done, 'stop')} · ${pl(r.customers, 'customer')} · ${pl(r.postcodes, 'postcode')}</span></span>
        <span class="v who sub">${esc((r.postcode_list || '').split(' ').slice(0, 4).join(' '))}</span>
        <span class="v">${d == null ? '' : `${r.services_done > 0 && d < THIN - 1 ? '<span class="chip warn">thin</span> ' : ''}<span class="delta ${dcls(d)}">${pct(d)}</span><span class="sub" style="display:block">norm ${Math.round(n.done)}</span>`}</span>
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
    // the route on a map beside its stops: the same numbers, and the stop that took the van furthest
    // out of its way (its detour from components/routemap.js allocate, at postcode centres)
    const pc = p => String(p || '').slice(0, 5);
    const rd = { date: day, route, stops: runs.map(s => ({ ...s, postcode: pc(s.postcode), services: s.done || s.n, pt: Z[pc(s.postcode)] || null, mine: false })) };
    const placed = rd.stops.filter(s => s.pt).length;
    const a = placed ? allocate(R, rd) : null;
    const far = a ? rd.stops.reduce((b, s, i) => (s.detour || 0) > (b ? b.miles : 0) ? { i, miles: s.detour } : b, null) : null;
    const farOk = far && far.miles >= 2 ? far : null;
    const seen = new Set();
    let anyValue = false;
    const list = runs.map((s, i) => {
      const v = !seen.has(s.level1) ? value.get(day + '|' + s.level1) : null; seen.add(s.level1);
      if (v != null) anyValue = true;
      return `<div class="stop"><span class="n">${i + 1}</span><span><a href="#customer/${s.level1}" style="color:inherit;text-decoration:none;font-weight:600">${esc(titleCase(s.company))}</a> <span class="sub">${s.stops > 1 ? s.stops + ' stops · ' : ''}${esc(s.postcode || '')}</span></span>
        <span class="sub">${s.done} of ${s.n} done</span><span class="v">${v != null ? money0(v) : ''}</span></div>`;
    }).join('') + `<p class="sub" style="margin:var(--sp-2) 0 0">${anyValue ? 'Value is what that customer\'s work billed on the day, shown at its first stop.' : 'Work on this day is not billed yet: VCK prices it at the month\'s run.'}</p>`;
    if (!a) { box.innerHTML = list; return; }
    const unplaced = rd.stops.length - placed, fs = farOk && rd.stops[farOk.i];
    const say = `About ${Math.round(a.dayMiles)} ${a.road ? 'road ' : ''}miles yard to yard ◇${fs ? `; stop ${farOk.i + 1}, ${esc(titleCase(fs.company))} at ${esc(fs.postcode)}, took the van about ${Math.round(farOk.miles)} miles out of its way` : ''}${unplaced ? `; ${pl(unplaced, 'stop')} without a postcode centre left off the map` : ''}. ${a.road ? 'The likely way by main roads between postcode centres (US Census); dashed where the roads give no way' : 'Straight lines between postcode centres'}: no GPS was captured.`;
    box.innerHTML = `<div class="rm-grid"><div class="rm-wrap"></div><div>${list}</div></div><p class="sub" style="margin:var(--sp-2) 0 0">${say}</p>`;
    const draw = () => { const w = box.querySelector('.rm-wrap'); if (w) w.innerHTML = mapSvg(rd, { width: Math.max(280, Math.min(900, w.clientWidth || 560)), base: basemapNow(), far: farOk }); };
    draw();
    if (!basemapNow()) loadBasemap().then(b => { if (b && box.isConnected && !box.hidden) draw(); });   // redrawn once the outline arrives
  }

  function drawWeek() {
    const monday = addDays(day, -((dow(day) + 6) % 7));
    const dates = [0, 1, 2, 3, 4].map(n => addDays(monday, n));
    const routes = [...new Set(real.filter(r => dates.includes(r.date)).map(r => r.route))].sort();
    const max = Math.max(1, ...real.filter(r => dates.includes(r.date)).map(r => r.services_done));
    let g = `<div class="grid" style="grid-template-columns:calc(var(--u) * 18) repeat(5, minmax(0, 1fr))"><span></span>${dates.map(d => `<span class="h">${dshort(d)}</span>`).join('')}`;
    for (const rt of routes) {
      g += `<span class="rl">${esc(routeName(rt))}</span>`;
      for (const d of dates) {
        const r = real.find(x => x.date === d && x.route === rt);
        if (!r || !r.services_done) { g += `<span class="c none">${r && r.services ? `<small>${r.services} booked</small>` : '—'}</span>`; continue; }
        const a = .12 + .55 * r.services_done / max;
        g += `<span class="c ${d === day ? 'sel' : ''}" data-d="${d}" style="background:color-mix(in srgb, var(--heat) ${Math.round(a * 100)}%, var(--surface))"><b>${r.services_done}</b><small>${pl(r.stops_done, 'stop')}</small></span>`;
      }
    }
    const wk = real.filter(r => dates.includes(r.date)).reduce((t, r) => t + r.services_done, 0);
    $('rt-week-h').textContent = `${wk.toLocaleString('en-US')} services done in the week of ${dshort(monday)}`;
    $('rt-week').innerHTML = g + '</div>';
  }

  function drawAhead() {
    const ahead = real.filter(r => r.date > A.latestDone && r.services > 0);
    const dates = [...new Set(ahead.map(r => r.date))].sort().slice(0, 7);
    const bookedAhead = ahead.filter(r => dates.includes(r.date)).reduce((t, r) => t + r.services, 0);
    $('rt-ahead-h').textContent = dates.length ? `${bookedAhead.toLocaleString('en-US')} services booked over the next ${pl(dates.length, 'day')}` : 'Nothing booked ahead';
    $('rt-ahead').innerHTML = dates.map(d => {
      const rs = ahead.filter(r => r.date === d), tot = rs.reduce((t, r) => t + r.services, 0);
      return `<div class="stop" style="grid-template-columns: minmax(0,1fr) auto"><span><b>${dshort(d)}</b> <span class="sub">${rs.map(r => routeName(r.route)).join(', ')}</span></span><span class="v"><b>${tot}</b> <span class="sub">booked</span></span></div>`;
    }).join('') || '<p class="sub">Nothing booked beyond the latest day.</p>';
  }

  function drawFar() {
    const el = $('rt-far');
    const pts = A.postcodes && A.postcodes.length ? A.postcodes : null;   // twelve months, from the next snapshot
    let by;
    if (pts) by = pts.map(p => ({ pc: p.postcode, services: p.services, visits: p.visits, customers: p.customers, names: (p.names || '').split(', ').filter(Boolean).map(titleCase).join(', '), billing: p.billing_only }));
    else {
      const m = new Map();
      for (const o of A.orders) {
        if (!o.done || !o.postcode || o.date > A.latestDone) continue;
        const x = m.get(o.postcode) || { pc: o.postcode, services: 0, visitKeys: new Set(), cust: new Map() };
        x.services++; x.visitKeys.add(o.date + '|' + o.stop); x.cust.set(o.level1, o.company);
        m.set(o.postcode, x);
      }
      by = [...m.values()].map(x => ({ pc: x.pc, services: x.services, visits: x.visitKeys.size, customers: x.cust.size, names: [...x.cust.values()].slice(0, 2).map(titleCase).join(', ') }));
    }
    by = by.filter(p => Z[p.pc]).map(p => {
      const mi = miles(YARD, Z[p.pc]);
      const c = R.costToServe('movement', 0, { visits: p.visits, miles: Math.round(mi * 10) / 10 });
      return { ...p, mi, cost: c.total, per: p.services ? c.total / p.services : null };
    });
    if (!by.length) { el.innerHTML = '<div class="card-head"><h3>The long way round</h3></div><div class="pending">No postcodes on done orders in this window.</div>'; return; }
    const total = by.reduce((t, p) => t + p.services, 0);
    const bands = [[0, 5, 'Within 5 miles'], [5, 10, '5 to 10'], [10, 20, '10 to 20'], [20, 35, '20 to 35'], [35, 999, 'Beyond 35']].map(([a, b, l]) => {
      const ps = by.filter(p => p.mi >= a && p.mi < b), sv = ps.reduce((t, p) => t + p.services, 0);
      return { l, sv, share: total ? sv / total : 0, n: ps.length };
    });
    // ranked by what the trips cost in route time, not by distance: a far postcode visited once is
    // cheaper in total than a nearer one visited every week
    const far = by.filter(p => p.mi >= 20 && !p.billing).sort((a, b) => b.cost - a.cost).slice(0, 12);
    const near10 = (bands[0].sv + bands[1].sv) / (total || 1);
    const farV = far.reduce((t, p) => t + p.visits, 0), farS = far.reduce((t, p) => t + p.services, 0), farC = far.reduce((t, p) => t + p.cost, 0);
    const window = pts ? 'twelve months' : `the ${Math.round((new Date(A.latestDone) - new Date(A.orders.map(o => o.date).sort()[0])) / 864e5) + 1} days to ${dshort(A.latestDone)}`;
    el.innerHTML = `<div class="card-head"><h3>${Math.round(near10 * 100)}% of the work is within ten miles of the yard</h3><small>${esc(window)}</small></div>
      <div class="sub">Done services by distance from 1301 W 35th St, as the crow flies.${pts ? '' : ' Three weeks of stops for now; the next snapshot brings a full year.'}</div>
      <div class="bands">${bands.map(b => `<span>${b.l}</span><span class="bar"><i style="width:${b.share * 100}%"></i></span><span class="v">${b.sv.toLocaleString('en-US')}</span><span class="v sub">${Math.round(b.share * 100)}%</span>`).join('')}</div>
      ${far.length ? `<div class="card-head" style="margin-top:var(--sp-2)"><h3>The long way round: ${far.length} postcodes 20 miles or more out</h3><small>visit cost ◇ per service</small></div>
      <div class="sub" style="margin-bottom:var(--sp-2)">${farV} visits for ${farS} services, about ${money0(farC / (farS || 1))} a service in route time ◇. Bundle them onto a planned run, or price the trip.</div>
      <table class="far"><thead><tr><th>Postcode</th><th>Miles</th><th class="hide-s">Visits</th><th class="hide-s">Services</th><th>Route time ◇</th><th>Per service ◇</th></tr></thead><tbody>
      ${far.map(p => `<tr><td><b>${esc(p.pc)}</b> <span class="sub nm">${esc(p.names)}</span></td><td>${p.mi.toFixed(0)}</td><td class="hide-s">${p.visits}</td><td class="hide-s">${p.services}</td><td>${money0(p.cost)}</td><td class="${p.per > 100 ? 'is-warn' : ''}">${money0(p.per)}</td></tr>`).join('')}</tbody></table>` : '<p class="sub">No work 20 miles or more out in this window.</p>'}
      <div class="src">Veri-Shred done orders · postcode of the service address, else the billing address (an outlier may be a head office) · miles from US Census ZCTA centroids · route time from the cost model: a route day's travel share scaled for distance, plus time on site ◇ · route costs under review</div>`;
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
  drawDay(); drawWeek(); drawAhead(); drawFar();
}
