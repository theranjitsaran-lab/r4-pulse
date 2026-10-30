// One job, explained: what was billed, what it cost to serve and why, the route that day on a map,
// and what would have made it cheaper. Drawn by the Margin drill (its last level) and by an order
// opened on the customer page, so both show the same job the same way.
//
//   costOrders(R, d, meta, A, Z, id)   costs every order of one account, on its real route day where
//                                      there was one (jobCost with routemap.js allocate)
//   jobHtml(job, opts) + wireJob(el, job, ...)   the job, as HTML, then the map drawn and hover wired
import { routeDay, allocate, cheaper, mapSvg, NEAR_MILES, NEAR_DAYS, miles, YARD, loadBasemap, basemapNow } from './routemap.js';
loadBasemap();   // the outline under the route maps, fetched once while the page is read
import { jobCost, costParts, PARTS } from './margin.js';
import { money0 } from './chart.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const title = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Llp|Llc|Inc|Pc|Itad|Cboe)\b/g, w => w.toUpperCase());
const n0 = v => Math.round(v || 0).toLocaleString('en-US');
const dayFmt = t => new Date(t + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' });
const routeName = r => /\d/.test(r || '') ? r : title(r);
export const ROUTE_FAMILIES = ['bin', 'movement', 'itad'];

// Every order of one account costed: a route order on a day the account was on a Veri-Shred route
// takes its real share of that route day; the rest take the model's average visit.
export function costOrders(R, d, meta, A, Z, id) {
  const routeish = items => items.some(i => ROUTE_FAMILIES.includes((meta.get(i.code) || {}).family));
  const perDay = new Map();
  for (const o of d.orders) if (routeish(o.items)) perDay.set(o.date, (perDay.get(o.date) || 0) + 1);
  const days = new Map();
  const dayOf = date => {
    if (!days.has(date)) {
      const day = routeDay({ routes: d.routes, orders: A ? A.orders : [] }, date, id, Z || {});
      days.set(date, day ? { day, alloc: allocate(R, day) } : null);
    }
    return days.get(date);
  };
  const cost = (o, items = o.items) => {
    const ctx = routeish(items) ? dayOf(o.date) : null;
    const c = jobCost(R, items, meta, perDay.get(o.date) || 1, ctx);
    return { cost: c, margin: items.reduce((t, i) => t + (i.revenue || 0), 0) - c.total, ctx };
  };
  for (const o of d.orders) { const x = cost(o); o.cost = x.cost; o.margin = x.margin; o.day = x.ctx; }
  return { cost, dayOf, perDay };
}

// The job's place on its route: postcode, miles from the yard, stops and customers that day.
export function jobPlace(ctx) {
  if (!ctx) return null;
  const { day, alloc } = ctx, me = alloc.me;
  return { postcode: me.postcode, miles: me.pt ? miles(YARD, me.pt) : null, stops: alloc.stops, visits: alloc.visits, route: day.route };
}

const PART_CLS = { space: 'p-space', handling: 'p-hand', route: 'p-route', plant: 'p-plant', labour: 'p-lab' };

// The job as HTML. items: the invoice lines shown; c: its cost (jobCost); svcName: code → name.
export function jobHtml({ o, items, c, svcName, ctx, A }) {
  const rev = items.reduce((t, i) => t + (i.revenue || 0), 0), left = rev - c.total;
  const parts = costParts(c.lines), total = Math.max(rev, c.total, 1);
  const seg = (v, cls, label) => v > 0.5 ? `<i class="${cls}" style="width:${v / total * 100}%" title="${esc(label)} ${money0(v)}">${v / total > 0.12 ? money0(v) : ''}</i>` : '';
  const what = !c.total ? 'Nothing on this job carries a modelled cost: fees and charges with no volume behind them.'
    : `Billed ${money0(rev)} against about ${money0(c.total)} to serve, ${left >= 0 ? `leaving ${money0(left)}` : `${money0(-left)} short`}.`;
  const basis = !c.route ? '' : c.real ? ' Its route cost is its real share of the route that day, below.'
    : ` Its route cost is the model's average visit: ${ctx === null && A ? 'this account was on no Veri-Shred route that day. Box deliveries and retrievals run on delivery routes, which are not in the data yet.' : 'the route lists for this date arrive with the next snapshot.'}`;
  const inv = items.map(i => `<div class="jv-row"><span>${esc(title(svcName.get(String(i.code).replace(/^S5[BPT]$/, 'S5')) || i.code))} <small>${esc(i.code)} · ${n0(i.units)}</small></span><span class="num">${money0(i.revenue)}</span></div>`).join('');
  return `<div class="jv">
    <div class="jv-bars">
      <span class="lab">Billed</span><div class="jv-bar"><i class="p-rev" style="width:${rev / total * 100}%">${rev / total > 0.12 ? money0(rev) : ''}</i></div>
      <span class="lab">Cost to serve ◇</span><div class="jv-bar">${PARTS.map(p => seg(parts[p[0]], PART_CLS[p[0]], p[1])).join('')}</div>
      <span class="lab">${left >= 0 ? 'Left' : 'Short'}</span><div class="jv-bar"><i class="${left >= 0 ? 'p-left' : 'p-loss'}" style="width:${Math.abs(left) / total * 100}%">${Math.abs(left) / total > 0.12 ? money0(left) : ''}</i></div>
    </div>
    <div class="jv-key">${PARTS.filter(p => parts[p[0]] > 0.5).map(p => `<span><i class="${PART_CLS[p[0]]}"></i>${p[1]}</span>`).join('')}</div>
    <p class="jv-say">${esc(what)}${esc(basis)}</p>
    <table class="jv-tab"><tbody>
      <tr class="rev"><td>Billed</td><td class="why">${inv || '—'}</td><td class="num">${money0(rev)}</td></tr>
      ${c.lines.map(l => `<tr><td><i class="dot ${PART_CLS[(PARTS.find(p => p[2].includes(l[0])) || [''])[0]] || ''}"></i>${esc(l[0])}${l[3] ? ' ◇' : ''}</td><td class="why">${esc(l[2])}</td><td class="num">${money0(l[1])}</td></tr>`).join('')}
      <tr class="tot"><td>${left >= 0 ? 'Left' : 'Short'}</td><td class="why"></td><td class="num ${left < 0 ? (c.real || !c.route ? 'is-bad' : 'is-warn') : ''}">${money0(left)}</td></tr>
    </tbody></table>
    <div class="jv-route"></div>
  </div>`;
}

// The route that day under the job: the map with hover, the stops in order, why it cost what it did
// and what would have made it cheaper. el is the job's .jv-route.
export function drawRouteBlock(el, ctx, { R, A, Z }) {
  if (!el) return;
  const head = t => `<div class="lab jv-h">${t}</div>`;
  if (!ctx) { el.innerHTML = ''; return; }
  const { day, alloc: a } = ctx;
  const c = cheaper(day, a, A.routeHistory && A.routeHistory.length ? A.routeHistory : A.routeDays, Z, A.postcodes);
  const me = a.me, nm = s => esc(title(s || '')), dens = c.density;
  el.innerHTML = `${head(`The route that day: ${esc(routeName(day.route))} on ${dayFmt(day.date)}, ${a.stops} stop${a.stops === 1 ? '' : 's'} for ${a.visits} customer${a.visits === 1 ? '' : 's'}, about ${Math.round(a.dayMiles)} miles ◇`)}
    <div class="rm-grid"><div class="rm-wrap"><div class="c-tip" hidden></div></div>
      <ol class="rm-list">${day.stops.map((s, i) => `<li class="${s.mine ? 'me' : ''}" data-i="${i}"><span>${nm(s.company)}<small>${esc(s.postcode || 'no postcode')} · ${s.services} service${s.services === 1 ? '' : 's'}</small></span><span class="num">${money0(s.cost)}</span></li>`).join('')}</ol></div>
    <p class="jv-say">The account's share of the day: <b>${money0(me.cost)}</b> ◇, ${money0(me.travel)} of travel and ${money0(me.onsite)} on site. ${a.visits < a.model.visitsDay ? `The route made ${a.visits} visit${a.visits === 1 ? '' : 's'}, fewer than the usual ${a.model.visitsDay.toFixed(2)} a day, so each carried more of it.` : `The route made ${a.visits} visits, more than the usual ${a.model.visitsDay.toFixed(2)} a day, so each carried less than the model's ${money0(a.model.perVisit)}.`}${me.services ? ` That is ${money0(me.cost / me.services)} a service for its ${me.services}.` : ''}</p>
    ${head('What would have made it cheaper ◇')}
    <ul class="rm-why">
      ${day.stops.filter(s => s.mine).length > 1 ? `<li>Its costliest stop was number ${c.n}, at ${esc(c.stop.postcode || 'an unplaced address')} (${money0(c.stop.cost)}); the rest is about that stop.</li>` : ''}
      ${c.nearby.length ? c.nearby.slice(0, 3).map(n => `<li>${esc(routeName(n.route))} was at ${esc(n.postcode)} on ${dayFmt(n.date)}, ${n.miles < 0.1 ? 'the same postcode' : `${n.miles.toFixed(1)} miles away`}: carrying the stop on that route would have saved about <b>${money0(n.saving)}</b>.</li>`).join('') : `<li>No other route came within ${NEAR_MILES} miles within ${NEAR_DAYS} days either side.</li>`}
      ${dens.length > 1 && c.stop.travel > 1 ? `<li>More customers at ${esc(c.stop.postcode || 'the stop')} on the same visit would share its travel: ${dens.map(x => `${x.k === 1 ? 'alone' : `with ${x.k - 1} more`} ${money0(x.perService)}`).join(' · ')} a service.${c.book && c.book.customers > 1 ? ` R4 served ${c.book.customers} customers at ${esc(c.stop.postcode)} over twelve months (${nm(c.book.names)}).` : ''}</li>` : ''}
    </ul>
    <div class="src">Stops at Census postcode centres joined by straight lines; no GPS was captured · a route day ${money0(a.total)}, ${Math.round(R.SETTINGS.split * 100)}% travel split by each stop's detour, the rest on site split by visit (model/rates.js, provisional) · ${day.source === 'orders' ? 'from the route orders held offline' : 'Veri-Shred done orders'} · days that also delivered boxes are under-counted until delivery routes are in the data</div>`;
  const tip = el.querySelector('.c-tip'), wrap = el.querySelector('.rm-wrap');
  wrap.insertAdjacentHTML('afterbegin', mapSvg(day, { width: Math.max(280, Math.min(900, wrap.clientWidth || 560)), base: basemapNow() }));   // drawn at its on-screen width
  const svg = wrap.querySelector('svg');
  const show = i => {
    const s = day.stops[i]; if (!s) return;
    el.querySelectorAll('.rm-stop').forEach(g => g.classList.toggle('hot', +g.dataset.i === i));
    el.querySelectorAll('.rm-list li').forEach(li => li.classList.toggle('hot', +li.dataset.i === i));
    const g = el.querySelector(`.rm-stop[data-i="${i}"]`);
    if (!g) { tip.hidden = true; return; }
    const r = g.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    tip.innerHTML = `<b>${i + 1}. ${nm(s.company)}</b><span>${esc(s.postcode || '')} · ${s.services} service${s.services === 1 ? '' : 's'}${s.pounds ? ` · ${n0(s.pounds)} lb` : ''}</span><span>share of the day <b>${money0(s.cost)}</b> ◇</span><span>${money0(s.travel)} travel · ${money0(s.onsite)} on site</span>`;
    tip.style.left = Math.max(90, Math.min(w.width - 90, r.left - w.left + r.width / 2)) + 'px';
    tip.hidden = false;
    const below = r.top - w.top < w.height / 2;
    tip.style.top = (below ? r.top - w.top + r.height + 6 : r.top - w.top - tip.offsetHeight - 6) + 'px';
  };
  const hide = () => { tip.hidden = true; el.querySelectorAll('.hot').forEach(x => x.classList.remove('hot')); };
  el.querySelectorAll('.rm-stop').forEach(g => { g.addEventListener('mouseenter', () => show(+g.dataset.i)); g.addEventListener('click', () => show(+g.dataset.i)); });
  el.querySelectorAll('.rm-list li').forEach(li => { li.addEventListener('mouseenter', () => show(+li.dataset.i)); li.addEventListener('click', () => show(+li.dataset.i)); });
  svg.addEventListener('mouseleave', hide); el.querySelector('.rm-list').addEventListener('mouseleave', hide);
}

// Where more volume would cut cost: postcodes whose route visits carry few customers, ranked by what
// one more customer on each of those visits would take off the cost of serving the ones already
// there. Travel to a postcode is shared between the customers on the visit, so with k customers
// each carries 1/k of it; one more customer saves travel × 1/(k+1) a visit (never more than the
// travel itself). Visits a year from the route days held (six months after the snapshot, else the
// six weeks offline, scaled to a year); customers a visit from the twelve-month postcode book.
export function densityByPostcode(R, A, Z, { top = 8 } = {}) {
  const hist = A.routeHistory && A.routeHistory.length ? A.routeHistory : A.routeDays.filter(r => r.services_done > 0);
  if (!hist.length) return { rows: [], days: 0 };
  const dates = hist.map(h => h.date).sort(), span = Math.max(7, (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 864e5 + 1);
  const rd = new Map();
  for (const h of hist) for (const p of new Set(String(h.postcode_list || '').split(/[\s,]+/).filter(Boolean))) rd.set(p, (rd.get(p) || 0) + 1);
  const book = new Map((A.postcodes || []).map(b => [b.postcode, b]));
  const rows = [];
  for (const [p, n] of rd) {
    const pt = Z[p], b = book.get(p);
    if (!pt || !b || b.billing_only) continue;
    const visitsYear = n * 365 / span;
    const k = Math.max(1, Math.min(b.customers || 1, (b.visits || visitsYear) / visitsYear));
    const mi = miles(YARD, pt), tpv = R.travelPerVisit(mi);
    rows.push({ postcode: p, miles: mi, visitsYear, perVisit: k, travel: tpv, saving: visitsYear * tpv / (Math.floor(k) + 1), customers: b.customers, names: b.names });
  }
  rows.sort((a, b) => b.saving - a.saving);
  return { rows: rows.slice(0, top), days: Math.round(span), from: dates[0], to: dates[dates.length - 1] };
}
