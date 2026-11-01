// Opportunities (#opportunities, the last tab): one row per account, largest first: its best move, what it is
// worth, who owns it. A tap opens its other moves, each with its reason, a draft opener, an owner and a status.
// The list is worked out on the server (components/opps.js via /api/view/opportunities); a status change is
// written to app.opportunity (server/sales.js) and feeds "won this month" on Home.
import { getJson, esc } from '/components/data.js';
import { moneyK } from '/components/chart.js';
import { reveal } from '/components/motion.js';
import { dataTable } from '/components/datatable.js';
import { accountFilters } from '/components/acctfilters.js';
import { whoAmI } from '/components/access.js';
import { KINDS, STATUSES, byAccount, accountRow } from '/components/opps.js';

const STATUS_NAMES = { open: 'Open', contacted: 'Contacted', quoted: 'Quoted', won: 'Won', lost: 'Lost' };
const STATES = [['active', 'Open and in play'], ['open', 'Not started'], ['play', 'In play'], ['mine', 'Mine'], ['won', 'Won'], ['lost', 'Lost']];

export async function render(main, params, C) {
  if (!main) return;
  const [V, VW] = await Promise.all([getJson('view/opportunities'), getJson('view/customers')]);
  const rows = V.rows, me = V.me;
  const isOpen = r => r.status !== 'won' && r.status !== 'lost';
  const inState = (x, s) => s === 'active' ? isOpen(x) : s === 'open' ? x.status === 'open' : s === 'play' ? x.status === 'contacted' || x.status === 'quoted' : s === 'mine' ? x.owner && x.owner === me && isOpen(x) : !s || x.status === s;
  // the moves an account has left once the type, status and owner are chosen; its row is drawn from these
  const movesIn = (a, st) => a.items.filter(x => (!st.f.kind || x.kind === st.f.kind) && inState(x, st.f.state) && (!st.f.owner || x.owner === st.f.owner));
  const sumOf = list => list.reduce((t, r) => t + r.value, 0);
  const play = rows.filter(r => r.status === 'contacted' || r.status === 'quoted'), mine = rows.filter(r => r.owner && r.owner === me && isOpen(r));
  const owners = [...new Set(rows.map(r => r.owner).filter(Boolean))].sort();

  // links saved before the filter bar
  if (params.kind || params.state) {
    const u = new URLSearchParams(location.hash.split('?')[1] || '');
    for (const k of ['kind', 'state']) if (u.get(k)) { u.set('f_' + k, u.get(k)); u.delete(k); }
    history.replaceState(null, '', '#opportunities?' + u);
  }
  // what is already moving; nothing here until something is
  const tiles = [
    play.length ? `<button class="h2-kpi" data-state="play"><span>In play ›</span><b>${moneyK(sumOf(play))}</b><small>${play.length} contacted or quoted</small></button>` : '',
    V.won.n ? `<div class="h2-kpi"><span>Won this month</span><b>${moneyK(V.won.value)}</b><small>${V.won.n} marked won</small></div>` : '',
    mine.length ? `<button class="h2-kpi" data-state="mine"><span>Mine ›</span><b>${mine.length}</b><small>open, with you as owner</small></button>` : '',
  ].filter(Boolean).join('');

  main.innerHTML = `<div class="cust c2 op">
    <h1>Opportunities</h1>
    <p class="op-how">One row per account, largest first: the single best move, what it’s worth, who owns it.</p>
    ${tiles ? `<section class="h2-kpis four" data-rv>${tiles}</section>` : ''}
    <section class="h2-card c2-tablecard" data-rv>
      <div id="op-t"></div>
      <div class="src">$ a year is each account's largest move, once: moves on an account overlap, so they do not add up. Overdue-box destruction is a one-off and needs the client's sign-off, so it has its own column and never adds to the yearly figure · cross-sell est. at what comparable accounts spend on the line · price gaps at the book's median · win-back at the drop on the account's own run · rate rounds at the typical 8% · overdue boxes at the median destruction fee</div>
    </section>
  </div>`;

  const money = v => v ? moneyK(v) : '—';
  const view = (a, st) => accountRow(movesIn(a, st));
  const row = r => {
    const priceLink = r.kind === 'price' || (r.kind === 'cross' && r.line === 'bin') ? `<a href="#pricing?level1=${r.level1}${r.line === 'storage' ? '&code=STO' : ''}">Price it ›</a>` : '';
    return `<li class="op-row" data-key="${esc(r.key)}">
      <button class="op-head" type="button" aria-expanded="false">
        <span class="op-who"><b>${esc(KINDS[r.kind])}</b><small>${r.owner ? esc(r.owner) : ''}</small></span>
        <span class="op-why">${esc(r.reason)}</span>
        <span class="op-val">${moneyK(r.value)}${r.once ? ' once' : ''}${r.modelled ? ' est.' : ''}<small>${r.once ? '' : 'a year'}</small></span>
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
  };

  const G = byAccount(rows);
  const shared = accountFilters(VW, C).filter(f => f.k !== 'book').map(f => ({ ...f, hidden: true }));
  const T = dataTable(main.querySelector('#op-t'), { key: 'opportunities', who: whoAmI(), rows: G.rows, noun: 'accounts', placeholder: 'Find an account', search: a => a.name,
    defaults: { state: 'active' },
    filters: [
      { k: 'kind', l: 'Type', chips: true, options: Object.entries(KINDS), test: (a, v, st) => movesIn(a, st).length > 0 },
      { k: 'state', l: 'Status', options: STATES, test: (a, v, st) => movesIn(a, st).length > 0 },
      ...(owners.length ? [{ k: 'owner', l: 'Owner', options: owners.map(o => [o, o]), test: (a, v, st) => movesIn(a, st).length > 0 }] : []),
      ...shared,
    ],
    totalLabel: 'Each account once',
    cols: st => [
      { k: 'name', l: 'Account', name: true, text: true, get: a => a.name, fmt: a => { const n = view(a, st).count; return `<a href="#customer/${a.level1}">${esc(a.name)}</a>${n > 1 ? ` <small>${n} moves</small>` : ''}`; } },
      { k: 'best', l: 'Best move', fixed: true, text: true, cls: 'op-best', fmt: a => { const b = view(a, st).best; return b ? `<span class="op-pill">${esc(KINDS[b.kind])}</span><span class="op-short" title="${esc(b.reason)}">${esc(b.short || b.reason)}</span>` : ''; }, csv: a => { const b = view(a, st).best; return b ? `${KINDS[b.kind]}: ${b.reason}` : ''; } },
      { k: 'year', l: '$ a year', short: '$ a year', fixed: true, sorted: true, get: a => view(a, st).year, total: 'sum', totalFmt: moneyK, fmt: a => { const x = view(a, st); return x.year ? `${moneyK(x.year)}${x.best.modelled ? ' est.' : ''}` : '—'; } },
      { k: 'once', l: 'One-off', fixed: true, get: a => view(a, st).once, total: 'sum', totalFmt: moneyK, fmt: a => money(view(a, st).once) },
      { k: 'owner', l: 'Owner', fixed: true, text: true, get: a => { const b = view(a, st).best; return b && b.owner ? b.owner : ''; }, fmt: a => { const b = view(a, st).best; return b && b.owner ? esc(b.owner) : '—'; } },
      { k: 'status', l: 'Status', fixed: true, text: true, get: a => { const b = view(a, st).best; return b ? STATUS_NAMES[b.status] : ''; }, fmt: a => { const b = view(a, st).best; return b ? `<span class="op-st st-${b.status}">${STATUS_NAMES[b.status]}</span>` : ''; } },
    ],
    detail: (a, st) => { const best = view(a, st).best, moves = movesIn(a, st).sort((x, y) => (y === best) - (x === best) || y.value - x.value); return `<div class="op-detail"><ul class="op-list">${moves.map(row).join('')}</ul></div>`; },
  });

  const host = main.querySelector('#op-t');
  async function save(li, patch) {
    const r = rows.find(x => x.key === li.dataset.key); if (!r) return;
    const next = { status: r.status, owner: r.owner, ...patch };
    const msg = li.querySelector('.op-msg'); msg.textContent = 'Saving…';
    const res = await fetch('/api/sales/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: r.key, level1: r.level1, status: next.status, owner: next.owner || null, value: r.value }) }).catch(() => null);
    if (!res || !res.ok) { msg.textContent = 'Could not save just now.'; return; }
    Object.assign(r, next, { at: new Date().toISOString() });
    T.draw();
    const again = host.querySelector(`.op-row[data-key="${CSS.escape(r.key)}"]`);
    if (again) { again.querySelector('.op-body').hidden = false; again.querySelector('.op-head').setAttribute('aria-expanded', 'true'); again.querySelector('.op-msg').textContent = 'Saved.'; }
  }
  host.addEventListener('click', e => {
    const li = e.target.closest('.op-row'); if (!li) return;
    if (e.target.closest('.op-head')) { const b = li.querySelector('.op-body'), h = li.querySelector('.op-head'); b.hidden = !b.hidden; h.setAttribute('aria-expanded', String(!b.hidden)); }
    if (e.target.closest('.op-copy')) { const r = rows.find(x => x.key === li.dataset.key); navigator.clipboard && navigator.clipboard.writeText(r.opener).then(() => { li.querySelector('.op-msg').textContent = 'Opener copied.'; }); }
    if (e.target.closest('.op-mine')) { li.querySelector('.op-owner').value = me; save(li, { owner: me }); }
  });
  host.addEventListener('change', e => {
    const li = e.target.closest('.op-row'); if (!li) return;
    if (e.target.matches('.op-status')) save(li, { status: e.target.value });
    if (e.target.matches('.op-owner')) save(li, { owner: e.target.value.trim() || null });
  });
  main.querySelectorAll('.h2-kpis [data-state]').forEach(b => b.addEventListener('click', () => T.set('state', b.dataset.state)));
  reveal(main.querySelector('.op'));
}
