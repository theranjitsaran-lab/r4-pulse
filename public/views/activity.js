// Operations › Routes — Mike, desktop first, 06:30. A view to plan from: pick a period, compare it with the one before, and
// see where the trucks went, how dense the work is and which far areas cost more than they earn. Day keeps the day: by route
// against each route's own norm, tap a route for its stops, the week as a grid, booked ahead.
// Figures from view/operations (components/opsdata.js), the day from /api/activity. GPS, arrival times and the driven order
// were never captured, so lines follow the shortest likely round along the main roads and say so.
import * as Fmt from '/components/format.js';
import { money0, moneyK } from '/components/chart.js';
import { titleCase, esc, loadRates, getJson } from '/components/data.js';
import { routeNorms, LABELS, THIN } from '/components/metrics.js';
import { costsVisible, whoAmI } from '/components/access.js';
import { dataTable } from '/components/datatable.js';
import { litCard, drawPoints, tile, chip, chipText, barsSvg, ragLabel } from '/components/lit.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { openPop } from '/components/pop.js';
import { areaFrame, landLayer, yardMark, scaleBar } from '/components/areamap.js';
import { loadZones, bookShading, districtLayer, routeLayer, maskFor, maskId, playMap, zoneKey, seg, shadesOf } from '/components/mapkit.js';
import { densityByPostcode } from '/components/jobview.js';
import { allocate, mapSvg, loadBasemap, basemapNow, loadRoadnet, roadPath, YARD, miles } from '/components/routemap.js';
import { likelyRound, FAR_MILES, MIN_VISITS } from '/components/opsdata.js';

