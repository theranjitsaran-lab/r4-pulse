// Settings (#settings): the cost model's assumptions in one place, each with what it means, the
// question for Mike, who changed it last, and its effect on two reference figures. Admin users can
// change them (server/settings.js); every screen and Ask then cost with the new values. Below, the
// rates themselves (model/rates.js), read-only, with their derivation and confidence.
import * as Fmt from '/components/format.js';
import { esc } from '/components/data.js';
import { money0 } from '/components/chart.js';
import { reveal } from '/components/motion.js';

const GROUPS = [
  { title: 'A route day, shared by minutes', sub: 'how each stop\'s share of its route day is worked out, from the real route days', keys: [
    ['mph', 'mph', 'What is a typical speed between stops in the city, door to door?'],
    ['stopMin', 'minutes', 'How long is a stop before any bins: park, sign in, walk in and out?'],
    ['serviceMin', 'minutes', 'How long does each bin swap take once inside?'],
  ] },
  { title: 'Where there are no route days', sub: 'a new account with no postcode, a line with no route days', keys: [
    ['split', 'share', 'Of a typical route day, how much is driving rather than at customers?'],
  ] },
  { title: 'Box deliveries', sub: 'they ride the shred trucks; VCK has the date and customer but not the route', keys: [
    ['deliveryMatch', 'on/off', 'Are there days a delivery goes out on its own, not on a shred route?'],
  ] },
];
const fmt = (k, v) => k === 'split' ? Fmt.pct(v) : k === 'deliveryMatch' ? (v ? 'On' : 'Off') : String(+Fmt.fixed(Number(v), 2));
const when = s => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export async function render(main, S) {
  if (!main) return;
  draw(main, S);
}

