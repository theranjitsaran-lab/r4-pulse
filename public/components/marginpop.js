// The margin pop-out, from any margin button: centred, three lit points, the big margin and its band, and the bar from
// revenue down to what is kept. Esc, the scrim or Close dismiss it. Figures from the cost model (margin.js), never here.
//   openMargin({ R, name, revenue, cost, parts, weak, level1, row, B, sub })
import * as Fmt from './format.js';
import { esc } from './data.js';
import { marginBand, PARTS, FAMILY_NAMES } from './margin.js';
import { bridgeParts, openDrawer } from './margindrawer.js';
import { drawPoints, ragLabel } from './lit.js';
import { moneyK, money0 } from './chart.js';

let el = null;
const signedPc = v => { const t = Fmt.pct(Math.abs(v)); return (v < 0 && t !== '0%' ? '−' : '') + t; };
function close() { if (!el) return; el.classList.remove('on'); document.documentElement.classList.remove('ask-open'); }
function build() {
  document.documentElement.classList.add('js');
  el = document.createElement('div');
  el.className = 'mpop-wrap';
  el.innerHTML = `<div class="mpop-scrim"></div><section class="mpop" role="dialog" aria-modal="true" aria-labelledby="mp-t"><header><div><h2 id="mp-t"></h2><small id="mp-s"></small></div><button type="button" class="ask-x" aria-label="Close">✕</button></header><div class="mpop-b" id="mp-b"></div></section>`;
  document.body.appendChild(el);
  el.querySelector('.mpop-scrim').addEventListener('click', close);
  el.querySelector('.ask-x').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  addEventListener('hashchange', close);
}

// the points, from computed fields only
export function marginPoints(R, { revenue, cost, parts, weak }) {
  const left = revenue - cost, pc = revenue > 0 ? left / revenue : null, b = marginBand(R, pc);
  const biggest = PARTS.map(p => ({ name: p[1], v: (parts || {})[p[0]] || 0 })).sort((x, y) => y.v - x.v)[0];
  const pts = [{ key: 'band', tone: b.cls, lead: `${b.word} at ${pc == null ? 'no margin' : signedPc(pc)}:`, rest: `${left < 0 ? 'short by' : 'keeps'} ${moneyK(Math.abs(left))} on ${moneyK(revenue)} over twelve months est.` }];
  if (biggest && biggest.v > 0) pts.push({ key: 'cost', tone: 'a', lead: `${biggest.name} is the largest cost:`, rest: `${moneyK(biggest.v)} of the ${moneyK(cost)} to serve est.` });
  if (weak) {
    const m = weak.revenue - weak.cost, wpc = weak.revenue > 0 ? m / weak.revenue : null, name = FAMILY_NAMES[weak.family] || weak.family;
    pts.push({ key: 'weak', tone: m < 0 ? 'r' : 'a', lead: `${name} earns least:`, rest: `${m < 0 ? 'short by' : 'keeps'} ${moneyK(Math.abs(m))} on ${moneyK(weak.revenue)}${wpc != null ? `, ${signedPc(wpc)}` : ''} est.` });
  }
  return pts;
}

// the weakest costed line of an account, from its lines by family
export function weakest(fam) {
  const rows = Object.entries(fam || {}).filter(([k, v]) => k !== 'other' && v.cost > 0 && v.revenue > 0).map(([family, v]) => ({ family, revenue: v.revenue, cost: v.cost }));
  return rows.length ? rows.reduce((a, b) => (b.revenue - b.cost) / b.revenue < (a.revenue - a.cost) / a.revenue ? b : a) : null;
}

export function openMargin({ R, name, revenue, cost, parts, weak = null, level1 = null, row = null, B = null, sub = 'Last twelve months, est.', family = null }) {
  if (!el) build();
  const left = revenue - cost, pc = revenue > 0 ? left / revenue : null, b = marginBand(R, pc);
  el.querySelector('#mp-t').textContent = `${name}: margin`;
  el.querySelector('#mp-s').textContent = sub;
  el.querySelector('#mp-b').innerHTML = `
    <div class="mp-big"><b class="${b.cls}">${pc == null ? '—' : signedPc(pc)}</b>${ragLabel(R, pc)}<small>${left < 0 ? 'short by' : 'keeps'} ${esc(money0(Math.abs(left)))} of ${esc(money0(revenue))}</small></div>
    <div id="mp-pts"></div>
    ${bridgeParts(revenue, parts)}
    <div class="mp-foot">${level1 != null ? '<button type="button" class="pq-btn" id="mp-jobs">Lines and jobs</button>' : ''}<button type="button" class="pq-btn" id="mp-close">Close</button></div>`;
  drawPoints(el.querySelector('#mp-pts'), marginPoints(R, { revenue, cost, parts, weak }));
  el.querySelector('#mp-close').addEventListener('click', close);
  const jobs = el.querySelector('#mp-jobs');
  if (jobs) jobs.addEventListener('click', () => { close(); openDrawer({ level1, name, R, row, B, family }); });
  requestAnimationFrame(() => { el.classList.add('on'); el.querySelector('#mp-close').focus(); });
}
