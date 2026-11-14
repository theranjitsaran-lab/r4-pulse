// Settings, admin only (Theran, 14 November 2026).
//   Route cost: how a route day's cost is built, line by line, from the general ledger; a QuickBooks "Profit and Loss by
//   Month" upload to rebuild it from the same twelve months as the volumes; each route assumption with a sign-off.
//   Until every assumption is signed off, proposals built on route cost read est. with a range.
//   Context for Ask: plain-English notes about the business that Ask reads with every question, never as figures.
// server/settings.js (/api/settings/routecost) and server/sales.js (/api/sales/context).
import * as Fmt from './format.js';
import { esc } from './data.js';
import { money0, moneyK } from './chart.js';

const when = s => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const RATE_NAME = { route_day: 'A route day', facilities: 'Facilities, a box a month', handling: 'Handling, a box movement', shred_plant: 'Shred plant, a pound' };
const HOW_TO_CHECK = {
  mph: 'Ask Mike to time three ordinary routes door to door, or read a week of fuel-card or telematics data if the trucks have it.',
  stopMin: 'Time ten stops on a route: park, walk in, sign, walk out, before any bin is touched.',
  serviceMin: 'Time ten bin swaps once inside.',
  routeHours: 'The drivers\' clock-in and clock-out on route days, from payroll.',
  split: 'Only used where an account has no route days. Ask Mike how much of a typical day is driving.',
};
const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j.data; });