function draw(main, S) {
  const ref = S.reference || {};
  const refHtml = `<section class="h2-kpis four" data-rv>
    <div class="h2-kpi lead"><span>A route day</span><b>${money0(ref.routeDay || 0)}</b><small>drivers, vehicles and route software ÷ route days est.</small></div>
    <div class="h2-kpi"><span>Ingalls, on the road</span><b>${ref.ingalls ? Fmt.money(ref.ingalls.perService, { dp: 2 }) : '—'}</b><small>${ref.ingalls ? `a bin service, over its ${ref.ingalls.days} route days est.` : 'no route days'}</small></div>
    <div class="h2-kpi"><span>The book, on the road</span><b>${ref.book ? Fmt.money(ref.book.perService, { dp: 2 }) : '—'}</b><small>${ref.book ? `a service, ${Fmt.grouped(ref.book.services)} services on ${ref.days} route days est.` : ''}</small></div>
    <div class="h2-kpi"><span>The day as the model sees it</span><b>${ref.avgRoundHours ? Fmt.fixed(ref.avgRoundHours, 1) + ' hours' : '—'}</b><small>drive plus stops; a real route day runs about 8 to 9, so a short figure means the minutes are low</small></div>
  </section>`;
  const row = (k, unit, q) => {
    const v = S.values[k], d = S.defaults[k], b = S.bounds[k], n = S.notes[k] || [k, 'assumed', ''], last = S.latest && S.latest[k];
    const input = k === 'deliveryMatch'
      ? `<select data-k="${k}" ${S.canEdit ? '' : 'disabled'}><option value="1" ${v ? 'selected' : ''}>On: placed on the closest route</option><option value="0" ${v ? '' : 'selected'}>Off: left out of the route days</option></select>`
      : `<input data-k="${k}" inputmode="decimal" value="${k === 'split' ? Math.round(v * 100) : +Fmt.fixed(Number(v), 2)}" ${S.canEdit ? '' : 'disabled'}><span class="st-unit">${k === 'split' ? '%' : esc(unit)}</span>`;
    return `<li class="st-row">
      <div class="st-what"><b>${esc(n[0])}</b><span>${esc(n[2])}</span><span class="st-q">For Mike: ${esc(q)}</span></div>
      <div class="st-val">${input}${S.canEdit ? `<button type="button" class="st-save" data-k="${k}">Save</button>` : ''}
        <small>${esc(n[1])} · default ${esc(fmt(k, d))}${k !== 'deliveryMatch' ? ` · ${esc(fmt(k, b[0]))} to ${esc(fmt(k, b[1]))}` : ''}${last ? ` · set by ${esc(last.who)} on ${esc(when(last.at))}` : ''}</small>
        <span class="st-msg hint" data-for="${k}"></span></div>
    </li>`;
  };
  const del = ref.deliveries;
  main.innerHTML = `<div class="st">
    <h1>Settings</h1>
    <p class="hint">The assumptions behind every cost on screen. ${S.canEdit ? 'Change one and save: every screen and Ask use it at once.' : 'Only an admin can change them.'}${S.saveable ? '' : ' <b>Changes cannot be saved yet:</b> the settings table is created by the one-off setup on the PC (sql/setup_2026_11.sql).'}</p>
    <section class="h2-card" data-rv><div class="h2-ch"><h2>Costs and margins</h2><small>for R4 users; admins always see them</small></div>
      <ul class="st-list"><li class="st-row"><div class="st-what"><b>Costs are final</b><span>Off: margins, the Action column, the price P&amp;L and below-cost lists are hidden from everyone but admins. On: everyone sees them.</span></div>
      <div class="st-val"><select data-k="costsFinal" ${S.canEdit ? '' : 'disabled'}><option value="0" ${S.values.costsFinal ? '' : 'selected'}>Off: hidden from R4 users</option><option value="1" ${S.values.costsFinal ? 'selected' : ''}>On: released to R4 users</option></select>${S.canEdit ? '<button type="button" class="st-save" data-k="costsFinal">Save</button>' : ''}<span class="st-msg hint" data-for="costsFinal"></span></div></li></ul></section>
    ${refHtml}
    ${GROUPS.map(g => `<section class="h2-card" data-rv><div class="h2-ch"><h2>${esc(g.title)}</h2><small>${esc(g.sub)}</small></div>
      <ul class="st-list">${g.keys.map(([k, u, q]) => row(k, u, q)).join('')}</ul>
      ${g.title === 'Box deliveries' && del && del.customerDays ? `<p class="src">${del.on ? `${Fmt.grouped(del.placed)} of ${Fmt.grouped(del.customerDays)} customer delivery days placed on a shred route that day, ${del.accounts} accounts, ${esc(String(del.from))} to ${esc(String(del.to))} (VCK code 01). ${del.noPostcode ? `${Fmt.grouped(del.noPostcode)} could not be placed for want of a postcode (the customer has no Veri-Shred address; VCK holds none)` : ''}${del.noPostcode && del.noRoute ? '; ' : ''}${del.noRoute ? `${Fmt.grouped(del.noRoute)} fell on a date no route ran` : ''}${del.noPostcode || del.noRoute ? ': those stay at the average visit, under review.' : ''}` : 'Off: deliveries are left out of the route days, and delivery and pickup stay at the average visit, under review.'}</p>` : ''}
    </section>`).join('')}
    ${pcCard(S)}
    ${S.history && S.history.length ? `<section class="h2-card" data-rv><div class="h2-ch"><h2>Changes</h2><small>newest first</small></div><ul class="st-hist">${S.history.map(h => `<li><span>${/^pc:/.test(h.key) ? `Postcode for account ${esc(h.key.slice(3))}: <b>${+h.value ? esc(String(Math.round(h.value)).padStart(5, '0')) : 'removed'}</b>` : `${esc((S.notes[h.key] || [h.key])[0])}: <b>${esc(fmt(h.key, h.value))}</b>`}</span><span>${esc(h.who)} · ${esc(when(h.at))}</span></li>`).join('')}</ul></section>` : ''}
    <section class="h2-card" data-rv><details class="fold"><summary><h3>The rates</h3><span class="sub">ledger costs over twelve months' volumes · open</span></summary>
      <ul class="st-rates">${S.rates.map(r => `<li><b>${esc(r.key)}</b><span class="v">${typeof r.value === 'number' ? esc(+Fmt.fixed(r.value, 4) + '') : esc(Object.entries(r.value).map(([k, v]) => `${k} ${v}`).join(', '))} <small>${esc(r.unit || '')}</small></span><span class="fl">${esc(r.flag || '')}</span><span class="d">${esc(r.derivation || '')}</span></li>`).join('')}</ul></details></section>
  </div>`;

  // a postcode for a delivery account with none in the data
  main.querySelectorAll('.st-pc-save').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.id, el = main.querySelector(`input[data-pc="${id}"]`), msg = main.querySelector(`.st-msg[data-pcfor="${id}"]`);
    const raw = String(el.value).trim(), v = raw === '' ? 0 : Number(raw);
    if (raw !== '' && !/^\d{5}$/.test(raw)) { msg.textContent = 'Five digits, please.'; return; }
    msg.textContent = 'Saving and re-costing…';
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'pc:' + id, value: v }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { msg.textContent = j.error || 'Could not save just now.'; return; }
    const fresh = await fetch('/api/settings').then(x => x.json()).catch(() => null);
    if (fresh && fresh.data) draw(main, fresh.data);
  }));

  main.querySelectorAll('.st-save:not(.st-pc-save)').forEach(b => b.addEventListener('click', async () => {
    const k = b.dataset.k, el = main.querySelector(`[data-k="${k}"]:not(button)`), msg = main.querySelector(`.st-msg[data-for="${k}"]`);
    let v = Number(String(el.value).replace(/[%\s]/g, ''));
    if (!Number.isFinite(v)) { msg.textContent = 'A number, please.'; return; }
    if (k === 'split') v = v / 100;
    msg.textContent = 'Saving and re-costing…';
    const r = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, value: v }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { msg.textContent = j.error || 'Could not save just now.'; return; }
    // the browser's copy of the cost model takes the new values; reload so every cached figure is redone
    if (window.R4RATES) Object.assign(window.R4RATES.SETTINGS, j.data);
    const fresh = await fetch('/api/settings').then(x => x.json()).catch(() => null);
    if (fresh && fresh.data) { draw(main, fresh.data); const m2 = main.querySelector(`.st-msg[data-for="${k}"]`); if (m2) m2.textContent = 'Saved. Every screen now uses it (reload any open page).'; }
  }));
  reveal(main.querySelector('.st'));
}

