// Opportunities (#opportunities, the last tab): the list the team works. Three points, four tiles, where the list has got to, what
// kind of money it is, then one row per account: its best move, what it is worth, how sure, who owns it, where it has got to, the next
// step. A tap opens its moves, best first. Worked out on the server (components/opps.js via /api/view/opportunities); what the team
// says is written to app.opportunity (server/sales.js), read fresh each visit so another person's change shows.
import * as Fmt from '/components/format.js';
import { esc } from '/components/data.js';
import { moneyK } from '/components/chart.js';
import { dataTable } from '/components/datatable.js';
import { accountFilters } from '/components/acctfilters.js';
import { whoAmI } from '/components/access.js';
import { getJson } from '/components/data.js';
import { litCard, drawPoints, tile } from '/components/lit.js';
import { whenIntroDone, firstPlay, playIn } from '/components/motion.js';
import { CONFIDENCE } from '/components/whitespace.js';
import { KINDS, STATUSES, STATUS_NAMES, OWNERS, ownerName, byAccount, accountState, pipeline, kindMix, inKind, oppsPoints } from '/components/opps.js';

const STATES = [['active', 'Open and in play'], ['open', 'Open'], ['contacted', 'Contacted'], ['agreed', 'Agreed'], ['play', 'In play'], ['mine', 'Mine'], ['won', 'Won'], ['lost', 'Lost']];
const when = r => { const m = r.kind === 'overdue' ? 'once' : r.modelled ? 'a year est.' : 'a year'; return r.stale ? 'when last sized' : m; };
const dots = n => `<span class="cd-dots op-sure" role="img" aria-label="Confidence ${n} of 3: ${esc(CONFIDENCE[n])}" title="${esc(CONFIDENCE[n])}">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const pill = k => `<span class="op-kind k-${k}">${esc(KINDS[k])}</span>`;

export async function render(main, params, C) {
  if (!main) return;
  // read fresh, not from the page's cache: someone else may have moved something
  const [V, VW] = await Promise.all([fetch('/api/view/opportunities', { credentials: 'same-origin' }).then(r => { if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; } return r.json(); }).then(j => j.data), getJson('view/customers')]);
  const rows = V.rows, me = V.me || whoAmI(), G = byAccount(rows);
  const stateOf = a => accountState(a);
  const inState = (s, v) => v === 'active' ? s.status !== 'won' && s.status !== 'lost' : v === 'play' ? s.status === 'contacted' || s.status === 'agreed' : v === 'mine' ? s.owner === me && s.status !== 'won' && s.status !== 'lost' : !v || s.status === v;

  // links saved before the filter bar
  if (params.kind || params.state) {
    const u = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const k of ['kind', 'state']) if (u.get(k)) { u.set('f_' + k, u.get(k)); u.delete(k); }
    history.replaceState(null, '', '#opportunities?' + u);
  }

  main.innerHTML = `<div class="cust c2 h2 ac op">
    <div><h1>Opportunities</h1><p class="op-how">One row per account, the single best move first: what it’s worth, who owns it, where it’s got to.</p></div>
    ${litCard('op-lit', 'Pulse summary, from the list below')}
    <section class="ktiles" id="op-tiles" data-in></section>
    <section class="h2-card" data-in><div class="h2-ch"><h2>Where the list has got to</h2><small>Each account once, at its best move, at the status of whichever move is furthest along.</small></div><div class="op-pipe" id="op-pipe"></div></section>
    <section class="h2-card" data-in><div class="h2-ch"><h2>What kind of money it is</h2><small>Each account at its best yearly move; overdue boxes apart, as a one-off. Tap a kind to filter the list.</small></div><div class="op-kinds" id="op-kbar" aria-hidden="true"></div><div class="op-kkey" id="op-kkey" role="group" aria-label="Filter by kind"></div></section>
    <section class="h2-card c2-tablecard" data-in>
      <div id="op-t"></div>
      <p class="op-msg" id="op-msg" role="status"></p>
      <div class="src">$ a year is each account's best move, once: moves on an account overlap, so they do not add up. Overdue-box destruction is a one-off that needs the client's sign-off, so it has its own column and never adds to the yearly figure. Cross-sell is est. at what comparable accounts spend, price gaps at the book's median, win-back at the drop on the account's own run, rate rounds at the typical 8%. Three marks: its own billing or the book median. Two: comparable accounts of its kind. One: the whole book or few comparable accounts.</div>
    </section>
  </div>`;
  const root = main.querySelector('.op'), $ = id => main.querySelector('#' + id), host = $('op-t');

  // ── the top of the page, redrawn when anything is saved ──
  let shown = null, T = null;
  const drawTop = () => {
    const owned = G.rows.filter(a => stateOf(a).owner).length, top20 = G.rows.slice().sort((x, y) => y.largest - x.largest).slice(0, 20).reduce((t, a) => t + a.largest, 0);
    $('op-tiles').innerHTML = `
      ${tile({ still: true, noIn: true, lead: true, label: 'Worth a year', big: moneyK(G.largest), sub: 'each account once, at its best move' })}
      ${tile({ still: true, noIn: true, label: 'One-off', big: moneyK(G.once), sub: 'overdue boxes, needs client sign-off' })}
      ${tile({ still: true, noIn: true, label: 'Accounts with a move', big: Fmt.count(G.accounts), sub: `the largest 20 hold ${moneyK(top20)} a year` })}
      ${tile({ still: true, noIn: true, warn: owned < G.accounts * .25, label: 'With an owner', big: `${Fmt.count(owned)} of ${Fmt.count(G.accounts)}`, sub: owned ? `${Fmt.count(G.accounts - owned)} still to assign` : 'no move is owned yet' })}`;
    const P = pipeline(G);
    $('op-pipe').innerHTML = P.map(s => `<div class="op-stage st-${s.status}${s.n ? ' has' : ''}"><span>${esc(s.name)}</span><b class="${shown && shown[s.status] !== s.n ? 'bump' : ''}">${Fmt.count(s.n)}</b><small>${s.value ? `${moneyK(s.value)} a year` : '$0'}</small></div>`).join('');
    shown = Object.fromEntries(P.map(s => [s.status, s.n]));
    const K = kindMix(G), yearly = K.filter(x => !x.once), f = T ? T.state.f.kind : new URLSearchParams(location.hash.split('?')[1] || '').get('f_kind');
    $('op-kbar').innerHTML = yearly.map((x, i) => `<i class="k-${x.kind}" style="flex:${x.value.toFixed(0)} 0 0;--i:${i}"></i>`).join('');
    $('op-kkey').innerHTML = K.map(x => `<button type="button" data-kind="${x.kind}" aria-pressed="${f === x.kind}"><i class="k-${x.kind}"></i>${esc(x.name)} <b>${moneyK(x.value)}${x.once ? ' once' : ''}</b><small>${Fmt.count(x.n)} ${x.n === 1 ? 'account' : 'accounts'}</small></button>`).join('');
    const lit = $('op-lit'); lit.innerHTML = '<div></div>'; drawPoints(lit.firstChild, oppsPoints(G, moneyK));
  };

  // ── the expanded account ──
  const seen = new Set();
  const detail = a => {
    const t = stateOf(a), moves = a.items.slice().sort((x, y) => (y === t.best) - (x === t.best) || Number(!!x.stale) - Number(!!y.stale) || y.rank - x.rank);
    const top = Math.max(1, ...moves.filter(m => !m.once).map(m => m.value)), over = moves.find(m => m.kind === 'overdue' && !m.stale), gap = moves.find(m => m.kind === 'price' && m.line === 'storage' && !m.stale);
    const act = m => m.kind === 'slip' ? `<button type="button" class="pq-btn" data-op-ask="${esc(`Draft a call note for ${a.name}: ${m.reason}`)}">Draft a call note</button>`
      : (m.kind === 'price' || m.kind === 'cross') && (m.code || m.line === 'storage') ? `<a class="pq-btn cd-a" href="#pricing?level1=${m.level1}&code=${esc(m.line === 'storage' ? 'STO' : m.code)}">Price it in Quote</a>`
      : m.kind === 'route' ? '<a class="pq-btn cd-a" href="#activity?lens=cost">Open in Operations</a>'
      : `<button type="button" class="pq-btn" data-op-ask="${esc(`${a.name}: ${m.reason} What should we do?`)}">Ask Pulse</button>`;
    const fresh = !seen.has(a.level1);
    return `<div class="cd op-dd${fresh ? ' in' : ''}" data-op="${a.level1}">
      <div class="op-dhead"><span><b>${esc(a.name)}</b> <small>${Fmt.count(moves.length)} ${moves.length === 1 ? 'move' : 'moves'}, best first</small></span><a class="how-link chev" href="#customer/${a.level1}">Open the account</a></div>
      <div class="op-moves">${moves.map((m, i) => `<article class="op-move${m === t.best ? ' top' : ''}${m.once ? ' once' : ''}${m.stale ? ' stale' : ''}" style="--i:${i}">
        <div class="op-cv">${pill(m.kind)}${dots(m.conf || 1)}</div>
        <div class="op-cv"><b>${moneyK(m.value)}</b><small>${esc(when(m))}</small></div>
        <span class="op-bar" aria-hidden="true"><i style="--s:${(m.once ? 1 : Math.min(1, m.value / top)).toFixed(3)}"></i></span>
        <p>${esc(m.reason)}</p>
        ${m.opener ? `<details class="op-open"><summary>A way to open</summary><p>“${esc(m.opener)}”</p></details>` : ''}
        <div class="op-cf"><small>${m === t.best ? 'Best move' : ''}${m.owner ? `${m === t.best ? ', ' : ''}with ${esc(ownerName(m.owner))}` : ''}</small>${act(m)}</div>
      </article>`).join('')}</div>
      ${over && gap ? `<p class="op-over">These overlap: if the overdue boxes are destroyed, storage falls by ${moneyK(over.ends)} a year, which shrinks the storage price gap.</p>` : ''}
    </div>`;
  };

  // ── the table ──
  const others = [...new Set(rows.map(r => r.owner).filter(o => o && !OWNERS.includes(o)))].sort();
  const allOwners = [...OWNERS, ...others];
  const shared = accountFilters(VW, C).filter(f => f.k !== 'book').map(f => ({ ...f, hidden: true }));
  const fit = () => { const box = host.querySelector('.dt-scroll'); if (box) box.style.setProperty('--cd-w', box.clientWidth + 'px'); };
  const onResize = () => { if (!root.isConnected) { removeEventListener('resize', onResize); return; } fit(); };
  addEventListener('resize', onResize);
  T = dataTable(host, { key: 'opportunities', who: whoAmI(), rows: G.rows, noun: 'accounts', placeholder: 'Find an account', search: a => a.name,
    defaults: { state: 'active' },
    filters: [
      { k: 'kind', l: 'Kind', hidden: true, options: Object.entries(KINDS), test: (a, v) => inKind(a, v) },
      { k: 'owner', l: 'Owner', options: [['none', 'No owner'], ...allOwners.map(o => [o, ownerName(o)])], test: (a, v) => { const o = stateOf(a).owner; return v === 'none' ? !o : o === v; } },
      { k: 'state', l: 'Status', options: STATES, test: (a, v) => inState(stateOf(a), v) },
      ...shared,
    ],
    totalLabel: 'Each account once',
    cols: [
      { k: 'name', l: 'Account', name: true, text: true, get: a => a.name, fmt: a => `<a href="#customer/${a.level1}">${esc(a.name)}</a>${a.items.length > 1 ? ` <small>${a.items.length} moves</small>` : ''}` },
      { k: 'best', l: 'Best move', fixed: true, text: true, cls: 'op-best', fmt: a => { const b = stateOf(a).best; return `${pill(b.kind)}<span class="op-short" title="${esc(b.reason)}">${esc(b.short || b.reason)}</span>`; }, csv: a => { const b = stateOf(a).best; return `${KINDS[b.kind]}: ${b.reason}`; } },
      { k: 'year', l: '$ a year', short: '$ a year', fixed: true, sorted: true, get: a => a.largest, total: 'sum', totalFmt: moneyK, fmt: a => { const top = Math.max(1, G.rows[0] ? Math.max(...G.rows.map(x => x.largest)) : 1), b = stateOf(a).best; return a.largest ? `<span class="op-worth"><span class="op-bar" aria-hidden="true"><i style="--s:${(a.largest / top).toFixed(3)}"></i></span>${moneyK(a.largest)}${b.modelled ? ' est.' : ''}</span>` : '—'; } },
      { k: 'once', l: 'One-off', fixed: true, get: a => a.once, total: 'sum', totalFmt: moneyK, fmt: a => a.once ? moneyK(a.once) : '—' },
      { k: 'conf', l: 'How sure', fixed: true, get: a => stateOf(a).conf, csv: a => stateOf(a).conf, fmt: a => dots(stateOf(a).conf) },
      { k: 'owner', l: 'Owner', fixed: true, text: true, get: a => stateOf(a).owner || '', csv: a => ownerName(stateOf(a).owner), fmt: a => { const s = stateOf(a), own = s.owner; return `<select class="op-own${own ? '' : ' none'}" data-op-key="${esc(s.lead.key)}" aria-label="Owner for ${esc(a.name)}"><option value="">Assign</option>${allOwners.map(o => `<option value="${esc(o)}"${o === own ? ' selected' : ''}>${esc(ownerName(o))}</option>`).join('')}</select>`; } },
      { k: 'status', l: 'Status', fixed: true, text: true, get: a => stateOf(a).status, csv: a => STATUS_NAMES[stateOf(a).status], fmt: a => { const s = stateOf(a), by = s.lead.who && s.lead.at ? `Last changed by ${ownerName(s.lead.who)}, ${String(s.lead.at).slice(0, 10)}` : ''; return `<select class="op-stat s-${s.status}" data-op-key="${esc(s.lead.key)}" aria-label="Status for ${esc(a.name)}"${by ? ` title="${esc(by)}"` : ''}>${STATUSES.map(x => `<option value="${x}"${x === s.status ? ' selected' : ''}>${STATUS_NAMES[x]}</option>`).join('')}</select>`; } },
      { k: 'next', l: 'Next step', fixed: true, text: true, get: a => stateOf(a).next || '', csv: a => stateOf(a).next || '', fmt: a => { const s = stateOf(a); return `<input type="date" class="op-next" data-op-key="${esc(s.lead.key)}" value="${esc(s.next || '')}" aria-label="Next step for ${esc(a.name)}">`; } },
    ],
    detail,
    onDraw: () => {
      fit(); seen.clear();
      host.querySelectorAll('.op-dd').forEach(el => seen.add(+el.dataset.op));
      if (T) drawKeyState();
    },
  });
  const drawKeyState = () => $('op-kkey').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(T.state.f.kind === b.dataset.kind)));

  // ── saving: what the row shows moves at once; the top follows ──
  const msg = $('op-msg');
  async function save(el, patch) {
    const r = rows.find(x => x.key === el.dataset.opKey); if (!r) return;
    const next = { status: r.status, owner: r.owner, next: r.next, ...patch };
    msg.textContent = 'Saving…';
    const res = await fetch('/api/sales/opportunities', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r.key, level1: r.level1, status: next.status, owner: next.owner || null, value: r.value, note: r.note || null, next_step: next.next || null }) }).catch(() => null);
    if (!res || !res.ok) { msg.textContent = 'That did not save. Try again in a moment.'; T.draw(); return; }
    Object.assign(r, next, { at: new Date().toISOString(), who: me });
    msg.textContent = `Saved: ${r.name}.`;
    const cls = el.className.split(' ')[0], level = r.level1;
    T.draw(); drawTop();
    const a = G.rows.find(x => x.level1 === level), again = a && [...host.querySelectorAll('.' + cls)].find(x => x.dataset.opKey === stateOf(a).lead.key);
    if (again) again.focus();
  }
  host.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || !el.dataset.opKey) return;
    if (el.matches('.op-own')) save(el, { owner: el.value || null });
    if (el.matches('.op-stat')) save(el, { status: el.value });
    if (el.matches('.op-next')) save(el, { next: el.value || null });
  });
  host.addEventListener('click', e => {
    const q = e.target.closest('[data-op-ask]');
    if (q) dispatchEvent(new CustomEvent('open-ask', { detail: { ask: q.dataset.opAsk } }));
  });
  $('op-kkey').addEventListener('click', e => { const b = e.target.closest('button[data-kind]'); if (!b) return; T.set('kind', T.state.f.kind === b.dataset.kind ? '' : b.dataset.kind); drawKeyState(); });

  drawTop();
  document.documentElement.classList.add('js');
  if (firstPlay('r4-opps-played')) { root.classList.add('play'); whenIntroDone().then(() => playIn(root)); }
}
