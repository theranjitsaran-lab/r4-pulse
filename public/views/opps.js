// Opportunities (#opportunities, the last tab): every next conversation, each account once, the
// top twenty first, its opportunities inside it, each with its dollars a year, the reason, a draft opener, an owner and a status. The list is
// worked out on the server (components/opps.js via /api/view/opportunities); a status change is
// written to app.opportunity (server/sales.js) and feeds "won this month" on Home.
import { getJson, esc } from '/components/data.js';
import { moneyK } from '/components/chart.js';
import { reveal } from '/components/motion.js';
import { toCsv } from '/components/datatable.js';
import { KINDS, STATUSES, byAccount } from '/components/opps.js';

const STATUS_NAMES = { open: 'Open', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
const SHOW = 20;   // the top twenty accounts, then 'show all'
const STATES = [['active', 'Open and in play'], ['open', 'Not started'], ['play', 'In play'], ['mine', 'Mine'], ['won', 'Won'], ['lost', 'Lost']];

export async function render(main, params) {
  if (!main) return;
  const V = await getJson('view/opportunities');
  const rows = V.rows, me = V.me;
  let kind = KINDS[params.kind] ? params.kind : 'all', state = ['active', 'open', 'play', 'won', 'lost', 'mine'].includes(params.state) ? params.state : 'active', q = (params.q || '').toLowerCase(), all = false;

  const isOpen = r => r.status !== 'won' && r.status !== 'lost';
  const openRows = rows.filter(isOpen);
  const sumOf = list => list.reduce((t, r) => t + r.value, 0);
  const play = rows.filter(r => r.status === 'contacted' || r.status === 'quoted');
  const G0 = byAccount(openRows), mine = rows.filter(r => r.owner && r.owner === me && isOpen(r));
  const kpis = `<section class="h2-kpis four" data-rv>
    <div class="h2-kpi lead"><span>Open, each account once</span><b>${moneyK(G0.largest)}</b><small>a year, across ${G0.accounts} accounts</small></div>
    <div class="h2-kpi"><span>Destruction, once</span><b>${moneyK(G0.once)}</b><small>boxes past their review; needs client sign-off</small></div>
    ${play.length ? `<button class="h2-kpi" data-state="play"><span>In play ›</span><b>${moneyK(sumOf(play))}</b><small>${play.length} contacted or quoted</small></button>` : ''}
    ${V.won.n ? `<div class="h2-kpi"><span>Won this month</span><b>${moneyK(V.won.value)}</b><small>${V.won.n} marked won</small></div>` : ''}
    ${mine.length ? `<button class="h2-kpi" data-state="mine"><span>Mine ›</span><b>${mine.length}</b><small>open, with you as owner</small></button>` : ''}
  </section>`;

  main.innerHTML = `<div class="cust c2 op">
    <h1>Opportunities</h1>
    <p class="op-how">One row per account, largest first: the single best move, what it’s worth, who owns it.</p>
    ${kpis}
    <section class="h2-card c2-tablecard" data-rv>
      <div class="c2-tools">
        <div class="seg c2-lines on-desk" id="op-kinds">${[['all', 'Everything'], ...Object.entries(KINDS)].map(([k, n]) => `<button data-kind="${k}">${esc(n)}</button>`).join('')}</div>
        <select class="on-phone" id="op-kinds-p" aria-label="Kind of opportunity">${[['all', 'Everything'], ...Object.entries(KINDS)].map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>
        <select class="on-phone" id="op-states-p" aria-label="Status">${STATES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
        <input class="c2-find" type="search" placeholder="Find an account" aria-label="Find an account" value="${esc(params.q || '')}">
        <button type="button" class="dt-csv" id="op-csv">Download CSV</button>
      </div>
      <div class="seg op-states on-desk" id="op-states">${STATES.map(([k, n]) => `<button data-state="${k}">${n}</button>`).join('')}</div>
      <p class="c2-say" id="op-say"></p>
      <ul class="op-list" id="op-list"></ul>
      <div class="c2-more" id="op-more"></div>
      <div class="src">Cross-sell est. at what comparable accounts spend on the line (the Cross-sell grid) · price gaps at the book's median (Pricing) · win-back at the drop on the account's own run · rate rounds at the typical 8% · overdue boxes at the median destruction fee, once, ranked at a quarter of its value · owner and status are the team's, kept in R4 Pulse</div>
    </section>
  </div>`;

  const $ = s => main.querySelector(s);
  const list = $('#op-list');
  function filtered() {
    let r = rows.filter(x => kind === 'all' || x.kind === kind);
    if (state === 'active') r = r.filter(isOpen);
    else if (state === 'open') r = r.filter(x => x.status === 'open');
    else if (state === 'play') r = r.filter(x => x.status === 'contacted' || x.status === 'quoted');
    else if (state === 'mine') r = r.filter(x => x.owner && x.owner === me && isOpen(x));
    else r = r.filter(x => x.status === state);
    if (q) r = r.filter(x => x.name.toLowerCase().includes(q));
    return r;
  }
  function row(r) {
    const val = `${moneyK(r.value)}${r.once ? ' once' : ''}${r.modelled ? ' est.' : ''}`;
    const priceLink = r.kind === 'price' || (r.kind === 'cross' && r.line === 'bin') ? `<a href="#pricing?level1=${r.level1}${r.line === 'storage' ? '&code=STO' : ''}">Price it ›</a>` : '';
    return `<li class="op-row" data-key="${esc(r.key)}">
      <button class="op-head" type="button" aria-expanded="false">
        <span class="op-who"><b>${esc(KINDS[r.kind])}</b><small>${r.owner ? esc(r.owner) : ''}</small></span>
        <span class="op-why">${esc(r.reason)}</span>
        <span class="op-val">${val}<small>${r.once ? '' : 'a year'}</small></span>
        <span class="op-st st-${r.status}">${STATUS_NAMES[r.status]}</span>
      </button>
      <div class="op-body" hidden>
        <p class="op-opener"><span class="lab">A way to open</span>“${esc(r.opener)}” <button type="button" class="op-copy">Copy</button></p>
        <div class="op-acts">
          <label>Status <select class="op-status">${STATUSES.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${STATUS_NAMES[s]}</option>`).join('')}</select></label>
          <label>Owner <input class="op-owner" value="${esc(r.owner || '')}" placeholder="${esc(me || 'name')}"></label>
          ${me && r.owner !== me ? `<button type="button" class="op-mine">Make it mine</button>` : ''}
          <span class="op-msg hint"></span>
          <span class="op-links"><a href="#customer/${r.level1}">The customer ›</a>${priceLink}</span>
        </div>
      </div>
    </li>`;
  }
  // one account: its largest, what kinds it holds; its opportunities open inside it
  function account(a) {
    const n = a.items.length;
    return `<li class="op-acct"><button class="op-ahead" type="button" aria-expanded="false">
        <span class="op-who"><b>${esc(a.name)}</b><small>${a.owner ? esc(a.owner) + ' · ' : ''}${n} opportunit${n === 1 ? 'y' : 'ies'}</small></span>
        <span class="op-kinds">${a.kinds.map(k => `<em>${esc(KINDS[k])}</em>`).join('')}</span>
        <span class="op-val">${a.largest ? moneyK(a.largest) : moneyK(a.once)}<small>${a.largest ? 'a year' : 'once'}${a.items.find(r => !r.once && r.value === a.largest && r.modelled) ? ' est.' : ''}${a.largest && a.once ? ` · ${moneyK(a.once)} once` : ''}</small></span>
      </button><ul class="op-list" hidden>${a.items.map(row).join('')}</ul></li>`;
  }
  function draw() {
    main.querySelectorAll('#op-kinds button').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    main.querySelectorAll('#op-states button').forEach(b => b.classList.toggle('on', b.dataset.state === state));
    $('#op-kinds-p').value = kind; $('#op-states-p').value = state;
    const G = byAccount(filtered()), shown = all ? G.rows : G.rows.slice(0, SHOW);
    $('#op-say').textContent = G.accounts ? `${G.accounts} account${G.accounts === 1 ? '' : 's'}: ${moneyK(G.largest)} a year counting each account's largest once${G.once ? `, and ${moneyK(G.once)} once` : ''}. Opportunities within an account overlap, so they do not add up. Largest first; tap an account for its openers.` : 'Nothing here yet.';
    list.innerHTML = shown.map(account).join('');
    $('#op-more').innerHTML = G.accounts > shown.length ? `<button type="button" class="more">Show all ${G.accounts}</button>` : '';
  }
  async function save(li, patch) {
    const r = rows.find(x => x.key === li.dataset.key); if (!r) return;
    const next = { status: r.status, owner: r.owner, ...patch };
    const msg = li.querySelector('.op-msg'); msg.textContent = 'Saving…';
    const res = await fetch('/api/sales/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r.key, level1: r.level1, status: next.status, owner: next.owner || null, value: r.value }) }).catch(() => null);
    if (!res || !res.ok) { msg.textContent = 'Could not save just now.'; return; }
    Object.assign(r, next, { at: new Date().toISOString() });
    msg.textContent = 'Saved.';
    const head = li.querySelector('.op-st'); head.className = `op-st st-${r.status}`; head.textContent = STATUS_NAMES[r.status];
    li.querySelector('.op-who small').textContent = r.owner || '';
  }
  list.addEventListener('click', e => {
    const ah = e.target.closest('.op-ahead');
    if (ah) { const u = ah.nextElementSibling; u.hidden = !u.hidden; ah.setAttribute('aria-expanded', String(!u.hidden)); return; }
    const li = e.target.closest('.op-row'); if (!li) return;
    if (e.target.closest('.op-head')) { const b = li.querySelector('.op-body'), h = li.querySelector('.op-head'); b.hidden = !b.hidden; h.setAttribute('aria-expanded', String(!b.hidden)); }
    if (e.target.closest('.op-copy')) { const r = rows.find(x => x.key === li.dataset.key); navigator.clipboard && navigator.clipboard.writeText(r.opener).then(() => { li.querySelector('.op-msg').textContent = 'Opener copied.'; }); }
    if (e.target.closest('.op-mine')) { li.querySelector('.op-owner').value = me; save(li, { owner: me }); e.target.remove(); }
  });
  list.addEventListener('change', e => {
    const li = e.target.closest('.op-row'); if (!li) return;
    if (e.target.matches('.op-status')) save(li, { status: e.target.value });
    if (e.target.matches('.op-owner')) save(li, { owner: e.target.value.trim() || null });
  });
  main.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.kind; all = false; draw(); }));
  main.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => { state = b.dataset.state; all = false; draw(); }));
  $('#op-kinds-p').addEventListener('change', e => { kind = e.target.value; all = false; draw(); });
  $('#op-states-p').addEventListener('change', e => { state = e.target.value; all = false; draw(); });
  $('.c2-find').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); const u = new URLSearchParams(location.hash.split('?')[1] || ''); if (q) u.set('q', q); else u.delete('q'); history.replaceState(null, '', '#opportunities' + (u.toString() ? '?' + u : '')); draw(); });
  $('#op-csv').addEventListener('click', () => {
    const cols = [{ l: 'Account', get: r => r.name }, { l: 'Type', get: r => KINDS[r.kind] }, { l: '$ a year', get: r => r.once ? null : Math.round(r.value) }, { l: '$ once', get: r => r.once ? Math.round(r.value) : null }, { l: 'Estimate', get: r => r.modelled ? 'est.' : '' }, { l: 'Owner', get: r => r.owner || '' }, { l: 'Status', get: r => STATUS_NAMES[r.status] }, { l: 'Why', get: r => r.reason }];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(filtered(), cols)], { type: 'text/csv' }));
    a.download = `r4-pulse-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#op-more').addEventListener('click', e => { if (e.target.closest('.more')) { all = true; draw(); } });
  draw();
  reveal(main.querySelector('.op'));
}
