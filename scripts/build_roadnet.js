// Builds public/data/roadnet.json: the main roads around the yard as a network of junctions and road
// segments, for the likely way a van drove between two stops (components/routemap.js roadPath) and the
// road miles each stop added to the day. From the US Census TIGER/Line "primary and secondary roads"
// for Illinois (17), Indiana (18) and Wisconsin (55): interstates, US highways, state routes.
//
//   node scripts/build_roadnet.js <folder of tl_2023_17_prisecroads> <..._18_...> <..._55_...> public/data/roadnet.json
//
// Junctions are points two roads share. The files carry no ramps, so an interstate meets another road
// only where they share a point; an interstate point within 200 m of another road's point is joined to
// it as an interchange (it also joins a few plain overpasses, which the path is an estimate anyway).
// Output, compact: n = junctions as [lat × 1e4, lon × 1e4] pairs, flattened; e = segments as
// [from, to, length in thousandths of a mile, ...the bend points between, as lat/lon × 1e4 deltas].
'use strict';
const fs = require('fs');
const path = require('path');
const { readShp, readDbf, findExt, simplify, inBox, boxHits } = require('./shapefile');

const miles = (a, b) => { const r = Math.PI / 180, R = 3958.8, dp = (b[0] - a[0]) * r, dl = (b[1] - a[1]) * r;
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dl / 2) ** 2)); };
const key = p => p[0].toFixed(5) + ',' + p[1].toFixed(5);
const INTERCHANGE_MILES = 0.125;

function main() {
  const args = process.argv.slice(2), out = args.pop();
  if (!out || !args.length) { console.error('usage: node scripts/build_roadnet.js <state folder>... <out.json>'); process.exit(1); }

  // every road line in the region, cut where it leaves the region
  const lines = [];
  for (const dir of args) {
    const shapes = readShp(findExt(dir, '.shp')), attrs = readDbf(findExt(dir, '.dbf'));
    shapes.forEach((sh, i) => {
      if (!sh || !boxHits(sh.bbox)) return;
      const inter = attrs[i].RTTYP === 'I';
      for (const r of sh.rings) {
        let run = [];
        for (const p of r) { if (inBox(p[0], p[1])) run.push(p); else { if (run.length > 1) lines.push({ pts: run, inter }); run = []; } }
        if (run.length > 1) lines.push({ pts: run, inter });
      }
    });
  }

  // the network from unique road pieces: a stretch two routes share (I-90 with I-94) counts once.
  // A point is a junction where the roads meeting there are not exactly two (an end, a fork, a crossing).
  const pt = new Map(), adj = new Map(), interPt = new Set();
  const at = p => { const k = key(p); if (!pt.has(k)) { pt.set(k, p); adj.set(k, new Set()); } return k; };
  for (const l of lines) for (let j = 1; j < l.pts.length; j++) {
    const u = at(l.pts[j - 1]), v = at(l.pts[j]);
    if (u === v) continue;
    adj.get(u).add(v); adj.get(v).add(u);
    if (l.inter) { interPt.add(u); interPt.add(v); }
  }
  const id = new Map(), nodes = [], interNode = [];
  const nodeOf = k => { if (!id.has(k)) { id.set(k, nodes.length); nodes.push(pt.get(k)); interNode.push(interPt.has(k)); } return id.get(k); };
  const isJ = k => adj.get(k).size !== 2;

  // segments: walk from each junction along each road piece to the next junction
  const edges = [], seen = new Set(), pair = (u, v) => u < v ? u + '|' + v : v + '|' + u;
  const walk = (start, next) => {
    const chain = [start]; let prev = start, cur = next;
    seen.add(pair(prev, cur));
    while (!isJ(cur) && cur !== start) {
      chain.push(cur);
      const nx = [...adj.get(cur)].find(x => x !== prev);
      prev = cur; cur = nx; seen.add(pair(prev, cur));
    }
    chain.push(cur);
    const geo = chain.map(k => pt.get(k));
    let len = 0; for (let i = 1; i < geo.length; i++) len += miles(geo[i - 1], geo[i]);
    const a = nodeOf(chain[0]), b = nodeOf(chain[chain.length - 1]);
    if (a !== b && len > 0) edges.push({ a, b, len, bend: simplify(geo, 0.0004).slice(1, -1) });
  };
  for (const [k, ns] of adj) if (isJ(k)) for (const n of ns) if (!seen.has(pair(k, n))) walk(k, n);
  for (const [k, ns] of adj) for (const n of ns) if (!seen.has(pair(k, n))) walk(k, n);   // loops with no junction

  // interchanges: each interstate junction joined to the nearest other road's junction within 200 m
  const cell = 0.005, grid = new Map(), ck = (la, lo) => Math.floor(la / cell) + ',' + Math.floor(lo / cell);
  nodes.forEach((p, i) => { if (!interNode[i]) { const k = ck(p[0], p[1]); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
  let links = 0;
  nodes.forEach((p, i) => {
    if (!interNode[i]) return;
    const gy = Math.floor(p[0] / cell), gx = Math.floor(p[1] / cell);
    let best = null;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const j of grid.get((gy + dy) + ',' + (gx + dx)) || []) {
      const m = miles(p, nodes[j]);
      if (m <= INTERCHANGE_MILES && (!best || m < best.m)) best = { j, m };
    }
    if (best) { edges.push({ a: i, b: best.j, len: best.m, bend: [] }); links++; }
  });

  // compact: four decimals for points (about 10 m), bends as deltas from the segment's start
  const q = v => Math.round(v * 1e4);
  const n = []; for (const p of nodes) n.push(q(p[0]), q(p[1]));
  const e = edges.map(x => {
    const r = [x.a, x.b, Math.round(x.len * 1000)];
    let [py, px] = [q(nodes[x.a][0]), q(nodes[x.a][1])];
    for (const p of x.bend) { const y = q(p[0]), xx = q(p[1]); r.push(y - py, xx - px); py = y; px = xx; }
    return r;
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ source: 'US Census TIGER/Line 2023 primary and secondary roads, IL IN WI', n, e }));
  console.log(`${nodes.length.toLocaleString('en-US')} junctions, ${edges.length.toLocaleString('en-US')} segments (${links} interchange links), ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
main();
