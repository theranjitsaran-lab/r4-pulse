// One job's route that day: who else the driver served, in what order, and what this stop's share of
// the day cost, with what would have made it cheaper. Stops sit at US Census postcode centres
// (public/data/zcta.json) joined by straight lines: GPS was never captured (data rule 8).
//
// The day's cost is one route day from the cost model (model/rates.js), split two ways:
//   travel (the travel share, the one assumption) by each stop's detour: the miles the route would
//     save without it, yard to yard through the stops in their order; stops at the same postcode in
//     a row are one place, and share its detour by services;
//   time on site equally between the customers visited (a visit is one customer, one route, one day),
//     each customer's share split between its stops by services.
// So the stops' shares add up to the route day exactly.
export const YARD = [41.8307, -87.6573];   // 1301 W 35th St
export const NEAR_MILES = 2, NEAR_DAYS = 3;

export const miles = (a, b) => { const r = Math.PI / 180, R = 3958.8, dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dl / 2) ** 2)); };
const pc5 = p => p ? String(p).slice(0, 5) : null;
const dayAdd = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// The account's route on a date and every stop on it: from the drill's route lists when the snapshot
// has them, else from the route orders (about three weeks). The route with most of the account's
// services that day, if it was on more than one.
export function routeDay({ routes, orders }, date, level1, Z) {
  let rows = [], source = 'drill';
  if (routes && routes.length) rows = routes.filter(r => r.date === date);
  if (!rows.length && orders) {
    source = 'orders';
    const by = new Map();
    for (const o of orders) {
      if (o.date !== date || !o.done) continue;
      const k = o.route + '|' + (o.stop || o.level1);
      const x = by.get(k) || { date, route: o.route, stop: o.stop, seq: o.seq, level1: o.level1, company: o.company, postcode: o.postcode, services: 0, pounds: 0 };
      x.services++; x.pounds += o.weight || 0; if (o.seq != null && (x.seq == null || o.seq < x.seq)) x.seq = o.seq;
      by.set(k, x);
    }
    rows = [...by.values()];
  }
  const mine = new Map();
  for (const r of rows) if (r.level1 === level1) mine.set(r.route, (mine.get(r.route) || 0) + r.services);
  if (!mine.size) return null;
  const route = [...mine.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const stops = rows.filter(r => r.route === route)
    .sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9) || String(a.stop).localeCompare(String(b.stop)))
    .map(r => ({ ...r, postcode: pc5(r.postcode), pt: Z[pc5(r.postcode)] || null, mine: r.level1 === level1 }));
  return { date, route, stops, source, routes: mine.size };
}

