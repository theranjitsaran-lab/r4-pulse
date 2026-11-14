// The Cross-sell drill-down, under a row on Accounts › Cross-sell: three points, four tiles, one chart a service line, how
// each gap is sized, who it is compared with, and what to do. Every figure comes from the row (whitespace.js) and the account's
// own run (levers.js), so it cannot disagree with the table; model/crossdrill.test.js holds it to that.
//   drillData(row, trend)   the figures, no DOM
//   drillHtml(d, opts)      the markup; drawPoints fills [data-cd-pts] once it is on the page
//   wireDrill(root, d)      Ask, Send to Opportunities
import * as Fmt from './format.js';
import { esc, titleCase } from './data.js';
import { moneyK } from './chart.js';
import { LINES, gapConfidence } from './whitespace.js';
import { accountKind } from './acctkind.js';
import { tile } from './lit.js';
import { OWNERS, ownerName } from './opps.js';
import { whoAmI } from './access.js';
import { phoneFold } from './phonekit.js';

const word = n => n === 'ITAD' ? n : n.toLowerCase();
const CONF = { 3: 'High', 2: 'Medium', 1: 'Low' };
export const confidence = gapConfidence;   // the app's one scale: a gap sized from other accounts is at most medium
const trendPoint = t => {
  if (!t || !t.move) return { key: 'trend', tone: 'a', lead: 'Too little history', rest: 'to say how it is moving on its own run.' };
  const m = t.move, run = `its own ${moneyK(m.run)} run`;
  if (t.kind === 'slipping') return { key: 'trend', tone: 'r', lead: `Slipping: ${moneyK(Math.abs(m.d))} a month below ${run}.`, rest: 'Sell into it with care: lead with the relationship.' };
  if (t.kind === 'stopped') return { key: 'trend', tone: 'r', lead: `Nearly stopped: ${moneyK(m.last3)} a month, against ${run}.`, rest: 'Find out why before suggesting a sale.' };
  if (t.kind === 'rising') return { key: 'trend', tone: 'g', lead: `Rising: up ${moneyK(m.d)} a month on ${run}.`, rest: '' };
  return { key: 'trend', tone: 'g', lead: `Level at ${moneyK(m.last3)} a month`, rest: `against ${run}, so a fair time to add a line.` };
};

// What a gap is in units, so the team can picture it (Theran, 14 November 2026): bin services, boxes shredded,
// devices, boxes moved, delivery trips, hours. Priced at the account's own rate where it buys the line, else the
// median rate across the book (a first-time buyer pays about list, data rule 12). From the margin lines (12 months).
const UNIT = { bin: ['service', 'bin services'], shred: ['box', 'boxes shredded'], itad: ['device', 'devices'], handling: ['box', 'boxes moved'], movement: ['trip', 'delivery trips'], labour: ['hour', 'hours'], storage: null };
export function unitRates(M) {
  if (!M || !M.lines) return null;
  const own = new Map(), book = {};
  for (const l of M.lines) {
    const u = UNIT[l.family]; if (!u || l.unit !== u[0] || !(l.units > 0) || !(l.revenue > 0)) continue;
    const k = l.level1 + '|' + l.family, x = own.get(k) || { rev: 0, units: 0 }; x.rev += l.revenue; x.units += l.units; own.set(k, x);
  }
  for (const [k, x] of own) { const fam = k.split('|')[1]; (book[fam] || (book[fam] = [])).push(x.rev / x.units); }
  const med = a => { const v = a.slice().sort((p, q) => p - q); return v[v.length >> 1]; };
  return { own, book: Object.fromEntries(Object.entries(book).map(([k, v]) => [k, med(v)])) };
}
export function gapUnits(U, level1, key, gap) {
  const u = UNIT[key]; if (!U || !u || !(gap > 0)) return null;
  const o = U.own.get(level1 + '|' + key), price = o && o.units > 0 ? o.rev / o.units : U.book[key];
  if (!(price > 0)) return null;
  const n = gap / price;
  return { units: n, word: u[1], price, own: !!o, perWeek: key === 'bin' ? n / 52 : null, perMonth: n / 12 };
}