export async function drawRouteCost(el) {
  if (!el) return;
  el.innerHTML = '<p class="hint">Reading the route cost build…</p>';
  let S;
  try { const r = await fetch('/api/settings/routecost', { credentials: 'same-origin' }); if (!r.ok) { el.remove(); return; } S = (await r.json()).data; }
  catch (e) { el.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const rd = S.rates.find(r => r.rate === 'route_day');
  const part = p => `<tr><td class="tl">${esc(p.name)}<small>${esc(p.accounts)}${p.corrected ? ' · from your upload' : ''}</small></td><td>${money0(p.year)}</td><td>${Fmt.pct(p.share)}${p.shareCorrected ? '*' : ''}</td><td>${money0(p.into)}</td></tr>`;
  const rateTable = r => `<table class="p2-t rc-t"><thead><tr><th class="tl">${esc(RATE_NAME[r.rate] || r.rate)}</th><th>12 months</th><th>Share</th><th>Into it</th></tr></thead><tbody>${r.parts.map(part).join('')}
    <tr class="rc-sum"><td class="tl">Total</td><td></td><td></td><td>${money0(r.total)}</td></tr>
    ${r.volume ? `<tr><td class="tl">÷ ${esc(r.volume.word)}, ${esc(S.volumesPeriod)}</td><td></td><td></td><td>${Fmt.grouped(Math.round(r.volume.value))}</td></tr>` : ''}
    <tr class="rc-res"><td class="tl">= ${esc(r.label)}</td><td></td><td></td><td>${Fmt.money(r.result, { dp: r.result < 1 ? 4 : 2 })}</td></tr></tbody></table>`;
  const ass = a => `<li class="st-row"><div class="st-what"><b>${esc(a.note ? a.note[0] : a.key)}: ${esc(String(+Fmt.fixed(Number(a.value), 2)))}</b><span>${esc(a.note ? a.note[2] : '')}</span><span class="st-q">How to check: ${esc(HOW_TO_CHECK[a.key] || '')}</span></div>
    <div class="st-val">${a.signed ? `<span class="rc-ok">Signed off by ${esc(a.signed.who)}, ${esc(when(a.signed.at))}</span><button type="button" class="linkbtn rc-sign" data-k="${a.key}" data-v="0">Take back</button>` : `<span class="rc-no">Not signed off</span><button type="button" class="st-save rc-sign" data-k="${a.key}" data-v="1">Sign off</button>`}<small>change the value under "A route day, shared by minutes" below</small></div></li>`;
  const ov = S.overlap;
  el.innerHTML = `<div class="h2-ch"><h2>Route cost: how it is built</h2><small>only you see this · ${S.signedAll ? 'every assumption signed off' : 'proposals built on it read est. with a range until every assumption is signed off'}</small></div>
    <p class="p2-lede">A route day costs <b>${money0(rd.result)}</b>: the ledger accounts below, as twelve months, divided by the route days. Ledger ${esc(S.period.from)} to ${esc(S.period.to)}${S.period.months !== 12 ? `, ${Fmt.fixed(S.period.months, 1)} months scaled to a year` : ''}; route days ${esc(S.volumesPeriod)}.${S.period.months !== 12 || !S.corrected ? ' <b>The two periods do not match</b>: upload the P&amp;L for the same twelve months to correct it.' : ''}</p>
    ${rateTable(rd)}
    <details class="fold rc-more"><summary><h3>The other rates built the same way</h3></summary>${S.rates.filter(r => r.rate !== 'route_day').map(rateTable).join('')}</details>
    <h3>Correct it from QuickBooks</h3>
    <p class="hint">QuickBooks › Reports › Profit and Loss › Customize: display columns by <b>Months</b>, the twelve months ${esc(S.volumesPeriod)}, all accounts with sub-accounts. Export to Excel, save as CSV, then choose it here. Nothing is saved until you press Apply.</p>
    <div class="rc-up"><input type="file" accept=".csv,text/csv" class="rc-file" aria-label="Profit and Loss by Month, CSV"><span class="st-msg hint rc-msg"></span></div>
    <div class="rc-prev"></div>
    ${S.corrected ? '<p><button type="button" class="linkbtn rc-reset">Set the corrections aside and go back to the original ledger figures</button></p>' : ''}
    <h3>The assumptions that share a route day between its stops</h3>
    <p class="hint">Veri-Shred never recorded GPS, arrival times or time on site, so these are not measured. Each says how to check it; sign it off once it has been.</p>
    <ul class="st-list">${S.assumptions.map(ass).join('')}</ul>
    <h3>Are ITAD and truck jobs already in the route days?</h3>
    <p>${ov ? `${Fmt.grouped(ov.days)} customer-days of ITAD or hourly truck work (S0, S4, S6, SR, SN, S9) in VCK over twelve months; on ${Fmt.grouped(ov.onroute)} of them (${Fmt.pct(ov.days ? ov.onroute / ov.days : 0)}) the same customer has a done Veri-Shred order that day, so that driver time is already in the route days. ${ov.days - ov.onroute > 0 ? `The other ${Fmt.grouped(ov.days - ov.onroute)} are not: the drivers' pay for them is charged to the bin routes, so consider a share of drivers' pay below 100% for routes.` : ''}` : 'Worked out from the live database once this is deployed.'} Deliveries are VCK only (code 01) and are placed on the route that passed closest that day.</p>`;

  let csvText = null, chosen = null;
  const prev = el.querySelector('.rc-prev'), msg = el.querySelector('.rc-msg');
  const showPreview = d => {
    chosen = d.months;
    prev.innerHTML = `<p class="hint">Months in the file: ${esc(d.fileMonths.map(m => m.slice(0, 7)).join(', '))}. Using ${d.months.length}: ${esc(d.months[0].slice(0, 7))} to ${esc(d.months[d.months.length - 1].slice(0, 7))}${d.months.length !== 12 ? ', scaled to twelve' : ''}.</p>
      <table class="p2-t"><thead><tr><th class="tl">Pool</th><th>Now</th><th>From the file</th><th>Change</th></tr></thead><tbody>${d.pools.map(p => `<tr><td class="tl"><label><input type="checkbox" class="rc-pool" value="${esc(p.pool)}" ${p.found ? 'checked' : 'disabled'}> ${esc(p.accounts)}</label><small>${p.found ? esc(p.lines.slice(0, 4).map(l => `${l.code || ''} ${l.name}: ${moneyK(l.amount)}`).join(' · ')) : 'no matching account in the file: kept as it is'}</small></td><td>${money0(p.was)}</td><td>${p.found ? money0(p.now) : '—'}</td><td>${p.found ? `${p.now >= p.was ? '+' : '−'}${money0(Math.abs(p.now - p.was))}` : ''}</td></tr>`).join('')}</tbody></table>
      <button type="button" class="pq-btn cd-go rc-apply">Apply the ticked pools</button>`;
  };
  el.querySelector('.rc-file').addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    msg.textContent = 'Reading the file…';
    csvText = await f.text();
    try { showPreview(await post('/api/settings/routecost/preview', { csv: csvText })); msg.textContent = ''; } catch (e) { msg.textContent = e.message; }
  });
  el.onclick = async ev => {
    const s = ev.target.closest('.rc-sign');
    if (s) { s.disabled = true; try { await post('/api/settings', { key: 'signed:' + s.dataset.k, value: s.dataset.v === '1' ? Math.round(Date.now() / 1000) : 0 }); } catch (e) { alert(e.message); } return drawRouteCost(el); }
    if (ev.target.closest('.rc-apply') && csvText) {
      const pools = [...el.querySelectorAll('.rc-pool:checked')].map(x => x.value);
      msg.textContent = 'Saving and re-costing…';
      try { await post('/api/settings/routecost/apply', { csv: csvText, months: chosen, pools }); return drawRouteCost(el); } catch (e) { msg.textContent = e.message; }
    }
    if (ev.target.closest('.rc-reset')) { try { await post('/api/settings/routecost/reset', {}); } catch (e) { alert(e.message); } return drawRouteCost(el); }
  };
}