// ── the roads: the likely way between two points along the main roads (public/data/roadnet.json, built
// by scripts/build_roadnet.js from the US Census). Each point joins the nearest main road anywhere along
// it (within two miles, the hop counted as a straight line), then A* finds the fewest road miles. A leg
// stays a straight line when a point is further from any main road, or the road way is implausible
// (over three times the straight line and two miles more). Without the network (a test, a failed load)
// every leg is the straight line, as before.
export const SNAP_MILES = 2;
let NET = null, NET_P = null;
export function setRoadnet(raw) {
  if (!raw) { NET = null; return null; }   // a test can unload it
  const N = raw.n.length / 2, lat = new Float64Array(N), lon = new Float64Array(N);
  for (let i = 0; i < N; i++) { lat[i] = raw.n[2 * i] / 1e4; lon[i] = raw.n[2 * i + 1] / 1e4; }
  const adj = Array.from({ length: N }, () => []);
  raw.e.forEach((e, k) => { adj[e[0]].push(k); adj[e[1]].push(k); });
  NET = { N, lat, lon, adj, e: raw.e, cache: new Map(), grid: new Map(), cell: 0.03 };
  // every point of every road, with how far along its segment it sits (scaled to the segment's length)
  raw.e.forEach((e, k) => {
    const pts = edgePts(k, e[0]); let c = 0; const cum = [0];
    for (let j = 1; j < pts.length; j++) { c += miles(pts[j - 1], pts[j]); cum.push(c); }
    const f = c > 0 ? (e[2] / 1000) / c : 0;
    pts.forEach((p, j) => { const gk = Math.floor(p[0] / NET.cell) + ',' + Math.floor(p[1] / NET.cell); if (!NET.grid.has(gk)) NET.grid.set(gk, []); NET.grid.get(gk).push([k, j, cum[j] * f, p]); });
  });
  return NET;
}
export function loadRoadnet() {
  if (!NET_P) NET_P = fetch('/data/roadnet.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(j => (j ? setRoadnet(j) : null));
  return NET_P;
}
export const roadnetNow = () => NET;

// a segment's points from one end to the other, its bends decoded from deltas
function edgePts(k, from) {
  const e = NET.e[k], pts = [[NET.lat[e[0]], NET.lon[e[0]]]];
  let y = Math.round(NET.lat[e[0]] * 1e4), x = Math.round(NET.lon[e[0]] * 1e4);
  for (let j = 3; j < e.length; j += 2) { y += e[j]; x += e[j + 1]; pts.push([y / 1e4, x / 1e4]); }
  pts.push([NET.lat[e[1]], NET.lon[e[1]]]);
  return from === e[0] ? pts : pts.reverse();
}
// the nearest point on any main road: { k (segment), j (its point), along (miles from the segment's start), m, p }
function snap(p) {
  const g = NET, gy = Math.floor(p[0] / g.cell), gx = Math.floor(p[1] / g.cell);
  let best = null;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const [k, j, along, q] of g.grid.get((gy + dy) + ',' + (gx + dx)) || []) {
    const m = miles(p, q);
    if (m <= SNAP_MILES && (!best || m < best.m)) best = { k, j, along, m, p: q };
  }
  return best;
}
// { miles, pts } along the roads from a to b, or null for a straight leg
export function roadPath(a, b) {
  if (!NET || !a || !b) return null;
  const key = a.join() + '|' + b.join();
  if (NET.cache.has(key)) return NET.cache.get(key);
  let out = null;
  const g = NET, sa = snap(a), sb = snap(b);
  if (sa && sb) {
    const lenOf = k => g.e[k][2] / 1000, ends = k => [g.e[k][0], g.e[k][1]];
    if (sa.k === sb.k) {   // both on one stretch of road: along it
      const pts = edgePts(sa.k, g.e[sa.k][0]), [lo, hi] = sa.j <= sb.j ? [sa.j, sb.j] : [sb.j, sa.j];
      const mid = pts.slice(lo, hi + 1); if (sa.j > sb.j) mid.reverse();
      out = { miles: sa.m + Math.abs(sb.along - sa.along) + sb.m, pts: [a, ...mid, b] };
    } else {
      // from a's point, to either end of its segment; A* to either end of b's segment, then along it to b's point
      const [a0, a1] = ends(sa.k), [b0, b1] = ends(sb.k), tgt = new Map([[b0, sb.along], [b1, lenOf(sb.k) - sb.along]]);
      const dist = new Map(), via = new Map(), done = new Set(), heap = [];
      const h = i => miles([g.lat[i], g.lon[i]], sb.p);
      const push = it => { heap.push(it); let c = heap.length - 1; while (c) { const q = (c - 1) >> 1; if (heap[q][0] <= heap[c][0]) break; [heap[q], heap[c]] = [heap[c], heap[q]]; c = q; } };
      const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
      for (const [n, d] of [[a0, sa.along], [a1, lenOf(sa.k) - sa.along]]) if (d < (dist.get(n) ?? Infinity)) { dist.set(n, d); via.set(n, null); push([d + h(n), n]); }
      let best = null;
      while (heap.length) {
        const [f, u] = pop();
        if (best && f >= best.d) break;
        if (done.has(u)) continue; done.add(u);
        if (tgt.has(u)) { const d = dist.get(u) + tgt.get(u); if (!best || d < best.d) best = { d, end: u }; }
        for (const k of g.adj[u]) {
          const e = g.e[k], v = e[0] === u ? e[1] : e[0], d = dist.get(u) + e[2] / 1000;
          if (d < (dist.get(v) ?? Infinity)) { dist.set(v, d); via.set(v, [u, k]); push([d + h(v), v]); }
        }
      }
      if (best) {
        const chain = []; let v = best.end;
        while (via.get(v)) { const [u, k] = via.get(v); chain.push([u, k]); v = u; }
        const start = v, aPts = edgePts(sa.k, g.e[sa.k][0]), bPts = edgePts(sb.k, g.e[sb.k][0]);
        const head = start === a0 ? aPts.slice(0, sa.j + 1).reverse() : aPts.slice(sa.j);   // a's point to the end it left by
        const tail = best.end === b0 ? bPts.slice(0, sb.j + 1) : bPts.slice(sb.j).reverse();   // the end it arrived at to b's point
        const pts = [a, ...head];
        for (const [u, k] of chain.reverse()) pts.push(...edgePts(k, u).slice(1));
        pts.push(...tail.slice(1), b);
        const total = sa.m + best.d + sb.m;
        if (total <= 3 * miles(a, b) + 2) out = { miles: total, pts };
      }
    }
  }
  NET.cache.set(key, out);
  return out;
}
// road miles where the roads give a way, else the straight line
export const dist = (a, b) => { const r = roadPath(a, b); return r ? r.miles : miles(a, b); };