export function drillData(r, trend = null, U = null) {
  const lines = LINES.filter(x => x.key !== 'storage').map(x => {
    const c = r.cells[x.key], kind = c.have ? (c.low ? 'low' : 'buys') : c.opp > 0 ? 'not' : 'none';
    const now = c.have ? c.spend : 0, compare = kind === 'low' ? c.expected : kind === 'not' ? c.opp : null;
    return { key: x.key, name: x.name, short: x.short || x.name, kind, now, compare, gap: kind === 'low' ? c.expected - c.spend : kind === 'not' ? c.opp : 0, cell: c };
  });
  // storage can be a gap too: it is on the row and in the sums, though the chart leaves it out to keep its scale
  const st = r.cells.storage, stGap = !st.have && st.opp > 0 ? { key: 'storage', name: 'Storage', short: 'Storage', kind: 'not', now: 0, compare: st.opp, gap: st.opp, cell: st } : st.have && st.low ? { key: 'storage', name: 'Storage', short: 'Storage', kind: 'low', now: st.spend, compare: st.expected, gap: st.expected - st.spend, cell: st } : null;
  const gaps = [...lines.filter(l => l.gap > 0), ...(stGap ? [stGap] : [])].sort((a, b) => b.gap - a.gap);
  for (const g of gaps) g.units = gapUnits(U, r.level1, g.key, g.gap);
  const nb = gaps.filter(g => g.kind === 'not'), low = gaps.filter(g => g.kind === 'low');
  const notBought = nb.reduce((t, g) => t + g.gap, 0), lowFor = low.reduce((t, g) => t + g.gap, 0), room = notBought + lowFor;
  const top = gaps[0] || null, conf = top ? confidence(top.cell) : null;
  const say = g => g.kind === 'not' ? `${word(g.name)}, not bought yet, about ${moneyK(g.gap)} a year` : `${word(g.name)}, ${moneyK(g.now)} now against about ${moneyK(g.compare)} for its size`;
  const points = [
    top ? { key: 'gap', tone: 'a', lead: `Biggest gap: ${say(top)}.`, rest: gaps[1] ? `Then ${say(gaps[1])}.` : 'Nothing else stands out.' } : { key: 'gap', tone: 'g', lead: 'No gap:', rest: 'it buys every line at about what comparable accounts do.' },
    trendPoint(trend),
  ];
  if (top) {
    const how = top.cell.basisLevel === 'book' ? `too few ${r.kindPlural || 'accounts of its kind'}, so ${word(top.name)} is sized from ${Fmt.count(top.cell.peerCount)} accounts across the whole book` : top.cell.basisLevel === 'kind' ? `${word(top.name)} is sized from ${Fmt.count(top.cell.peerCount)} ${r.kindPlural || 'accounts'} of any size` : `${word(top.name)} is sized from ${Fmt.count(top.cell.peerCount)} ${r.kindPlural || 'accounts'} of a similar size`;
    points.push({ key: 'sure', tone: conf === 1 ? 'a' : 'g', lead: `How sure: ${CONF[conf].toLowerCase()}.`, rest: `${how[0].toUpperCase()}${how.slice(1)}.` });
  }
  return {
    level1: r.level1, name: titleCase(r.customer), boxes: r.boxes, buys: r.total, besides: Math.max(0, (r.billed || 0) - r.total), storage: r.cells.storage.have ? r.cells.storage.spend : 0, lines, gaps, top, conf, confWord: conf ? CONF[conf] : null,
    notBought, notBoughtLines: nb.length, lowFor, lowLines: low.map(g => g.name), room, roomPct: r.total > 0 ? room / r.total : null, points, storageGap: stGap,
    peers: top ? (top.cell.peers || []).slice(0, 6).map(p => ({ level1: p.level1, name: titleCase(p.customer), kind: accountKind(p.customer), spend: p.spend })) : [],
  };
}