const PERIODS = ['day', 'week', 'month', 'q', 'h', 'y'];
const OWNERS = ['Mike Kelly', 'Anne Sterne', 'Trisha Rooney'];
const routeName = r => /\d/.test(r || '') ? r : titleCase(r);
const dlabel = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dshort = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
const dow = d => new Date(d + 'T00:00:00Z').getUTCDay();   // 0 Sun … 6 Sat
const n0 = Fmt.count;
const pl = (n, w) => `${Fmt.grouped(n)} ${w}${n === 1 ? '' : 's'}`;
const pct = v => Fmt.change(v);
// colour for a fifth or more against the norm, as everywhere else; thin routes carry their own word
const dcls = v => v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'flat';
const change = (a, b) => a != null && b ? a / b - 1 : null;
const key = (a, b) => { const ka = a.join(), kb = b.join(); return ka < kb ? ka + '|' + kb : kb + '|' + ka; };
const signedPc = v => (v < 0 ? '−' : '') + Fmt.pct(Math.abs(v));
const mon = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
// join road stretches that meet into one line, so a dashed line stays dashed and a period is a handful of paths
function chains(segs) {
  const ends = new Map(), used = new Set(), out = [];
  const at = (p, s) => { const k = p.join(); (ends.get(k) || ends.set(k, []).get(k)).push(s); };
  for (const s of segs) { at(s.a, s); at(s.b, s); }
  const next = p => (ends.get(p.join()) || []).find(s => !used.has(s));
  for (const s of segs) {
    if (used.has(s)) continue;
    used.add(s);
    const line = [s.a, s.b];
    for (let tip = s.b, n = next(tip); n; n = next(tip)) { used.add(n); tip = n.a.join() === tip.join() ? n.b : n.a; line.push(tip); }
    for (let tip = s.a, n = next(tip); n; n = next(tip)) { used.add(n); tip = n.a.join() === tip.join() ? n.b : n.a; line.unshift(tip); }
    out.push(line);
  }
  return out;
}
const lineD = (line, P) => line.map((q, i) => { const [x, y] = P(q); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join('');
const near = (px, py, s) => { const dx = s.x2 - s.x1, dy = s.y2 - s.y1, t = Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - s.x1 - t * dx, py - s.y1 - t * dy); };

export async function render(main, A, params) {
  if (!main) return;
  // Warehouse has its own route; old links follow it
  if (params.tab === 'warehouse') { location.replace('#numbers?tab=warehouse'); return; }
  const [R, Z, base, , zones] = await Promise.all([loadRates(), fetch('/data/zcta.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    loadBasemap(), loadRoadnet(), loadZones()]);
  const real = A.routeDays.filter(r => r.route && r.route !== '--');
  const doneDays = [...new Set(real.filter(r => r.services_done > 0).map(r => r.date))].sort();
  const value = new Map(A.dayValues.map(v => [v.date + '|' + v.level1, v.value]));
  const st = { p: PERIODS.includes(params.p) ? params.p : params.date ? 'day' : 'q', cmp: params.cmp === '1', lens: ['routes', 'add', 'cost'].includes(params.lens) ? params.lens : 'routes', focus: null, day: params.date && doneDays.includes(params.date) ? params.date : A.latestDone };
  let V = null, norm = {}, hl = null, played = null, token = 0, hits = [];
  const aheadRows = real.filter(r => r.date > A.latestDone && r.services > 0), aheadDates = [...new Set(aheadRows.map(r => r.date))].sort().slice(0, 7);
  const bookedAhead = aheadRows.filter(r => aheadDates.includes(r.date)).reduce((t, r) => t + r.services, 0);

  main.innerHTML = `
  <div class="rt h2 ac ops">
    <div class="top">
      <div><h1>Operations</h1><div class="seg rt-tabs"><a href="#activity" class="on">Routes</a><a href="#numbers?tab=warehouse">Warehouse</a></div></div>
      <div class="ops-ctl">
        <div class="seg" id="op-period" role="group" aria-label="Period"></div>
        <label class="ops-cmp" id="op-cmpl"><input type="checkbox" id="op-cmp"> Compare with the period before</label>
        <div class="day" id="op-day" hidden><button id="rt-prev" aria-label="Previous day"></button><b id="rt-day"></b><button id="rt-next" aria-label="Next day"></button></div>
      </div>
    </div>
    ${litCard('op-lit', 'Pulse summary for the period, from the figures below')}
    <section class="ktiles" id="op-kpis"></section>
    <section class="h2-card rt-mapcard" data-in>
      <div class="rt-maphead"><div class="h2-ch"><h2 id="rt-map-t"></h2><small id="rt-map-s"></small></div>
        <div class="seg" id="rt-layer" role="group" aria-label="Show on the map"><button data-l="routes">Routes</button><button data-l="add">Where to add customers</button><button data-l="cost">${costsVisible() ? 'Costly to serve' : 'Far areas'}</button></div></div>
      <div class="ops-mapgrid"><div class="ops-mapwrap"><div id="rt-map"></div><div class="c-tip" id="op-tip" hidden></div><div class="h2-key" id="rt-map-key"></div></div><div class="ops-side" id="op-side"></div></div>
    </section>
    <div class="ops-view" id="op-period-view">
      <section class="h2-card" data-in><div class="h2-ch"><h2 id="op-routes-h"></h2><small>Services per route day is the density measure: more work on the same drive. Tap a route to pick it out on the map.</small></div><div id="op-routes"></div></section>
    </div>
    <div class="ops-view" id="op-day-view" hidden>
      <section class="h2-card" data-in><div class="h2-ch"><h2 id="rt-routes-h">By route</h2><small id="rt-routes-s"></small></div><div id="rt-routes"></div></section>
      <div class="two">
        <section class="h2-card" data-in><div class="h2-ch"><h2 id="rt-week-h">The week</h2></div><div id="rt-week"></div></section>
        <section class="h2-card" data-in><div class="h2-ch"><h2 id="rt-ahead-h">Booked after the latest day</h2></div><div id="rt-ahead"></div></section>
      </div>
    </div>
    <section class="h2-card" data-in id="op-dense"></section>
    <section class="h2-card" data-in id="op-costly"></section>
    <section class="h2-card" data-in id="op-bands"></section>
  </div>`;
  const $ = id => main.querySelector('#' + id), root = main.querySelector('.ops');

  // the link says what is on screen, whatever else the tables keep in it
  function keepLink() {
    const u = new URLSearchParams(location.hash.split('?')[1] || '');
    u.set('p', st.p);
    if (st.cmp) u.set('cmp', '1'); else u.delete('cmp');
    if (st.lens !== 'routes') u.set('lens', st.lens); else u.delete('lens');
    if (st.p === 'day') u.set('date', st.day); else u.delete('date');
    history.replaceState(null, '', '#activity?' + u);
  }
  const canCompare = () => !!(V && V.period.compare);
  const comparing = () => st.cmp && canCompare() && st.p !== 'day';

  // ── the figures ──
  function drawKpis() {
    const { now, prev, period: p } = V;
    const vs = (a, b) => prev ? `${chip(change(a, b))} on ${esc(p.prevName)}` : esc(p.why ? 'no full period before' : '');
    const tenD = prev && now.within10 != null && prev.within10 != null ? Math.round((now.within10 - prev.within10) * 100) : null;
    const cost = V.costs ? tile({ still: true, d: 160, label: 'Route cost a service, est.', big: now.costPerService == null ? '—' : Fmt.money(now.costPerService, { dp: 2 }), sub: vs(now.costPerService, prev && prev.costPerService) })
      : tile({ still: true, d: 160, label: 'Stops', big: Fmt.grouped(now.stops), sub: vs(now.stops, prev && prev.stops) });
    $('op-kpis').innerHTML = `
      ${tile({ still: true, lead: true, label: 'Services done', big: Fmt.grouped(now.services), sub: vs(now.services, prev && prev.services) })}
      ${tile({ still: true, d: 80, label: 'Services per route day', big: now.perDay == null ? '—' : Fmt.fixed(now.perDay, 1), sub: vs(now.perDay, prev && prev.perDay) })}
      ${cost}
      ${tile({ still: true, d: 240, label: 'Within 10 miles of the yard', big: now.within10 == null ? '—' : Fmt.pct(now.within10), sub: tenD == null ? 'of services placed on the map' : `${chipText(tenD === 0 ? 'level' : `${tenD > 0 ? '+' : '−'}${Math.abs(tenD)} ${Math.abs(tenD) === 1 ? 'pt' : 'pts'}`)} on ${esc(p.prevName)}` })}`;
    const lit = $('op-lit');
    lit.innerHTML = '<div></div>';   // a new element each time, so a slow reply for the last period cannot land on this one
    if (st.p !== 'day') drawPoints(lit.firstChild, V.points);
  }

  // ── the day, as it was: by route against its norm ──
  function drawDay() {
    norm = routeNorms(A, st.day);
    const rows = real.filter(r => r.date === st.day).sort((a, b) => b.services_done - a.services_done);
    const i = doneDays.indexOf(st.day);
    $('rt-day').textContent = dlabel(st.day);
    $('rt-prev').disabled = i <= 0; $('rt-next').disabled = i < 0 || i >= doneDays.length - 1;
    const done = rows.reduce((t, r) => t + r.services_done, 0), booked = rows.reduce((t, r) => t + r.services, 0);
    const normDay = rows.reduce((t, r) => t + (norm[r.route] ? norm[r.route].done : 0), 0), pounds = rows.reduce((t, r) => t + r.pounds, 0);
    const thin = rows.filter(r => r.services_done > 0 && norm[r.route] && r.services_done < THIN * norm[r.route].done);
    const age = Math.round((Date.now() - Date.parse(A.latestDone + 'T12:00:00Z')) / 864e5);
    const out = rows.filter(r => r.services_done > 0).length, dn = normDay ? done / normDay - 1 : null;
    drawPoints($('op-lit').firstChild, [
      done ? { key: 'day', tone: dn != null && dn <= -.2 ? 'r' : 'g', lead: `${Fmt.grouped(done)} services done on ${pl(out, 'route')}${dn != null ? ',' : '.'}`, rest: dn != null ? `${pct(dn)} on the ${Math.round(normDay)} normal for these routes.` : '' } : { key: 'day', tone: 'a', lead: 'No work done on this day.', rest: '' },
      thin.length ? { key: 'thin', tone: 'a', lead: `${pl(thin.length, 'route')} ran thin:`, rest: `${thin.map(r => `${routeName(r.route)} (${r.services_done} against ${Math.round(norm[r.route].done)})`).join(', ')}.` } : { key: 'thin', tone: 'g', lead: 'No thin route', rest: "against each route's own norm." },
      { key: 'ahead', tone: age > 2 ? 'a' : 'g', lead: aheadDates.length ? `${Fmt.grouped(bookedAhead)} services are booked` : 'Nothing is booked', rest: aheadDates.length ? `over the next ${pl(aheadDates.length, 'day')}${age > 2 ? `; the data is ${age} days old, so some may have passed` : ''}.` : 'beyond the latest day.' },
    ]);
    $('rt-routes-h').textContent = out ? `${pl(out, 'route')} out, ${thin.length ? `${thin.length} thin` : 'none thin'}` : 'No routes out';
    $('rt-routes-s').textContent = `The tick is ${LABELS.normalRoute}, its 8-week median. ${Fmt.grouped(booked - done)} of ${Fmt.grouped(booked)} booked not done${pounds ? `; ${Fmt.num(pounds)} lb recorded, ${Fmt.pct(rows.reduce((t, r) => t + r.pounds_exec_default, 0) / pounds)} at a set weight, not weighed` : ''}.`;
    const max = Math.max(1, ...rows.map(r => Math.max(r.services_done, norm[r.route] ? norm[r.route].done : 0)));
    $('rt-routes').innerHTML = rows.map(r => {
      const n = norm[r.route], d = n ? r.services_done / n.done - 1 : null;
      return `<div class="rrow" role="button" tabindex="0" aria-expanded="false" data-route="${esc(r.route)}">
        <span class="nm">${esc(routeName(r.route))}<small>${esc(r.driver || '')}</small></span>
        <span class="bw"><span class="meter"><i style="width:${r.services_done / max * 100}%"></i>${n ? `<b style="left:${n.done / max * 100}%" title="normal ${Math.round(n.done)}"></b>` : ''}</span>
          <span class="sub">${r.services_done} of ${r.services} done, ${pl(r.stops_done, 'stop')}, ${pl(r.customers, 'customer')}</span></span>
        <span class="v">${d == null ? '' : `${r.services_done > 0 && d < THIN - 1 ? '<span class="chip warn">thin</span> ' : ''}<span class="delta ${dcls(d)}">${pct(d)}</span><span class="sub" style="display:block">normal ${Math.round(n.done)}</span>`}</span>
        <em class="go chev"></em></div><div class="stops" data-for="${esc(r.route)}" hidden></div>`;
    }).join('') || '<p class="sub">No routes ran on this day.</p>';
    drawWeek();
  }
  function drawStops(route, box) {
    const os = A.orders.filter(o => o.date === st.day && o.route === route);
    if (!os.length) { box.innerHTML = '<p class="sub">Stops are kept for the last three weeks.</p>'; return; }
    const stops = [];
    for (const o of os) {
      let s = stops.find(x => x.stop === o.stop && x.level1 === o.level1);
      if (!s) { s = { stop: o.stop, level1: o.level1, company: o.company, postcode: o.postcode, n: 0, done: 0 }; stops.push(s); }
      s.n++; if (o.done) s.done++;
    }
    // in the likely order: the driven order was never recorded
    const pc = p => String(p || '').slice(0, 5), order = likelyRound(stops.map(s => pc(s.postcode)), Z), at = s => { const i = order.indexOf(pc(s.postcode)); return i < 0 ? 999 : i; };
    stops.sort((a, b) => at(a) - at(b) || String(a.stop).localeCompare(String(b.stop)));
    // consecutive stops at one customer (a hospital's departments) fold into one line
    const runs = [];
    for (const s of stops) {
      const last = runs[runs.length - 1];
      if (last && last.level1 === s.level1) { last.stops++; last.n += s.n; last.done += s.done; }
      else runs.push({ ...s, stops: 1 });
    }
    // the route on a map beside its stops: the same numbers, and the stop that took the van furthest
    // out of its way (its detour from components/routemap.js allocate, at postcode centres)
    const rd = { date: st.day, route, stops: runs.map(s => ({ ...s, postcode: pc(s.postcode), services: s.done || s.n, pt: Z[pc(s.postcode)] || null, mine: false })) };
    const placed = rd.stops.filter(s => s.pt).length;
    const a = placed ? allocate(R, rd) : null;
    const far = a ? rd.stops.reduce((b, s, i) => (s.detour || 0) > (b ? b.miles : 0) ? { i, miles: s.detour } : b, null) : null;
    const farOk = far && far.miles >= 2 ? far : null;
    const seen = new Set();
    let anyValue = false;
    const list = runs.map((s, i) => {
      const v = !seen.has(s.level1) ? value.get(st.day + '|' + s.level1) : null; seen.add(s.level1);
      if (v != null) anyValue = true;
      return `<div class="stop"><span class="n">${i + 1}</span><span><a href="#customer/${s.level1}" style="color:inherit;text-decoration:none;font-weight:600">${esc(titleCase(s.company))}</a> <span class="sub">${s.stops > 1 ? s.stops + ' stops, ' : ''}${esc(s.postcode || '')}</span></span>
        <span class="sub">${s.done} of ${s.n} done</span><span class="v">${v != null ? money0(v) : ''}</span></div>`;
    }).join('') + `<p class="sub" style="margin:var(--sp-2) 0 0">${anyValue ? 'Value is what that customer\'s work billed on the day, shown at its first stop.' : 'Work on this day is not billed yet: VCK prices it at the month\'s run.'}</p>`;
    if (!a) { box.innerHTML = list; return; }
    const unplaced = rd.stops.length - placed, fs = farOk && rd.stops[farOk.i];
    const say = `About ${Math.round(a.dayMiles)} ${a.road ? 'road ' : ''}miles yard to yard est.${fs ? `; ${esc(titleCase(fs.company))} at ${esc(fs.postcode)} took the van about ${Math.round(farOk.miles)} miles out of its way` : ''}${unplaced ? `; ${pl(unplaced, 'stop')} without a postcode centre left off the map` : ''}. The likely order and way by main roads between postcode centres: neither the driven order nor GPS was captured.`;
    box.innerHTML = `<div class="rm-grid"><div class="rm-wrap"></div><div>${list}</div></div><p class="sub" style="margin:var(--sp-2) 0 0">${say}</p>`;
    const draw = () => { const w = box.querySelector('.rm-wrap'); if (w) { w.innerHTML = mapSvg(rd, { width: Math.max(280, Math.min(900, w.clientWidth || 560)), base: basemapNow(), far: farOk, shading: bookShading(A, Z) }); playMap(w.querySelector('svg')); } };
    draw();
    if (!basemapNow()) loadBasemap().then(b => { if (b && box.isConnected && !box.hidden) draw(); });   // redrawn once the outline arrives
  }
  function drawWeek() {
    const monday = addDays(st.day, -((dow(st.day) + 6) % 7));
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
        g += `<span class="c ${d === st.day ? 'sel' : ''}" data-d="${d}" style="background:color-mix(in srgb, var(--heat) ${Fmt.pct(a)}, var(--surface))"><b>${r.services_done}</b><small>${pl(r.stops_done, 'stop')}</small></span>`;
      }
    }
    const wk = real.filter(r => dates.includes(r.date)).reduce((t, r) => t + r.services_done, 0);
    $('rt-week-h').textContent = `${Fmt.grouped(wk)} services done in the week of ${dshort(monday)}`;
    $('rt-week').innerHTML = g + '</div>';
  }
  function drawAhead() {
    $('rt-ahead-h').textContent = aheadDates.length ? `${Fmt.grouped(bookedAhead)} services booked over the next ${pl(aheadDates.length, 'day')}` : 'Nothing booked ahead';
    $('rt-ahead').innerHTML = aheadDates.map(d => {
      const rs = aheadRows.filter(r => r.date === d), tot = rs.reduce((t, r) => t + r.services, 0);
      return `<div class="stop" style="grid-template-columns: minmax(0,1fr) auto"><span><b>${dshort(d)}</b> <span class="sub">${rs.map(r => routeName(r.route)).join(', ')}</span></span><span class="v"><b>${tot}</b> <span class="sub">booked</span></span></div>`;
    }).join('') || '<p class="sub">Nothing booked beyond the latest day.</p>';
  }

  // ── the map ──
  const pts = (A.postcodes || []).filter(p => Z[p.postcode] && !p.billing_only).map(p => ({ ...p, pt: Z[p.postcode] }));
  const periodShading = () => {
    const rows = V.postcodes, by = new Map(rows.map(p => [p.postcode, p]));
    return { zones, shade: shadesOf(rows), label: c => { const p = by.get(c); return `${c}: ${Fmt.grouped(p.services)} services in ${V.period.inName}, ${pl(p.customers, 'customer')}`; } };
  };
  // each corridor once: wider and darker the more route days used it. With compare, the period before in grey under it, what grew green, what shrank amber.
  function corridors(F, W, H) {
    const pick = st.focus, count = s => pick ? s.r[pick] || 0 : s.n;
    const here = V.stretches.map(s => ({ a: s.a, b: s.b, n: count(s), all: s })), cmp = comparing();
    const before = cmp ? new Map(V.prevStretches.map(s => [key(s.a, s.b), { a: s.a, b: s.b, n: count(s) }])) : new Map();
    const hereKeys = new Set(here.map(s => key(s.a, s.b)));
    const top = Math.max(1, ...here.map(s => s.n), ...[...before.values()].map(s => s.n));
    const wide = n => Math.round((1.4 + 6 * Math.sqrt(n / top)) * 2) / 2, dark = n => Math.round((.4 + .6 * Math.sqrt(n / top)) * 20) / 20;
    const groups = new Map(), add = (cls, w, op, s) => { const k = `${cls}|${w}|${op}`; (groups.get(k) || groups.set(k, { cls, w, op, segs: [] }).get(k)).segs.push(s); };
    let under = '';
    if (cmp) {
      const g = new Map();
      for (const s of before.values()) if (s.n) { const w = wide(s.n) + 3; (g.get(w) || g.set(w, []).get(w)).push(s); }
      under = [...g].map(([w, segs]) => `<path class="ops-l prev" stroke-width="${w}" d="${chains(segs).map(l => lineD(l, F.P)).join('')}"/>`).join('');
    }
    for (const s of here) {
      if (!s.n) { if (pick) add('dim', 1.4, '', s); continue; }
      const b = cmp ? before.get(key(s.a, s.b)) : null, was = b ? b.n : 0;
      const state = pick ? 'pick' : !cmp ? '' : s.n >= was + 2 && s.n >= was * 1.15 ? 'grew' : was >= s.n + 2 && was >= s.n * 1.15 ? 'shrank' : '';
      add(state, wide(s.n), dark(s.n), s);
    }
    if (cmp) for (const [k, s] of before) if (s.n && !hereKeys.has(k)) add('shrank', wide(s.n), '', s);
    const lines = [...groups.values()].sort((a, b) => a.w - b.w).map(x => `<path class="ops-l ${x.cls}" stroke-width="${x.w}"${x.op !== '' && !x.cls ? ` style="opacity:${x.op}"` : ''} d="${chains(x.segs).map(l => lineD(l, F.P)).join('')}"/>`).join('');
    hits = here.filter(s => s.n || !pick).map(s => { const [x1, y1] = F.P(s.a), [x2, y2] = F.P(s.b), was = before.get(key(s.a, s.b)); return { x1, y1, x2, y2, s: s.all, was: cmp ? (was ? was.n : 0) : null }; });
    const [yx, yy] = F.P(YARD), id = maskId();
    const defs = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><circle class="ops-rv" cx="${yx.toFixed(1)}" cy="${yy.toFixed(1)}" r="${Math.hypot(W, H).toFixed(0)}"/></mask></defs>`;
    const stops = V.postcodes.map(p => { const [x, y] = F.P(Z[p.postcode]); if (!F.inside([x, y])) return ''; return `<circle class="ops-stop" style="--d:${Math.min(1400, Math.round(miles(YARD, Z[p.postcode]) * 40))}ms" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"><title>${esc(p.postcode)}: ${Fmt.grouped(p.services)} services</title></circle>`; }).join('');
    return { defs, g: under + `<g mask="url(#${id})">${lines}</g>` + (pick ? '' : stops) };
  }
  function dayLayer(F, W, H) {
    const rows = real.filter(r => r.date === st.day && r.services_done > 0);
    const thinSet = new Set(rows.filter(r => norm[r.route] && r.services_done < THIN * norm[r.route].done).map(r => r.route));
    const lines = [], routes = [];
    let over = '';
    const routePath = route => {
      const os = A.orders.filter(o => o.date === st.day && o.route === route && o.postcode), list = os.length ? os.map(o => o.postcode) : String((real.find(r => r.date === st.day && r.route === route) || {}).postcode_list || '').split(/\s+/);
      return likelyRound(list, Z);
    };
    rows.slice().sort((a, b) => (a.route === hl) - (b.route === hl)).forEach(r => {
      const geo = routePath(r.route).map(p => Z[p]);
      if (!geo.length) return;
      const cls = r.route === hl ? 'on' : thinSet.has(r.route) ? 'thin' : hl ? 'dim' : '', n = lines.length;
      // yard → stops → yard, each leg the likely way along the main roads; how far along each stop falls, for its pulse
      const way = [YARD, ...geo, YARD], line = [F.P(YARD)], ats = [];
      let run = 0;
      for (let i = 1; i < way.length; i++) { const rp = roadPath(way[i - 1], way[i]); for (const q of rp ? rp.pts.slice(1) : [way[i]]) { const xy = F.P(q); run += seg(line[line.length - 1], xy); line.push(xy); } if (i < way.length - 1) ats.push(run); }
      lines.push(line);
      routes.push(routeLayer(n, line, cls, `${routeName(r.route)}: ${r.services_done} services, ${r.stops_done} stops`));
      over += geo.map((q, i) => { const [x, y] = F.P(q); return `<circle class="hm-stop ${cls}" data-n="${n}" data-at="${(run ? ats[i] / run : 0).toFixed(4)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.route === hl ? 4.5 : 3.5}"/>`; }).join('');
    });
    const id = maskId(), stops = rows.reduce((t, r) => t + r.stops_done, 0), pcs = new Set(rows.flatMap(r => routePath(r.route)));
    $('rt-map-t').textContent = `${dlabel(st.day)}: ${pl(rows.length, 'route')}, ${pl(stops, 'stop')} across ${pl(pcs.size, 'postcode')}`;
    $('rt-map-s').textContent = hl ? `${routeName(hl)} in green. Tap it again to clear.` : thinSet.size ? `${[...thinSet].map(routeName).join(', ')} ran thin. Tap a route to follow it.` : 'Tap a route to follow it.';
    $('rt-map-key').innerHTML = `<span><i class="k line"></i>the likely way along the main roads</span><span><i class="k thinline"></i>thin against its own norm</span>${zoneKey()}`;
    $('op-side').innerHTML = `<h3>Out on the day</h3><ul class="ops-list">${rows.map(r => { const n = norm[r.route]; return `<li><button type="button" data-hl="${esc(r.route)}" class="${r.route === hl ? 'on' : ''}"><b>${esc(routeName(r.route))}</b><span>${r.services_done}</span><small>${n ? `normal ${Math.round(n.done)}` : ''}${thinSet.has(r.route) ? ', thin' : ''}</small></button></li>`; }).join('')}</ul>`;
    return { defs: maskFor(id, W, H, lines), g: `<g mask="url(#${id})">${routes.join('')}</g>` + over };
  }
  function drawSideRoutes() {
    const focus = st.focus ? '<p><button type="button" class="ops-clear" data-focus="">Show every route</button></p>' : '';
    const row = (route, right, small) => `<li><button type="button" data-focus="${esc(route)}" class="${st.focus === route ? 'on' : ''}"><b>${esc(routeName(route))}</b><span>${right}</span><small>${small}</small></button></li>`;
    $('op-side').innerHTML = V.changes.length
      ? `<h3>What changed against ${esc(V.period.prevName)}</h3><ul class="ops-list">${V.changes.map(c => row(c.route, `<span class="delta ${c.d > 0 ? 'up' : 'down'}">${c.d > 0 ? '+' : '−'}${Math.abs(c.d)}</span>`, `${pl(c.now, 'route day')}, from ${Fmt.grouped(c.before)}`)).join('')}</ul>${focus}`
      : `<h3>Most route days</h3><ul class="ops-list">${V.routes.slice().sort((a, b) => b.routeDays - a.routeDays).slice(0, 6).map(r => row(r.route, Fmt.grouped(r.routeDays), `${Fmt.grouped(r.services)} services`)).join('')}</ul>${focus}`;
  }
  function drawMap(animate = false) {
    const el = $('rt-map'); if (!el) return;
    $('op-tip').hidden = true; hits = [];
    if (!pts.length) { el.innerHTML = '<div class="pending">The map is not available: the postcode centres did not load.</div>'; return; }
    main.querySelectorAll('#rt-layer button').forEach(b => { b.classList.toggle('on', b.dataset.l === st.lens); b.setAttribute('aria-pressed', String(b.dataset.l === st.lens)); });
    const W = Math.max(300, Math.min(1100, el.clientWidth || 700)), H = Math.round(W < 500 ? W * 1.0 : W * 0.66);
    const F = areaFrame(pts.map(p => p.pt), W, H);
    let g = landLayer(base, F), defs = '';
    const isDay = st.p === 'day', costs = V.costs;
    if (st.lens === 'routes' && isDay) {
      g += districtLayer(bookShading(A, Z), F.P);
      const L = dayLayer(F, W, H); defs = L.defs; g += L.g;
    } else if (st.lens === 'routes') {
      g += districtLayer(periodShading(), F.P);
      const L = corridors(F, W, H); defs = L.defs; g += L.g;
      const name = V.period.inName, Name = V.period.name;
      $('rt-map-t').textContent = st.focus ? `${routeName(st.focus)} in ${name}` : 'Where the trucks went';
      $('rt-map-s').textContent = `${Name}. Thicker, darker lines are the corridors driven most, the likely way along the main roads: the driven order was not recorded.`;
      $('rt-map-key').innerHTML = (comparing() ? `<span><i class="k gl"></i>more route days than ${esc(V.period.prevName)}</span><span><i class="k am"></i>fewer</span><span><i class="k gr"></i>${esc(V.period.prevName)}</span>` : '<span><i class="k few"></i>a few route days</span><span><i class="k thick"></i>many</span>') + zoneKey(`in ${name}`);
      drawSideRoutes();
    } else if (st.lens === 'add') {
      g += districtLayer(bookShading(A, Z), F.P);
      const save = densityByPostcode(R, A, Z, { top: 8 }).rows;
      save.forEach((r, i) => { const [x, y] = F.P(Z[r.postcode]); g += `<g class="h2-best" transform="translate(${Math.max(10, Math.min(W - 10, x)).toFixed(1)},${Math.max(10, Math.min(H - 10, y)).toFixed(1)})"><circle r="10"/><text y="4" text-anchor="middle">${i + 1}</text><title>${esc(r.postcode)}${costsVisible() ? `: one more customer saves about ${money0(r.saving)} a year est.` : ''}</title></g>`; });
      $('rt-map-t').textContent = costsVisible() ? `One more customer in these ${save.length} postcodes saves ${moneyK(save.reduce((t, r) => t + r.saving, 0))} a year est.` : `${save.length} postcodes where a second stop would share the most trips`;
      $('rt-map-s').textContent = 'Trips R4 already makes, twelve months.';
      $('rt-map-key').innerHTML = '<span><i class="k best"></i>' + (costsVisible() ? 'one more customer saves most' : 'a second stop would share the most trips') + '</span>' + zoneKey();
      $('op-side').innerHTML = `<h3>Add customers here first</h3><ol class="ops-plain">${save.map((r, i) => `<li><b>${i + 1}. ${esc(r.postcode)}</b><span>${Math.round(r.miles)} mi</span><small>${Fmt.grouped(r.visits)} visits a year already pass through</small></li>`).join('')}</ol>`;
    } else {
      g += districtLayer(bookShading(A, Z), F.P);
      const list = V.costly, size = a => costs ? a.cost : a.visits, top = Math.max(1, ...list.map(size));
      list.slice().sort((a, b) => size(b) - size(a)).forEach(a => {
        const [x, y] = F.P(Z[a.postcode]), i = list.indexOf(a) + 1, r = 8 + 14 * Math.sqrt(size(a) / top), cx = Math.max(r, Math.min(W - r, x)), cy = Math.max(r, Math.min(H - r, y));
        g += `<g class="ops-mk ${costs && a.band.cls === 'r' ? 'thin' : ''} ${costs ? 'tap' : ''}"${costs ? ` data-area="${esc(a.postcode)}" role="button" tabindex="0" aria-label="${esc(a.postcode)}: open"` : ''}><circle style="--d:${i * 50}ms" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/><text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}">${i}</text><title>${esc(a.postcode)}${costs ? `: ${money0(a.cost)} of route time a year est.` : `: ${Fmt.grouped(a.visits)} visits a year`}</title></g>`;
      });
      $('rt-map-t').textContent = costs ? `${list.length} far areas cost ${moneyK(list.reduce((t, a) => t + a.cost, 0))} a year in route time est.` : `${list.length} far areas visited most`;
      $('rt-map-s').textContent = `${FAR_MILES} miles or more from the yard, ${MIN_VISITS} or more visits, twelve months.${costs ? ' Tap one for the options.' : ''}`;
      $('rt-map-key').innerHTML = `<span>${costs ? 'Sized by route cost a year; red is thin' : 'Sized by visits a year'}</span>` + zoneKey();
      $('op-side').innerHTML = costs
        ? `<h3>Highest route cost</h3><ul class="ops-list">${list.slice(0, 6).map((a, i) => `<li><button type="button" data-area="${esc(a.postcode)}"><b>${i + 1}. ${esc(a.postcode)}</b><span>${money0(a.cost)}</span><small>${esc(titleCase(a.who[0].name))}, ${Math.round(a.miles)} mi</small></button></li>`).join('')}</ul>`
        : `<h3>Most visits</h3><ol class="ops-plain">${list.slice(0, 6).map((a, i) => `<li><b>${i + 1}. ${esc(a.postcode)}</b><span>${Fmt.grouped(a.visits)}</span><small>${esc(titleCase(a.who[0].name))}, ${Math.round(a.miles)} mi</small></li>`).join('')}</ol>`;
    }
    g += yardMark(F) + scaleBar(F);
    const label = st.lens === 'routes' ? 'Map of the routes from the yard' : st.lens === 'add' ? 'Map of where to add customers' : 'Map of far areas';
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="h2-map rt-map hm-map mm ${animate && !(isDay && st.lens === 'routes') ? 'ops-anim' : ''}" aria-label="${label}">${defs}${g}</svg>`;
    if (st.lens === 'routes' && isDay) { const k = st.lens + st.day; playMap(el.querySelector('svg'), { reveal: played !== k }); played = k; }
  }

  // ── routes in the period ──
  function drawRoutes() {
    const p = V.period, cmp = comparing(), rows = V.routes, top = Math.max(1, ...rows.map(r => r.perDay));
    $('op-routes-h').textContent = `Routes in ${p.inName}`;
    const pick = r => { st.focus = st.focus === r.route ? null : r.route; st.lens = 'routes'; drawMap(); keepLink(); $('rt-map').scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };
    dataTable($('op-routes'), { key: 'oproutes', ns: 'r_', noun: 'routes', who: whoAmI(), rows, plain: true, opens: true, onRow: pick,
      cols: [
        { k: 'route', l: 'Route', name: true, text: true, get: r => routeName(r.route), fmt: r => `<b>${esc(routeName(r.route))}</b>${r.driver ? ` <small>usually ${esc(r.driver)}</small>` : ''}` },
        { k: 'perDay', l: 'Services per route day', short: 'A route day', def: true, get: r => r.perDay, total: rs => { const d = rs.reduce((t, r) => t + r.routeDays, 0); return d ? Fmt.fixed(rs.reduce((t, r) => t + r.services, 0) / d, 1) : ''; }, fmt: r => `<span class="ops-bar" aria-hidden="true"><i style="width:${(r.perDay / top * 100).toFixed(1)}%"></i></span>${Fmt.fixed(r.perDay, 1)}` },
        { k: 'services', l: 'Services', def: true, sorted: true, get: r => r.services, total: 'sum', fmt: r => n0(r.services) },
        { k: 'routeDays', l: 'Route days', def: true, get: r => r.routeDays, total: 'sum', fmt: r => n0(r.routeDays) },
        ...(cmp ? [{ k: 'chg', l: `On ${p.prevName}`, def: true, get: r => r.prev ? r.routeDays - r.prev.routeDays : null, fmt: r => { if (!r.prev) return 'new'; const d = r.routeDays - r.prev.routeDays; return d ? `${d > 0 ? '+' : '−'}${Math.abs(d)}` : 'level'; } }] : []),
        { k: 'stops', l: 'Stops', def: true, get: r => r.stops, total: 'sum', fmt: r => n0(r.stops) },
      ] });
  }

  // ── is the work getting denser? ──
  function drawDense() {
    const D = V.density, el = $('op-dense'), rows = D.rows;
    if (!rows.length) { el.innerHTML = '<div class="h2-ch"><h2>Is the work getting denser?</h2></div><div class="pending">No route days in the history yet.</div>'; return; }
    const span = D.from ? `${mon(D.from)} to ${mon(D.to)}` : '', versus = `${Fmt.fixed(D.now || 0, 1)} services a route day from ${span}, against ${Fmt.fixed(D.then || 0, 1)}`;
    const title = D.change == null ? 'Is the work getting denser?' : D.change <= -.01 ? `The work is less dense than a year ago: ${versus}` : D.change >= .01 ? `The work is denser than a year ago: ${versus}` : `The work is about as dense as a year ago: ${versus}`;
    const a = barsSvg(rows.map(r => ({ m: r.month, v: r.perDay, prev: r.before ? r.before.perDay : null })), { height: 150, fmt: v => Fmt.fixed(v, 1), tip: r => `${Fmt.fixed(r.v, 1)} a route day${r.prev != null ? `, ${Fmt.fixed(r.prev, 1)} a year before` : ''}`, label: 'Services per route day by month, with the same month a year before' });
    const b = V.costs ? barsSvg(rows.map(r => ({ m: r.month, v: r.cost, prev: r.before ? r.before.cost : null })), { height: 150, est: true, fmt: v => Fmt.money(v, { dp: 0 }), tip: r => `${Fmt.money(r.v, { dp: 2 })} a service est.${r.prev != null ? `, ${Fmt.money(r.prev, { dp: 2 })} a year before` : ''}`, label: 'Route cost a service by month, with the same month a year before' }) : '';
    el.innerHTML = `<div class="h2-ch"><h2>${esc(title)}</h2><small>Twelve months by month. The mark on each bar is the same month a year before; history starts in January 2025.</small></div>
      <div class="ops-charts"><div><h3>Services per route day</h3>${a}</div>${b ? `<div><h3>Route cost a service, est.</h3>${b}</div>` : ''}</div>
      <div class="src">Veri-Shred done orders.${b ? ' Route days at this year\'s one route-day cost: until the monthly GL is loaded, the second chart is the first turned over, not a second measure.' : ''}</div>`;
  }

  // ── far areas ──
  function drawCostly() {
    const el = $('op-costly'), list = V.costly, costs = V.costs;
    el.innerHTML = `<div class="h2-ch"><h2>${costs ? `Costly to serve: ${list.filter(a => a.band.cls === 'r').length} of ${list.length} far areas are thin` : `${list.length} far areas visited most`}</h2><small>${costs ? 'Highest route cost first. Tap one for the options.' : 'Twelve months, most visits first.'}</small></div><div id="op-costly-t"></div>
      <div class="src">${costs ? 'Route cost is each area\'s share of its real route days, by minutes, est. Revenue is bin and ITAD work at the site, shared across a sub-account\'s postcodes by services, est. The margin takes off route cost and plant. A move is sized on its own; they are never added. ' : ''}Twelve months of Veri-Shred done orders. <a class="how-link chev" href="#how">How it's calculated</a></div>`;
    const area = { k: 'postcode', l: 'Area', name: true, text: true, get: a => a.postcode, fmt: a => `<b>${esc(a.postcode)}</b> <small>${esc(titleCase(a.who[0].name))}${a.who.length > 1 ? ` and ${a.who.length - 1} more` : ''}</small>` };
    const mi = { k: 'miles', l: 'Miles', def: true, get: a => a.miles, fmt: a => Fmt.fixed(a.miles, 0) }, vis = { k: 'visits', l: 'Visits', def: true, get: a => a.visits, total: 'sum', fmt: a => n0(a.visits) };
    const o = { key: 'opcostly', ns: 'c_', noun: 'areas', who: whoAmI(), rows: list, plain: true, search: a => a.postcode + ' ' + a.who.map(w => w.name).join(' '), placeholder: 'Find a postcode or customer' };
    if (!costs) { dataTable(el.querySelector('#op-costly-t'), { ...o, cols: [area, mi, { ...vis, sorted: true }, { k: 'services', l: 'Services', def: true, get: a => a.services, total: 'sum', fmt: a => n0(a.services) }] }); return; }
    dataTable(el.querySelector('#op-costly-t'), { ...o, opens: true, onRow: openArea, cols: [area, mi, vis,
      { k: 'perVisit', l: 'Cost a visit, est.', short: 'Cost', def: true, get: a => a.perVisit, fmt: a => money0(a.perVisit) },
      { k: 'revenuePerVisit', l: 'Revenue a visit, est.', short: 'Revenue', def: true, get: a => a.revenuePerVisit, fmt: a => money0(a.revenuePerVisit) },
      { k: 'margin', l: 'Margin', def: true, get: a => a.margin, fmt: a => ragLabel(R, a.margin) },
      { k: 'cost', l: 'Route time a year, est.', short: 'A year', def: true, sorted: true, get: a => a.cost, total: 'sum', totalFmt: v => money0(v), fmt: a => money0(a.cost) },
      { k: 'best', l: 'Best move', def: true, text: true, get: a => a.best ? a.best.title : 'No change needed', fmt: a => a.best ? esc(a.best.title) : '<span class="sub">No change needed</span>' },
      { k: 'saving', l: 'Saving a year, est.', short: 'Saving', def: true, get: a => a.best ? a.best.saving : 0, fmt: a => a.best ? money0(a.best.saving) : '—' },
    ] });
  }
  function openArea(a) {
    const drive = a.travel, site = a.onsite, all = drive + site || 1, lead = a.who[0], best = a.best || a.options[0];
    const opt = a.options.map((o, i) => `<li class="${a.best && i === 0 ? 'best' : ''}"><span><small>${a.best && i === 0 ? 'Best move' : 'Option'}</small><b>${esc(o.title)}</b></span><em>${money0(o.saving)}</em><p>${esc(o.say)}</p></li>`).join('');
    openPop({ title: `${a.postcode}: ${titleCase(lead.name)}`, sub: `${Fmt.fixed(a.miles, 0)} miles from the yard, ${pl(a.visits, 'visit')} in twelve months`, size: 'mid', html: `
      <div id="op-d-pts"></div>
      <div class="md-tot"><div><small>Cost a visit, est.</small><b>${money0(a.perVisit)}</b></div><div><small>Revenue a visit, est.</small><b>${money0(a.revenuePerVisit)}</b></div><div><small>Route time a year, est.</small><b>${money0(a.cost)}</b></div><div><small>Margin, est.</small><b>${a.margin == null ? '—' : signedPc(a.margin)}</b></div></div>
      <div class="ops-dsec"><h3>Where a visit's route cost goes, est.</h3><div class="ops-split" role="img" aria-label="Driving ${esc(money0(drive / a.visits))} a visit, on site ${esc(money0(site / a.visits))} a visit"><i class="drive" style="flex:${(drive / all).toFixed(3)} 0 0"></i><i class="site" style="flex:${(site / all).toFixed(3)} 0 0"></i></div><div class="ops-splitkey"><span>Driving ${money0(drive / a.visits)}</span><span>On site ${money0(site / a.visits)}</span></div></div>
      <div class="ops-dsec"><h3>${a.best ? 'Ways to improve it, a year est.' : `It is ${esc(a.band.word.toLowerCase())}: nothing needs to change. If it did, a year est.`}</h3><ul class="ops-opts">${opt}</ul></div>
      <div class="ops-dsec"><h3>Next step</h3><div class="ops-send" id="op-send"><label>Owner <select id="op-owner">${OWNERS.map(o => `<option${o === whoAmI() ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label><button type="button" class="pq-btn" id="op-go">Send to Opportunities</button></div></div>` });
    const body = document.querySelector('.pop .pop-b');
    drawPoints(body.querySelector('#op-d-pts'), [
      { key: 'cost', tone: a.band.cls, lead: `Costs ${money0(a.perVisit)} a visit est.,`, rest: `${Fmt.pct(drive / all)} of it the drive: ${money0(a.cost)} of route time a year.` },
      { key: 'earn', tone: a.band.cls, lead: `Earns ${money0(a.revenuePerVisit)} a visit est.,`, rest: `so with plant the margin is ${a.margin == null ? 'not known' : signedPc(a.margin)}: ${a.band.word.toLowerCase()}.` },
      a.best ? { key: 'move', tone: 'a', lead: `Best move: ${best.title.toLowerCase()},`, rest: `about ${money0(best.saving)} a year est.` } : { key: 'move', tone: 'g', lead: 'No change needed.', rest: best ? `If it ever is, ${best.title.toLowerCase()} is the largest, about ${money0(best.saving)} a year est.` : '' },
    ]);
    const k = `route:${lead.level1}:${a.postcode}`, send = body.querySelector('#op-send');
    const sent = o => { send.innerHTML = `<span class="ops-sent">With ${esc(o)} on Opportunities.</span> <a class="how-link chev" href="#opportunities">Open Opportunities</a>`; };
    fetch('/api/sales/opportunities', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(j => { const s = j && j.data && j.data[k]; if (s && send.isConnected) sent(s.owner || 'no owner'); }).catch(() => {});
    if (!best) { send.innerHTML = ''; return; }
    body.querySelector('#op-go').addEventListener('click', async ev => {
      const owner = body.querySelector('#op-owner').value;
      ev.target.disabled = true;
      try {
        const r = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, level1: lead.level1, status: 'open', owner, value: Math.round(best.saving), note: `${best.title} at ${a.postcode}: about ${money0(best.saving)} a year est., ${pl(a.visits, 'visit')} a year at ${money0(a.perVisit)} of route cost.` }) });
        if (!r.ok) throw new Error(String(r.status));
        sent(owner);
      } catch (e) { ev.target.disabled = false; const m = document.createElement('span'); m.className = 'ops-sent'; m.textContent = 'That did not save. Try again in a moment.'; send.appendChild(m); }
    });
  }

  // ── distance ──
  function drawBands() {
    const el = $('op-bands'), { now, bands, period: p } = V;
    if (!now.located) { el.innerHTML = `<div class="h2-ch"><h2>Distance from the yard</h2></div><div class="pending">No services with a postcode in ${esc(p.inName)}.</div>`; return; }
    el.innerHTML = `<div class="h2-ch"><h2>${Fmt.pct(now.within10)} of the work is within ten miles of the yard</h2><small>Done services, ${esc(p.name)}, by distance from 1301 W 35th St as the crow flies.</small></div>
      <div class="bands">${bands.map(b => `<span>${esc(b.l)}</span><span class="bar"><i style="width:${(b.share * 100).toFixed(1)}%"></i></span><span class="v">${Fmt.grouped(b.services)}</span><span class="v sub">${Fmt.pct(b.share)}</span>`).join('')}</div>
      <div class="src">Veri-Shred done orders. ${Fmt.grouped(now.services - now.located)} of ${Fmt.grouped(now.services)} services have no postcode we can place.</div>`;
  }

  function drawControls() {
    $('op-period').innerHTML = V.tabs.map(t => `<button type="button" data-p="${t.key}" aria-pressed="${t.key === st.p}">${esc(t.label)}</button>`).join('');
    const can = canCompare() && st.p !== 'day', box = $('op-cmp'), lab = $('op-cmpl');
    box.disabled = !can; box.checked = can && st.cmp;
    lab.classList.toggle('off', !can);
    lab.title = can ? '' : st.p === 'day' ? 'The day compares each route with its own norm' : V.period.why || '';
    $('op-day').hidden = st.p !== 'day';
    $('op-period-view').hidden = st.p === 'day';
    $('op-day-view').hidden = st.p !== 'day';
  }
  function drawAll(animate) {
    drawControls(); drawKpis();
    if (st.p === 'day') drawDay(); else drawRoutes();
    drawMap(animate); drawDense(); drawCostly(); drawBands();
    keepLink();
  }
  async function load(animate = true) {
    const mine = ++token;
    root.setAttribute('aria-busy', 'true');
    let view;
    try { view = await getJson(`view/operations?p=${st.p}${st.p === 'day' || st.p === 'week' ? `&date=${st.day}` : ''}`); }
    catch (e) {
      if (e.status === 401) { location.href = '/login'; return; }
      if (mine !== token) return;
      root.removeAttribute('aria-busy');
      $('op-kpis').innerHTML = '<div class="h2-card pending" style="grid-column:1 / -1">These figures did not load. Try again in a minute.</div>';
      return;
    }
    if (mine !== token) return;
    V = view; root.classList.remove('play');
    root.removeAttribute('aria-busy');
    drawAll(animate);
  }

  $('op-period').addEventListener('click', ev => { const b = ev.target.closest('button[data-p]'); if (!b || b.dataset.p === st.p) return; st.p = b.dataset.p; st.focus = null; hl = null; load(); });
  $('op-cmp').addEventListener('change', ev => { st.cmp = ev.target.checked; drawMap(true); drawRoutes(); keepLink(); });
  $('rt-layer').addEventListener('click', ev => { const b = ev.target.closest('button[data-l]'); if (!b) return; st.lens = b.dataset.l; drawMap(true); keepLink(); });
  $('rt-prev').addEventListener('click', () => { const i = doneDays.indexOf(st.day); if (i > 0) { st.day = doneDays[i - 1]; hl = null; load(); } });
  $('rt-next').addEventListener('click', () => { const i = doneDays.indexOf(st.day); if (i < doneDays.length - 1) { st.day = doneDays[i + 1]; hl = null; load(); } });
  $('rt-week').addEventListener('click', ev => { const c = ev.target.closest('.c[data-d]'); if (c) { st.day = c.dataset.d; hl = null; load(); } });
  const follow = ev => {
    if (ev.target.closest('a')) return;
    const row = ev.target.closest('.rrow'); if (!row) return;
    const box = main.querySelector(`.stops[data-for="${CSS.escape(row.dataset.route)}"]`);
    const open = !box.hidden;
    main.querySelectorAll('.stops').forEach(b => { b.hidden = true; b.innerHTML = ''; });
    main.querySelectorAll('.rrow').forEach(r => { r.classList.remove('open'); r.setAttribute('aria-expanded', 'false'); });
    hl = open ? null : row.dataset.route; if (st.lens === 'routes') drawMap();
    if (open) return;
    row.classList.add('open'); row.setAttribute('aria-expanded', 'true'); box.hidden = false; drawStops(row.dataset.route, box);
  };
  $('rt-routes').addEventListener('click', follow);
  $('rt-routes').addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList.contains('rrow')) { ev.preventDefault(); follow(ev); } });
  // the side list: pick a route out, or open a far area
  const openOf = t => { const n = t.closest('[data-area]'); if (n) { const a = V.costly.find(x => x.postcode === n.dataset.area); if (a) { openArea(a); return true; } } return false; };
  $('op-side').addEventListener('click', ev => {
    if (openOf(ev.target)) return;
    const f = ev.target.closest('[data-focus]'); if (f) { st.focus = f.dataset.focus && f.dataset.focus !== st.focus ? f.dataset.focus : null; drawMap(); return; }
    const h = ev.target.closest('[data-hl]'); if (h) { const row = main.querySelector(`.rrow[data-route="${CSS.escape(h.dataset.hl)}"]`); if (row) row.click(); }
  });
  // the map: hover says what a line is, a tap picks its busiest route, a far area opens
  const mapEl = $('rt-map'), tip = $('op-tip');
  const hitAt = ev => {
    const svg = mapEl.querySelector('svg'); if (!svg || !hits.length) return null;
    const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (ev.clientX - box.left) * vb.width / box.width, y = (ev.clientY - box.top) * vb.height / box.height;
    let best = null, bd = 8;
    for (const h of hits) { const d = near(x, y, h); if (d < bd) { bd = d; best = h; } }
    return best;
  };
  mapEl.addEventListener('pointermove', ev => {
    const h = hitAt(ev);
    if (!h) { tip.hidden = true; return; }
    const by = Object.entries(h.s.r).sort((a, b) => b[1] - a[1]);
    tip.innerHTML = `<b>${pl(h.s.n, 'route day')} in ${esc(V.period.inName)}</b><span>${by.slice(0, 3).map(([r, n]) => `${esc(routeName(r))} ${Fmt.grouped(n)}`).join(', ')}</span>${h.was != null ? `<span>${Fmt.grouped(h.was)} in ${esc(V.period.prevName)}</span>` : ''}`;
    const r = mapEl.parentElement.getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = Math.max(90, Math.min(r.width - 90, ev.clientX - r.left)) + 'px';
    tip.style.top = (ev.clientY - r.top + 14) + 'px';
  });
  mapEl.addEventListener('pointerleave', () => { tip.hidden = true; });
  mapEl.addEventListener('click', ev => {
    if (openOf(ev.target)) return;
    const h = hitAt(ev); if (!h) return;
    const top = Object.entries(h.s.r).sort((a, b) => b[1] - a[1])[0][0];
    st.focus = st.focus === top ? null : top; drawMap();
  });
  mapEl.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && openOf(ev.target)) ev.preventDefault(); });

  drawAhead();
  await load(true);
  document.documentElement.classList.add('js');
  if (firstPlay('r4-ops-played')) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }
}