export async function drawContext(el) {
  if (!el) return;
  let notes = [];
  try { const r = await fetch('/api/sales/context', { credentials: 'same-origin' }); if (!r.ok) { el.remove(); return; } notes = (await r.json()).data || []; } catch { el.remove(); return; }
  el.innerHTML = `<div class="h2-ch"><h2>Context for Ask</h2><small>only you edit these · Ask reads them with every question</small></div>
    <p class="hint">Plain-English facts about the business that the figures can't show: "City of Chicago's 2025 labour was a one-off records move", "We don't charge fuel surcharges", "Ingalls renews in March". Ask uses them to explain and judge; it never quotes a figure from them.</p>
    <ul class="st-list ctx-list">${notes.map(n => `<li class="st-row"><div class="st-what"><textarea class="ctx-t" data-id="${esc(n.id)}" rows="2" maxlength="500">${esc(n.note)}</textarea><small>${esc(n.who)}, ${esc(when(n.at))}</small></div><div class="st-val"><button type="button" class="st-save ctx-save" data-id="${esc(n.id)}">Save</button><button type="button" class="linkbtn ctx-del" data-id="${esc(n.id)}">Remove</button></div></li>`).join('')}
    <li class="st-row"><div class="st-what"><textarea class="ctx-t ctx-new" rows="2" maxlength="500" placeholder="Add a note about the business"></textarea></div><div class="st-val"><button type="button" class="st-save ctx-add">Add</button><span class="st-msg hint ctx-msg"></span></div></li></ul>`;
  el.onclick = async ev => {
    const b = ev.target.closest('.ctx-save, .ctx-del, .ctx-add'); if (!b) return;
    const id = b.dataset.id || null, t = id ? el.querySelector(`.ctx-t[data-id="${id}"]`) : el.querySelector('.ctx-new');
    const note = b.classList.contains('ctx-del') ? '' : t.value.trim();
    if (!note && !b.classList.contains('ctx-del')) return;
    b.disabled = true;
    try { await post('/api/sales/context', { id, note }); drawContext(el); } catch (e) { const m = el.querySelector('.ctx-msg'); if (m) m.textContent = e.message; b.disabled = false; }
  };
}