// share an amount between stops by their services, or equally if none carry a count
function spread(amount, list, field) {
  const sv = list.reduce((t, s) => t + (s.services || 0), 0);
  for (const s of list) s[field] = (s[field] || 0) + amount * (sv > 0 ? (s.services || 0) / sv : 1 / list.length);
}

// Split the route day between its stops (see the head of the file). R is model/rates.js.
export function allocate(R, day) {
  const total = R.RATES.routeDay.v, split = R.SETTINGS.split, travel = total * split, onsite = total - travel;
  const st = day.stops;
  for (const s of st) { s.travel = 0; s.onsite = 0; s.detour = null; }
  // places: consecutive stops at the same postcode are one place
  const places = [];
  for (const s of st) {
    const last = places[places.length - 1];
    if (last && s.pt && last.postcode === s.postcode) last.stops.push(s);
    else places.push({ postcode: s.postcode, pt: s.pt, stops: [s] });
  }
  const located = places.filter(p => p.pt), path = [YARD, ...located.map(p => p.pt), YARD];
  let dayMiles = 0;
  for (let i = 1; i < path.length; i++) dayMiles += dist(path[i - 1], path[i]);   // road miles, where the roads give a way
  located.forEach((p, i) => { p.detour = Math.max(0, dist(path[i], path[i + 1]) + dist(path[i + 1], path[i + 2]) - dist(path[i], path[i + 2])); });
  const sumDetour = located.reduce((t, p) => t + p.detour, 0);
  const customers = [...new Set(st.map(s => s.level1))];
  const byCustomer = c => st.filter(s => s.level1 === c);
  if (located.length) for (const p of located) {
    spread(travel * (sumDetour > 0 ? p.detour / sumDetour : 1 / located.length), p.stops, 'travel');
    spread(p.detour, p.stops, 'detour');
  } else for (const c of customers) spread(travel / customers.length, byCustomer(c), 'travel');   // nothing placed: travel by visit
  for (const c of customers) spread(onsite / customers.length, byCustomer(c), 'onsite');
  for (const s of st) s.cost = s.travel + s.onsite;
  const me = st.filter(s => s.mine);
  const sum = f => me.reduce((t, s) => t + (s[f] || 0), 0);
  return {
    total, travel, onsite, dayMiles, road: !!NET, visits: customers.length, stops: st.length, placed: located.length,
    services: st.reduce((t, s) => t + (s.services || 0), 0),
    me: { cost: sum('cost'), travel: sum('travel'), onsite: sum('onsite'), services: sum('services'), pounds: sum('pounds'), detour: sum('detour'),
      postcode: (me.find(s => s.postcode) || {}).postcode, pt: (me.find(s => s.pt) || {}).pt },
    model: { perVisit: total / R.RATES.visitsDay.v, visitsDay: R.RATES.visitsDay.v },
  };
}

// What would have made it cheaper.
//   another route within NEAR_MILES of this stop within NEAR_DAYS days: carrying the stop there
//     saves its travel share here, less the extra miles there (out and back to the nearest of that
//     route's postcodes) at this day's travel cost a mile;
//   more customers at the same postcode on the same visit: its travel is shared between them.
// history: [{ date, route, postcode_list }]; book: the postcodes' twelve-month customers.
export function cheaper(day, A, history, Z, book) {
  // the account's costliest stop that day is the one worth moving or filling
  const f = day.stops.filter(s => s.mine).sort((a, b) => b.cost - a.cost)[0];
  const me = { pt: f.pt, postcode: f.postcode, travel: f.travel, onsite: f.onsite, services: f.services || 0 };
  const out = { nearby: [], density: [], book: null, stop: f, n: day.stops.indexOf(f) + 1 };
  if (me.pt) {
    const perMile = A.dayMiles > 0 ? A.travel / A.dayMiles : 0;
    for (const h of history || []) {
      if (h.date === day.date && h.route === day.route) continue;
      if (h.date < dayAdd(day.date, -NEAR_DAYS) || h.date > dayAdd(day.date, NEAR_DAYS)) continue;
      let best = null;
      for (const p of String(h.postcode_list || '').split(/[\s,]+/)) {
        const pt = Z[p]; if (!pt) continue;
        const m = miles(me.pt, pt); if (m <= NEAR_MILES && (!best || m < best.m)) best = { m, p };
      }
      if (best) out.nearby.push({ date: h.date, route: h.route, postcode: best.p, miles: best.m, saving: Math.max(0, me.travel - 2 * best.m * perMile) });
    }
    out.nearby.sort((a, b) => b.saving - a.saving || a.miles - b.miles);
    const seen = new Set();   // each route once, at its best day
    out.nearby = out.nearby.filter(n => !seen.has(n.route) && seen.add(n.route));
  }
  if (me.services > 0) for (const k of [1, 2, 3, 5]) out.density.push({ k, perService: (me.travel / k + me.onsite) / me.services, cost: me.travel / k + me.onsite });
  if (book && me.postcode) out.book = book.find(b => b.postcode === me.postcode) || null;
  return out;
}