// the method, in the words the sizing already wrote
export function unitWords(u) {
  if (!u) return '';
  const n = u.units >= 100 ? Fmt.grouped(Math.round(u.units / 10) * 10) : Fmt.grouped(Math.max(1, Math.round(u.units)));
  return `That is about ${n} ${u.word} a year${u.perWeek != null && u.perWeek >= 1 ? ` (about ${Math.round(u.perWeek)} a week)` : u.perMonth >= 1 && u.units < 1000 ? ` (about ${Math.round(u.perMonth)} a month)` : ''}, at ${Fmt.money(u.price, { dp: 2 })} each, ${u.own ? 'its own price' : 'the book\'s median price, about what a first-time buyer pays'}.`;
}
export function gapHow(g) {
  const c = g.cell;
  const units = g.units ? ' ' + unitWords(g.units) : '';
  if (c.have) return c.note + units;
  const b = String(c.basis || '');
  return (c.basisLevel === 'book' ? `Sized from the whole book: ${b}.` : `${b[0].toUpperCase()}${b.slice(1)}.`) + units;
}

export function drillHtml(d, { fresh = false, quote = {} } = {}) {
  const line = d.top;
  const top = Math.max(1, ...d.lines.map(l => Math.max(l.now, l.compare || 0)));
  const rows = d.lines.map((l, i) => {
    const w = v => Math.max(.8, v / top * 100).toFixed(1);
    const right = l.kind === 'buys' ? `<b>${moneyK(l.now)}</b>buys it` : l.kind === 'not' ? `<b class="not">+${moneyK(l.gap)}</b>not bought yet` : l.kind === 'low' ? `<b class="low">+${moneyK(l.gap)}</b>${moneyK(l.now)} now, ${moneyK(l.compare)} for its size` : '<b>—</b>not sized';
    return `<li class="cd-ln ${l.kind}" style="--i:${i}"><span class="cd-nm">${esc(l.short)}</span><span class="cd-track">${l.compare != null ? `<i class="cd-exp" style="width:${w(l.compare)}%"></i>` : ''}${l.now > 0 ? `<i class="cd-now" style="width:${w(l.now)}%"></i>` : ''}</span><span class="cd-val">${right}</span></li>`;
  }).join('');
  const peerTop = Math.max(1, ...d.peers.map(p => p.spend));
  const peerWhat = line && line.cell.basisLevel === 'book' ? `The largest of the ${Fmt.count(line.cell.peerCount)} across the book` : line ? `The closest of the ${Fmt.count(line.cell.peerCount)} in its sizing` : '';
  const sq = n => [1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('');
  return `<div class="cd${fresh ? ' in' : ''}" data-cd="${d.level1}">
    <div class="cd-two">
      <section class="cd-p"><h3>${esc(d.name)} in three points</h3><div data-cd-pts></div></section>
      <section class="cd-p"><h3>The opportunity, a year est.</h3><div class="cd-tiles">
        ${tile({ still: true, noIn: true, label: 'Buys now, 12 months', big: moneyK(d.buys), sub: `${d.storage ? `${moneyK(d.storage)} of it storage${d.boxes ? `, ${Fmt.grouped(d.boxes)} boxes` : ''}` : 'no storage yet'}${d.besides >= 1000 ? `. ${moneyK(d.besides)} of labour and other is on top` : ''}` })}
        ${tile({ still: true, noIn: true, label: 'Not bought yet', big: `+${moneyK(d.notBought)}`, sub: `${d.notBoughtLines} ${d.notBoughtLines === 1 ? 'line' : 'lines'} it does not buy` })}
        ${tile({ still: true, noIn: true, label: 'Low for its size', big: d.lowFor ? `+${moneyK(d.lowFor)}` : '$0', sub: d.lowLines.length ? esc(d.lowLines.map(word).join(', ')) : 'nothing flagged' })}
        ${tile({ still: true, noIn: true, solid: true, label: 'Room to grow', big: `+${moneyK(d.room)}`, sub: d.roomPct == null ? '' : `${Fmt.pct(d.roomPct)} on the ${moneyK(d.buys)} it buys now` })}
      </div></section>
    </div>
    <section class="cd-p"><h3>Each service line: what it buys against comparable accounts</h3>
      <ul class="cd-lines">${rows}</ul>
      <div class="cd-key"><span><i class="k-now"></i>buys now</span><span><i class="k-not"></i>comparable accounts, not bought</span><span><i class="k-low"></i>comparable accounts, bought but low</span><span>Storage left out: at ${moneyK(d.storage)} it would flatten the scale.${d.storageGap ? ` Its ${moneyK(d.storageGap.gap)} gap is in the tiles.` : ''}</span></div>
    </section>
    ${phoneFold('how it is sized', `    <div class="cd-two">
      <section class="cd-p"><h3>How each gap is sized</h3>${d.gaps.map(g => `<p class="cd-how"><b>${esc(g.name)}:</b> ${esc(gapHow(g))} <small>${Fmt.count(g.cell.peerCount)} accounts behind it, ${CONF[confidence(g.cell)].toLowerCase()} confidence.</small></p>`).join('') || '<p class="cd-how">Nothing to size: it buys every line at about what comparable accounts do.</p>'}</section>
      <section class="cd-p"><div class="cd-h"><h3>Compared with${line ? `, on ${esc(word(line.name))}` : ''}</h3>${d.conf ? `<span class="cd-conf c${d.conf}"><span class="cd-dots" aria-hidden="true">${sq(d.conf)}</span>${d.confWord} confidence</span>` : ''}</div>
        ${d.peers.length ? `<p class="cd-how"><small>${esc(peerWhat)}.</small></p><div class="cd-peers">${d.peers.map(p => `<a class="cd-peer" href="#customer/${p.level1}"><b>${esc(p.name)}</b><span>${esc(p.kind)}, ${moneyK(p.spend)}</span><i class="cd-pbar"><u style="width:${Math.max(2, p.spend / peerTop * 100).toFixed(1)}%"></u></i></a>`).join('')}</div>` : '<p class="cd-how">No comparable accounts to show.</p>'}
      </section>
    </div>`)}
    ${line ? `<div class="cd-acts" data-cd-acts><button type="button" class="pq-btn" data-cd-ask>Ask Pulse why</button>${quote[line.key] ? `<a class="pq-btn cd-a" href="#pricing?level1=${d.level1}&code=${esc(quote[line.key])}">Price ${esc(word(line.name))} in Quote</a>` : ''}<label class="cd-owner">Owner <select data-cd-owner>${OWNERS.map(o => `<option value="${o}"${o === whoAmI() ? ' selected' : ''}>${esc(ownerName(o))}</option>`).join('')}</select></label><button type="button" class="pq-btn cd-go" data-cd-send>Send to Opportunities</button></div>` : ''}
  </div>`;
}

export const oppKey = d => `cross:${d.level1}:${d.top.key}`;
// said: every opportunity's latest state, once for the page
export function wireDrill(root, d, said) {
  const acts = root.querySelector('[data-cd-acts]'); if (!acts || acts.dataset.on) return;
  acts.dataset.on = '1';
  const k = oppKey(d), mark = o => { const b = acts.querySelector('[data-cd-send]'), s = acts.querySelector('.cd-owner'); if (b) b.remove(); if (s) s.remove(); if (!acts.querySelector('.cd-sent')) { const m = document.createElement('span'); m.className = 'cd-sent'; m.textContent = `With ${ownerName(o)} on Opportunities.`; acts.appendChild(m); } };
  if (said && said[k] && said[k].owner) mark(said[k].owner);
  acts.addEventListener('click', async ev => {
    if (ev.target.closest('[data-cd-ask]')) { dispatchEvent(new CustomEvent('open-ask', { detail: { ask: `Why is ${d.name}'s biggest cross-sell gap ${word(d.top.name)}, and how sure are we?` } })); return; }
    const go = ev.target.closest('[data-cd-send]'); if (!go) return;
    const owner = acts.querySelector('[data-cd-owner]').value;
    go.disabled = true;
    try {
      const r = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, level1: d.level1, status: 'open', owner, value: Math.round(d.top.gap), note: `${d.top.kind === 'low' ? `Low for its size on ${word(d.top.name)}` : `Does not buy ${word(d.top.name)} yet`}: about ${moneyK(d.top.gap)} a year est.${d.top.units ? ' ' + unitWords(d.top.units) : ''} ${gapHow({ ...d.top, units: null })}`.slice(0, 500) }) });
      if (!r.ok) throw new Error(String(r.status));
      if (said) said[k] = { owner };
      mark(owner);
    } catch (e) { go.disabled = false; if (!acts.querySelector('.cd-sent')) { const m = document.createElement('span'); m.className = 'cd-sent'; m.textContent = 'That did not save. Try again in a moment.'; acts.appendChild(m); } }
  });
}