// Delivery accounts with no postcode anywhere in the data (VCK holds no addresses; Veri-Shred has one
// only for shred stops), largest delivery revenue first, each with a box to type its postcode; and the
// postcodes already typed. Until VCK's address table joins the daily push, this is how the gap closes.
function pcCard(S) {
  const d = (S.reference || {}).deliveries, typed = (S.reference || {}).typed || [];
  if (!d || !d.on || (!(d.missing || []).length && !typed.length)) return '';
  const row = (id, name, sub, val) => `<li class="st-pcrow"><span><b>${esc(name)}</b><small>${esc(sub)}</small></span>
    <span class="st-val">${S.canEdit ? `<input data-pc="${id}" inputmode="numeric" maxlength="5" placeholder="60601" value="${esc(val || '')}"><button type="button" class="st-save st-pc-save" data-id="${id}">Save</button>` : esc(val || '—')}<span class="st-msg hint" data-pcfor="${id}"></span></span></li>`;
  const b = d.basis || {};
  return `<section class="h2-card" data-rv><div class="h2-ch"><h2>${d.noPostcode ? `${Fmt.grouped(d.noPostcode)} delivery days have no address` : 'Delivery addresses'}</h2><small>type a postcode and those deliveries are placed on that day's route</small></div>
    <p class="hint">Placed so far: ${Fmt.grouped(b.site || 0)} at the site's own address, ${Fmt.grouped(b.account || 0)} at the account's usual address, ${Fmt.grouped(b.typed || 0)} at a postcode typed here. VCK's own addresses are not in the daily push; adding its address table would fill this list without typing.</p>
    <ul class="st-list">${(d.missing || []).slice(0, 25).map(m => row(m.level1, m.name, `${m.days} delivery day${m.days === 1 ? '' : 's'}${m.revenue ? `, $${Fmt.grouped(m.revenue)} of delivery revenue` : ''} · account ${m.level1}`)).join('')}
    ${typed.map(t => row(t.level1, t.name, `postcode typed here · account ${t.level1} · clear the box and save to remove`, t.postcode)).join('')}</ul>
  </section>`;
}