// ── the maps: SVG strings, equirectangular around the middle latitude, fitted to the points and yard.
// Under the points, when public/data/basemap.json has loaded, a quiet outline of Chicagoland from the
// US Census (scripts/build_basemap.js): land by county with the lakeshore, the interstates, and a few
// town names. Without it the maps still draw, on a plain ground.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let BASE = null, BASE_DATA = null;
export function loadBasemap() {
  if (!BASE) BASE = fetch('/data/basemap.json', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null).then(b => (BASE_DATA = b));
  return BASE;
}
// the outline if it has arrived, else null: a map never waits for it
export const basemapNow = () => BASE_DATA;

// The frame: a projection fitted to the points, at least about three miles across.
function frame(pts, width) {
  const lat0 = pts.reduce((t, p) => t + p[0], 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
  const xs = pts.map(p => p[1] * k), ys = pts.map(p => p[0]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 0.05);
  const height = Math.round(Math.max(240, Math.min(380, width * Math.max(y1 - y0, span * 0.6) / Math.max(x1 - x0, span * 0.6))));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, pad = 28;
  const s = Math.min((width - pad * 2) / Math.max(x1 - x0, span * 0.6), (height - pad * 2) / Math.max(y1 - y0, span * 0.6));
  const P = p => [width / 2 + (p[1] * k - cx) * s, height / 2 - (p[0] - cy) * s];
  return { P, width, height, pad, milePx: s / 69.0 };
}

// The outline, in the frame: points closer than a pixel are dropped, so a far-out county costs little.
function baseLayer(base, F, avoid = []) {
  if (!base) return '';
  const path = (ring, close) => {
    let d = '', last = null;
    for (const p of ring) {
      const [x, y] = F.P(p);
      if (last && Math.abs(x - last[0]) < 1 && Math.abs(y - last[1]) < 1) continue;
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); last = [x, y];
    }
    return d + (close ? 'Z' : '');
  };
  const inView = ([x, y], m = 0) => x >= -m && x <= F.width + m && y >= -m && y <= F.height + m;
  let g = `<path class="rm-land" d="${(base.land || []).map(r => path(r, true)).join('')}"/>`;
  g += `<path class="rm-road" d="${(base.roads || []).map(r => path(r.l || r, false)).join('')}"/>`;
  // town names: the largest first, none on top of another or of the frame's edge
  // town names never sit on the yard or a stop: the data is read first
  const marks = [YARD, ...avoid].map(F.P), taken = [];
  for (const [name, lat, lon] of base.places || []) {
    const [x, y] = F.P([lat, lon]);
    if (!inView([x, y], -F.pad) || taken.some(t => Math.abs(t[0] - x) < 70 && Math.abs(t[1] - y) < 16) || marks.some(m => Math.abs(m[0] - x) < 48 && Math.abs(m[1] - y) < 18)) continue;
    taken.push([x, y]);
    g += `<text class="rm-place" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${esc(name)}</text>`;
    if (taken.length >= 8) break;
  }
  return g;
}

const scaleBar = F => {
  const bar = F.milePx * 5 < F.width / 3 ? 5 : 1;
  return `<g transform="translate(${F.width - F.pad - bar * F.milePx},${F.height - 12})"><line class="rm-scale" x1="0" x2="${(bar * F.milePx).toFixed(1)}" y1="0" y2="0"/><text class="rm-lab" x="${(bar * F.milePx / 2).toFixed(1)}" y="-5" text-anchor="middle">${bar} mile${bar > 1 ? 's' : ''}</text></g>`;
};
const yardMark = F => { const [x, y] = F.P(YARD); return `<rect class="rm-yard" x="${x - 6}" y="${y - 6}" width="12" height="12" rx="2"/><text class="rm-lab" x="${x + 10}" y="${y + 4}">Yard</text>`; };

