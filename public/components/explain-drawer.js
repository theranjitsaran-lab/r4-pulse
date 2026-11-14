// The one drawer (Theran, 14 November 2026): every account call-out opens it, in the same order everywhere.
//   What happened: the move, and what it is measured against, in words; a switch for the comparison.
//   Why: one chart titled by the finding (one-off work hatched), then each line's part: regular or one-off, and for
//   regular work how much was volume and how much was price. The parts add to the move (movebridge.js).
//   What to do: one proposed move, sized, with an owner and a note, sent to Opportunities.
// A line opens inside the drawer (Account › Line) and Back returns, so nobody loses their place.
import * as Fmt from './format.js';
import { moneyK } from './chart.js';
import { getJson, titleCase, esc } from './data.js';
import { openPop } from './pop.js';
import { whoAmI } from './access.js';
import { OWNERS, ownerName } from './opps.js';
import { BASES, moveSentence } from './movebridge.js';
import { LINE_UNITS } from './linegrid.js';

const signedK = v => v == null ? '—' : (v < 0 ? '−' : '+') + moneyK(Math.abs(v));
const monS = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
const monY = m => new Date(m + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const KIND = { regular: 'regular', occasional: 'occasional', oneoff: 'one-off', new: 'new', none: '' };
const tone = v => v >= 0 ? 'up' : 'down';

// fifteen months: the months compared dark (now) and mid (then), one-off work hatched on top
function chart(c, title) {
  const W = 640, H = 170, B = 22, T = 10, n = c.length, slot = W / n, bw = Math.min(26, slot * .62);
  const max = Math.max(1, ...c.map(x => x.v)) * 1.08, y = v => T + (1 - v / max) * (H - B - T);
  let g = `<defs><pattern id="xd-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" class="xd-h"/></pattern></defs>`;
  c.forEach((x, i) => {
    const xx = slot * (i + .5) - bw / 2;
    if (!(x.v > 0)) return;
    const reg = Math.max(0, x.v - x.oneOff);
    g += `<rect class="xd-b${x.now ? ' now' : x.ref ? ' ref' : ''}" x="${xx.toFixed(1)}" y="${y(reg).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y(reg)).toFixed(1)}" rx="2"><title>${monY(x.m)}: ${moneyK(x.v)}${x.oneOff ? `, ${moneyK(x.oneOff)} one-off` : ''}</title></rect>`;
    if (x.oneOff > 0) g += `<rect class="xd-off" x="${xx.toFixed(1)}" y="${y(x.v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(reg) - y(x.v)).toFixed(1)}" fill="url(#xd-hatch)"/>`;
    if (i % 3 === 0 || i === n - 1) g += `<text class="c-axis" x="${(slot * (i + .5)).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(monS(x.m))}</text>`;
  });
  return `<figure class="xd-fig"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg>
    <div class="xd-key"><span><i class="now"></i>last 3 months</span><span><i class="ref"></i>compared with</span><span><i class="off"></i>one-off work</span></div></figure>`;
}

// the move to propose, from the parts: what is wrong decides who calls and about what
function proposal(x, name) {
  if (x.d >= 0) return null;
  const lead = x.byLine.find(l => l.d < 0) || x.byLine[0];
  const offShare = x.d ? x.parts.oneOff / x.d : 0;
  if (offShare >= 0.5) return { what: `Ask ${name} what is coming next`, why: `Most of the fall is one-off work that has not repeated (${x.oneOffs[0] ? `${x.oneOffs[0].name.toLowerCase()}, ${monY(x.oneOffs[0].month)}` : 'a project'}). Regular work is ${x.parts.regular < 0 ? 'down' : 'up'} ${moneyK(Math.abs(x.parts.regular))} a month.`, value: Math.max(0, -x.parts.regular) * 12 || -x.d * 12, owner: 'anne' };
  if (lead && lead.price != null && lead.price < 0 && Math.abs(lead.price) > Math.abs(lead.volume || 0)) return { what: `Check ${name}'s prices on ${lead.name.toLowerCase()}`, why: `${lead.name} is down ${moneyK(Math.abs(lead.d))} a month, mostly on price: the same work is billing less.`, value: -lead.price * 12, owner: 'anne' };
  return { what: `Call ${name} about ${lead ? lead.name.toLowerCase() : 'the fall'}`, why: `${lead ? `${lead.name} is down ${moneyK(Math.abs(lead.d))} a month${lead.volume != null ? `, ${moneyK(Math.abs(lead.volume))} of it fewer ${LINE_UNITS[lead.key] || 'units'}` : ''}` : 'Regular work is down'}: regular work, not a project ending.`, value: -x.d * 12, owner: 'trisha' };
}

export async function openExplain({ level1, name, base = 'avg12' }) {
  const nm = titleCase(name || '');
  openPop({ title: nm, sub: 'Reading why it moved…', wide: true, html: '<p class="hint">Reading its lines…</p>' });
  let x;
  try { x = await getJson(`view/explain?level1=${level1}&base=${encodeURIComponent(base)}`); }
  catch (e) { openPop({ title: nm, sub: '', wide: true, html: `<p>${esc(e.message)}</p><p class="p2-go"><a href="#customer/${level1}">Open ${esc(nm)} ›</a></p>` }); return; }
  const fmt = v => moneyK(v);
  const sentence = moveSentence(x, fmt);
  const P = proposal(x, nm);
  const lineRow = l => `<li><button type="button" class="xd-l" data-k="${esc(l.key)}"><span>${esc(l.name)}<em>${esc(KIND[l.kind] || '')}${l.kind === 'regular' || l.kind === 'occasional' ? `, bought ${l.monthsBought} of 12 months` : ''}</em></span>
      <small>${moneyK(l.nowAvg)} vs ${moneyK(l.refAvg)}</small><b class="h2-cv ${tone(l.d)}">${signedK(l.d)}</b></button></li>`;
  const parts = x.parts;
  const html = `<nav class="xd-crumbs" aria-label="Where you are"><span>Accounts</span> › <b>${esc(nm)}</b></nav>
    <p class="p2-lede">${esc(sentence)}</p>
    ${x.asked !== x.base ? `<p class="hint">${esc(BASES[x.asked] ? BASES[x.asked].label : x.asked)} needs more months than this account has: compared with ${esc(x.label)} instead.</p>` : ''}
    <div class="seg xd-base" role="group" aria-label="Compare with">${x.bases.map(b => `<button type="button" data-b="${b}" class="${b === x.base ? 'on' : ''}" aria-pressed="${b === x.base}">${esc(BASES[b].short)}</button>`).join('')}</div>
    <ul class="h2-stats"><li><span>Last 3 months, a month</span><b>${moneyK(x.nowAvg)}</b></li><li><span>${esc(x.label[0].toUpperCase() + x.label.slice(1))}</span><b>${moneyK(x.refAvg)}</b></li><li><span>One-off part</span><b>${signedK(parts.oneOff)}</b></li><li><span>Regular part</span><b>${signedK(parts.regular)}</b></li></ul>
    ${chart(x.chart, `${x.d < 0 ? 'Down' : 'Up'} ${moneyK(Math.abs(x.d))} a month${Math.abs(parts.oneOff) >= 0.25 * Math.abs(x.d) && Math.abs(parts.oneOff) >= 250 ? `, ${moneyK(Math.abs(parts.oneOff))} of it one-off work` : ''}`)}
    <h3>Why, line by line</h3><ul class="h2-pl xd-lines">${x.byLine.filter(l => Math.abs(l.d) >= 50).map(lineRow).join('')}<li class="rest sf-tot"><span>Total</span><b>${signedK(x.d)}</b></li></ul>
    ${parts.volume || parts.price ? `<p class="hint">Of the regular work: ${signedK(parts.volume)} from volume, ${signedK(parts.price)} from price${Math.abs(parts.noUnits) >= 1 ? `, ${signedK(parts.noUnits)} on lines with no units` : ''}.</p>` : ''}
    <div class="xd-detail" hidden></div>
    <h3>What to do</h3>
    ${P ? `<div class="xd-act"><p><b>${esc(P.what)}</b>, about ${moneyK(P.value)} a year. ${esc(P.why)}</p>
      <label>Note <textarea class="xd-note" rows="2">${esc(`${sentence}`.slice(0, 480))}</textarea></label>
      <div class="xd-row"><label class="cd-owner">Owner <select class="xd-owner">${OWNERS.map(o => `<option value="${o}"${o === (P.owner || whoAmI()) ? ' selected' : ''}>${esc(ownerName(o))}</option>`).join('')}</select></label><button type="button" class="pq-btn cd-go xd-send">Send to Opportunities</button></div></div>`
      : `<p>It is growing: nothing to fix. <a href="#customers?view=whitespace">See what else it could buy ›</a></p>`}
    <p class="src">Lines from VCK's priced lines and the account's storage by month billed${x.months < 15 ? `, ${x.months} months held` : ''}. One-off: bought in ${3} or fewer of the last twelve months, or a month over 3× its usual (thresholds on Settings). Volume and price split only where the line has units.</p>
    <p class="p2-go"><a href="#customer/${level1}">Open ${esc(nm)} ›</a></p>`;
  openPop({ title: nm, sub: `${signedK(x.d)} a month ${BASES[x.base].short}`, wide: true, html, ask: `Why has ${nm} moved, and what should we do?` });
  const b = document.querySelector('.pop-b');
  if (!b) return;
  b.onclick = async ev => {
    const sw = ev.target.closest('.xd-base button');
    if (sw && sw.dataset.b !== x.base) return openExplain({ level1, name, base: sw.dataset.b });
    const ln = ev.target.closest('.xd-l');
    if (ln) {
      const l = x.byLine.find(z => z.key === ln.dataset.k), d = b.querySelector('.xd-detail');
      d.hidden = false;
      d.innerHTML = `<nav class="xd-crumbs"><button type="button" class="linkbtn xd-back">‹ ${esc(nm)}</button> › <b>${esc(l.name)}</b></nav>
        <p>${esc(l.name)}: ${moneyK(l.nowAvg)} a month over the last three months against ${moneyK(l.refAvg)} (${esc(x.label)}), ${signedK(l.d)}. It is ${esc(KIND[l.kind] || 'not bought')} work${l.kind === 'regular' || l.kind === 'occasional' ? `, bought in ${l.monthsBought} of the last 12 months, usually ${moneyK(l.usual)} a month` : ''}.
        ${l.oneOff ? ` ${signedK(l.oneOff)} of the move is one-off.` : ''}${l.volume != null ? ` Of the regular part, ${signedK(l.volume)} is volume (${Fmt.grouped(Math.round(l.unitsRef))} to ${Fmt.grouped(Math.round(l.unitsNow))} ${esc(LINE_UNITS[l.key] || 'units')} a month) and ${signedK(l.price)} price.` : ''}</p>
        ${l.oneOffMonths.length ? `<ul class="h2-pl">${l.oneOffMonths.slice(-6).map(o => `<li class="rest"><span>One-off in ${esc(monY(o.month))}</span><b>${moneyK(o.value)}</b></li>`).join('')}</ul>` : ''}`;
      d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (ev.target.closest('.xd-back')) { const d = b.querySelector('.xd-detail'); d.hidden = true; d.innerHTML = ''; return; }
    const send = ev.target.closest('.xd-send');
    if (send && P) {
      send.disabled = true;
      const owner = b.querySelector('.xd-owner').value, note = b.querySelector('.xd-note').value.trim();
      const r = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `slip:${level1}`, level1, status: 'open', owner, value: Math.round(P.value), note: `${P.what}. ${note}`.slice(0, 500) }) }).catch(() => null);
      const box = b.querySelector('.xd-act');
      box.innerHTML = r && r.ok ? `<p class="cd-sent">With ${esc(ownerName(owner))} on Opportunities, with the note. <a href="#opportunities">Open the list ›</a></p>` : '<p class="is-bad">Not saved: the list is not set up yet, or the connection dropped. Try again.</p>';
    }
  };
}