// One route's day: the stops in order from the yard and back. far: { i, miles } names the stop that
// took the van furthest out of its way.
export function mapSvg(day, { width = 640, base = null, far = null } = {}) {
  const placed = day.stops.filter(s => s.pt);
  const F = frame([YARD, ...placed.map(s => s.pt)], width);
  const stops = [YARD, ...placed.map(q => q.pt), YARD], xy = pts => pts.map(F.P).map(q => q.map(v => v.toFixed(1)).join(',')).join(' ');
  let road = '', straight = '';
  for (let i = 1; i < stops.length; i++) {
    if (stops[i - 1].join() === stops[i].join()) continue;
    const r = roadPath(stops[i - 1], stops[i]);
    if (r) road += `<polyline class="rm-path road" points="${xy(r.pts)}"/>`; else straight += `<polyline class="rm-path" points="${xy([stops[i - 1], stops[i]])}"/>`;
  }
  let g = baseLayer(base, F, placed.map(q => q.pt)) + road + straight + yardMark(F);
  const seen = new Map();
  placed.forEach(q => {
    const [x, y] = F.P(q.pt), key = q.postcode, n = seen.get(key) || 0; seen.set(key, n + 1);
    const ox = n ? Math.cos(n * 2.1) * 7 : 0, oy = n ? Math.sin(n * 2.1) * 7 : 0, i = day.stops.indexOf(q);
    g += `<g class="rm-stop${q.mine ? ' me' : ''}" data-i="${i}" transform="translate(${(x + ox).toFixed(1)},${(y + oy).toFixed(1)})"><circle r="${q.mine ? 9 : 7.5}"/><text y="3.5" text-anchor="middle">${i + 1}</text></g>`;
    if (far && far.i === i) g += `<text class="rm-far" x="${(x + ox + 13).toFixed(1)}" y="${(y + oy + 4).toFixed(1)}">+${far.miles.toFixed(0)} mi</text>`;
  });
  g += scaleBar(F);
  return `<svg class="rm${base ? ' based' : ''}" viewBox="0 0 ${F.width} ${F.height}" role="img" aria-label="${esc(`Route ${day.route} on ${day.date}: ${placed.length} stops in order from the yard`)}">${g}</svg>`;
}

// Where one account is served: its postcodes against the yard, each dot sized by its services.
// places: [{ pt, postcode, services }]
export function placesSvg(places, { width = 640, base = null, label = '' } = {}) {
  const placed = places.filter(p => p.pt);
  const F = frame([YARD, ...placed.map(p => p.pt)], width);
  const max = Math.max(1, ...placed.map(p => p.services || 0));
  let g = baseLayer(base, F, placed.map(p => p.pt));
  for (const p of placed) { const [x, y] = F.P(p.pt); g += `<line class="rm-ray" x1="${F.P(YARD)[0].toFixed(1)}" y1="${F.P(YARD)[1].toFixed(1)}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }
  // the yard goes on last, over the dots
  // every postcode a dot; names for the largest, and only where one does not sit on another or the yard
  const [yx, yy] = F.P(YARD), taken = [[yx + 10, yy, 36]];
  let labels = '';
  for (const p of [...placed].sort((a, b) => (b.services || 0) - (a.services || 0))) {
    const [x, y] = F.P(p.pt), r = 4 + 8 * Math.sqrt((p.services || 0) / max), lx = x + r + 4;
    g += `<g class="rm-stop me" transform="translate(${x.toFixed(1)},${y.toFixed(1)})"><circle r="${r.toFixed(1)}"/></g>`;
    if (taken.length < 9 && !taken.some(([tx, ty, tw]) => lx < tx + tw + 4 && lx + 40 > tx - 4 && Math.abs(ty - y) < 14)) {
      taken.push([lx, y, 40]);
      labels += `<text class="rm-lab" x="${lx.toFixed(1)}" y="${(y + 4).toFixed(1)}">${esc(p.postcode)}</text>`;
    }
  }
  g += labels + yardMark(F);
  g += scaleBar(F);
  return `<svg class="rm${base ? ' based' : ''}" viewBox="0 0 ${F.width} ${F.height}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}
