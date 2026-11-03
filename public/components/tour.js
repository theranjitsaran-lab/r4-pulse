// The welcome and the guided tour (steps in tourdata.js). A dark veil with a cut-out around the real element, a green outline, and a
// card beside it, or a sheet above the tab bar on a phone. What someone has seen is kept on the server (server/users.js).
import { WELCOME, GUIDES, stepsFor, TOUR_VERSION } from './tourdata.js';
import { welcomeSeen, setWelcomeSeen, isAdmin } from './access.js';
import { openFoldsFor, isPhone } from './phonekit.js';
import { justSignedIn } from './motion.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SKIP = 'r4-welcome-skipped', ICON = { full: 'M5 12h14M13 6l6 6-6 6', quote: 'M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z', account: 'M4 19V9M10 19V5M16 19v-7M22 19H2' };
const skipped = () => { try { return !!sessionStorage.getItem(SKIP); } catch (e) { return false; } };
const focusables = el => [...el.querySelectorAll('button:not([disabled]), input, a[href]')].filter(x => x.offsetParent !== null);
const trap = (el, ev) => { if (ev.key !== 'Tab') return; const f = focusables(el); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (ev.shiftKey && document.activeElement === a) { ev.preventDefault(); z.focus(); } else if (!ev.shiftKey && document.activeElement === z) { ev.preventDefault(); a.focus(); } };

let wEl = null, back = null, tour = null;
function closeWelcome(keepBack) {
  if (!wEl) return;
  if (wEl.querySelector('#wl-never').checked) setWelcomeSeen(TOUR_VERSION);
  else {
    if (welcomeSeen() >= TOUR_VERSION) setWelcomeSeen(0);
    try { sessionStorage.setItem(SKIP, '1'); } catch (e) {}
  }
  wEl.remove(); wEl = null; document.documentElement.classList.remove('ask-open');
  if (!keepBack && back && back.isConnected && back.focus) back.focus();
}
const guided = new Set();   // walkthroughs finished this visit
const guideView = () => `<header><p class="wl-kick"><span class="light g" aria-hidden="true"></span>Step by step</p><h2 id="wl-t">How each screen works</h2><p id="wl-d">Pick one and Pulse walks you through it on the screen itself.</p></header>
    <div class="wl-paths wl-guides">${GUIDES.map(([k, t, s]) => `<button type="button" class="wl-path plain" data-tour-start="${k}"><span><b>${esc(t)}</b><small>${esc(s)}</small></span><em>${guided.has(k) ? 'Done' : `${stepsFor(k, isAdmin()).length} steps`}</em></button>`).join('')}</div>
    <p class="wl-read"><a class="linkbtn" id="wl-read" href="#how">Prefer to read? How Pulse works</a></p>`;
export function openWelcome(opts) {
  if (wEl || tour) return;
  if (!back) back = document.activeElement;
  wEl = document.createElement('div'); wEl.className = 'wl-wrap';
  wEl.innerHTML = `<div class="wl-veil"></div><section class="wl" role="dialog" aria-modal="true" aria-labelledby="wl-t" aria-describedby="wl-d">
    <div class="wl-main"><header><p class="wl-kick"><span class="light g" aria-hidden="true"></span>Welcome to R4 Pulse</p><h2 id="wl-t">${esc(WELCOME.title)}</h2><p id="wl-d">${esc(WELCOME.text)}</p></header>
    <div class="wl-boxes">${WELCOME.boxes.map(([t, b]) => `<div><b>${esc(t)}</b><span>${esc(b)}</span></div>`).join('')}</div>
    <div class="wl-paths"><h3>Where would you like to start?</h3>${WELCOME.choices.map(([k, t, s], i) => `<button type="button" class="wl-path${i ? '' : ' go'}" data-tour-start="${k}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg><span><b>${esc(t)}</b><small>${esc(s)}</small></span><em>${stepsFor(k, isAdmin()).length} steps</em></button>`).join('')}</div></div>
    <footer><label class="wl-never"><input type="checkbox" id="wl-never"${welcomeSeen() >= TOUR_VERSION ? ' checked' : ''}> Don't show this again</label><button type="button" class="linkbtn" id="wl-guide">See how each screen works</button><button type="button" class="linkbtn" id="wl-skip">Skip for now</button></footer>
  </section>`;
  document.body.appendChild(wEl); document.documentElement.classList.add('ask-open');
  wEl.addEventListener('click', ev => { const p = ev.target.closest('[data-tour-start]'); if (p) { closeWelcome(true); start(p.dataset.tourStart); return; } if (ev.target.closest('#wl-guide')) { showGuides(); return; } if (ev.target.closest('#wl-skip, #wl-read') || ev.target.classList.contains('wl-veil')) closeWelcome(); });
  wEl.addEventListener('keydown', ev => { trap(wEl, ev); if (ev.key === 'Escape') closeWelcome(); });
  if (opts && opts.guide) showGuides(); else wEl.querySelector('.wl-path').focus();
}
function showGuides() {
  wEl.querySelector('.wl-main').innerHTML = guideView();
  wEl.querySelector('#wl-guide').hidden = true;
  wEl.querySelector('.wl').scrollTop = 0;
  (wEl.querySelector('.wl-path em:not(:empty)') && [...wEl.querySelectorAll('.wl-path')].find(b => b.querySelector('em').textContent !== 'Done') || wEl.querySelector('.wl-path')).focus();
}

// ── the tour ──
let at = 0, name = '', ui = null, target = null, token = 0, raf = null;
const showing = e => e && e.getClientRects().length > 0;
const tapAll = sel => document.querySelectorAll(sel).forEach(e => { if (showing(e)) e.click(); });
// already on this screen: its own settings in the address, such as a period, are left alone
const onTab = tab => { const [h, q] = tab.split('?'), [ch, cq] = location.hash.split('?'); if (ch !== h) return false; const now = new URLSearchParams(cq || ''); return [...new URLSearchParams(q || '')].every(([k, v]) => now.get(k) === v); };
function build() {
  ui = document.createElement('div'); ui.className = 'tr-wrap moving';
  ui.innerHTML = `<svg class="tr-veil" aria-hidden="true"><defs><mask id="tr-hole"><rect width="100%" height="100%" fill="white"/><rect id="tr-rect" rx="10" fill="black"/></mask></defs><rect class="tr-dim" width="100%" height="100%" mask="url(#tr-hole)"/></svg>
    <div class="tr-ring" aria-hidden="true"></div>
    <section class="tr-tip" role="dialog" aria-modal="true" aria-labelledby="tr-h" aria-describedby="tr-b"><p class="tr-count" id="tr-c"></p><h3 id="tr-h"></h3><p id="tr-b"></p><div class="tr-dots" id="tr-d" aria-hidden="true"></div>
      <div class="tr-nav"><button type="button" class="linkbtn" id="tr-end">End tour</button><span><button type="button" class="pq-btn" id="tr-back">Back</button><button type="button" class="pq-btn cd-go" id="tr-next">Next</button></span></div></section>`;
  document.body.appendChild(ui);
  ui.querySelector('#tr-next').addEventListener('click', () => go(1));
  ui.querySelector('#tr-back').addEventListener('click', () => go(-1));
  ui.querySelector('#tr-end').addEventListener('click', () => end(false));
  ui.addEventListener('keydown', ev => trap(ui.querySelector('.tr-tip'), ev));
}
const onKey = ev => { if (!tour) return; if (ev.key === 'Escape') end(false); if (ev.key === 'ArrowRight') go(1); if (ev.key === 'ArrowLeft') go(-1); };
const onMove = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = null; place(); }); };
export function start(which) {
  name = which; tour = stepsFor(which, isAdmin()); at = -1;
  build();
  document.documentElement.classList.add('ask-open');
  addEventListener('keydown', onKey); addEventListener('resize', onMove); addEventListener('scroll', onMove, true);
  go(1);
}
function end(done) {
  if (!tour) return;
  if (done) setWelcomeSeen(TOUR_VERSION);
  tapAll('.ask .ask-x');
  const again = done && name.startsWith('g-');
  if (again) guided.add(name);
  tour = null; token++; target = null;
  removeEventListener('keydown', onKey); removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true);
  if (ui) ui.remove();
  ui = null;
  document.documentElement.classList.remove('ask-open');
  if (again) return openWelcome({ guide: true });
  if (back && back.isConnected && back.focus) back.focus();
  back = null;
}
function waitFor(sel, mine) {
  return new Promise(ok => { const t0 = performance.now(), look = () => { if (mine !== token) return ok(null); const e = document.querySelector(sel); if (e && (e.getBoundingClientRect().width > 0 || e.closest('.ph-fold'))) return ok(e); if (performance.now() - t0 > 30000) return ok(null); setTimeout(look, 80); }; look(); });
}
async function go(d) {
  if (!tour) return;
  const mine = ++token;
  let i = at + d;
  if (i >= tour.length) return end(true);
  if (i < 0) return;
  for (; i >= 0 && i < tour.length; i += d) {
    const s = tour[i];
    if (!onTab(s.tab)) location.hash = s.tab;
    ui.classList.add('moving');
    const sel = `[data-tour="${s.target}"]${s.within ? ' ' + s.within : ''}`;
    if (s.tap) { const t = await waitFor(s.tap.startsWith('.ask') ? 'body' : s.tap, mine); if (mine !== token) return; if (t) tapAll(s.tap); }
    if (s.open && !showing(document.querySelector(sel))) { const o = await waitFor(s.open, mine); if (mine !== token) return; if (o) o.click(); }
    const e = await waitFor(sel, mine);
    if (mine !== token) return;
    if (e) { at = i; show(s, e); return; }
    console.warn(`tour: skipped "${s.title}", no element ${sel} on ${s.tab}`);   // a target is gone: the tour carries on without it
  }
  if (i >= tour.length) end(true);
}
function show(s, e) {
  document.documentElement.classList.add('ask-open');   // a drawer closing takes this with it
  openFoldsFor(e);
  target = s.whole ? e.closest('section') || e : e;
  if (!target.closest('#nav, .mast, .ask-form')) target.scrollIntoView({ block: target.closest('.pop') ? 'start' : 'center', behavior: reduced() ? 'auto' : 'smooth' });
  ui.querySelector('#tr-c').textContent = `${at + 1} of ${tour.length}`;
  ui.querySelector('#tr-h').textContent = s.title;
  ui.querySelector('#tr-b').textContent = s.body;
  ui.querySelector('#tr-d').innerHTML = tour.map((_, k) => `<i class="${k === at ? 'on' : ''}"></i>`).join('');
  ui.querySelector('#tr-back').hidden = at === 0;
  ui.querySelector('#tr-next').textContent = at === tour.length - 1 ? 'Done' : 'Next';
  ui.classList.remove('moving');
  place();
  setTimeout(place, 500);   // once a smooth scroll has settled
  ui.querySelector('#tr-next').focus();
}
function place() {
  if (!ui || !target) return;
  const tip = ui.querySelector('.tr-tip'), nav = document.querySelector('#nav'), pad = 6, phone = isPhone(), W = innerWidth, H = innerHeight;
  const navH = phone && nav ? nav.getBoundingClientRect().height : 0, isNav = target === nav;
  // what sits at the foot of a drawer or Ask cannot move out from under the sheet, so the sheet goes to the top instead
  const atTop = phone && !!target.closest('.ask-form, .pop-f');
  tip.classList.toggle('at-top', atTop);
  const sheet = phone && !atTop ? tip.offsetHeight + navH : 0;
  const r = target.getBoundingClientRect();
  if (phone) {
    // the sheet stays put; if the target would sit under it, lift the page, and the cut-out stops where the sheet starts
    const room = H - sheet - pad;
    if (!isNav && !target.closest('.mast, .ask') && r.top > room - 40) { window.scrollBy({ top: r.top - Math.max(100, room / 3), behavior: 'auto' }); return requestAnimationFrame(place); }
  }
  const after = target.getBoundingClientRect(), bottom = phone && !isNav ? Math.min(after.bottom, H - sheet - pad) : after.bottom;
  const x = Math.max(2, after.left - pad), y = Math.max(2, after.top - pad), w = Math.min(W - 4 - x, after.width + pad * 2), h = Math.max(24, bottom + pad - y);
  const hole = ui.querySelector('#tr-rect');
  for (const [k, v] of Object.entries({ x, y, width: w, height: h })) hole.setAttribute(k, v.toFixed(1));
  const ring = ui.querySelector('.tr-ring');
  ring.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; ring.style.width = `${w.toFixed(1)}px`; ring.style.height = `${h.toFixed(1)}px`;
  if (phone) { tip.style.transform = ''; tip.style.bottom = atTop ? '' : `${navH}px`; return; }
  const tw = tip.offsetWidth, th = tip.offsetHeight, below = y + h + 12 + th < H, above = y - 12 - th >= 16;
  let left = Math.max(16, Math.min(W - tw - 16, after.left)), top = below ? y + h + 12 : Math.max(16, y - 12 - th);
  // too tall for either: beside it, where there is room
  if (!below && !above) {
    top = Math.max(16, Math.min(H - th - 16, y));
    if (x - tw - 12 >= 16) left = x - tw - 12;
    else if (x + w + 12 + tw <= W - 16) left = x + w + 12;
    else { left = W - tw - 16; top = H - th - 16; }   // it fills the screen: the corner away from its title
  }
  tip.style.transform = `translate(${left.toFixed(1)}px, ${top.toFixed(1)}px)`;
}

// first sign-in: once the first screen is up, unless they have said so already. An automated browser asks for it with ?welcome=1.
export function maybeWelcome() {
  // Skip for now lasts until the next sign-in, and a tab can pass from one person to the next
  if (justSignedIn) { try { sessionStorage.removeItem(SKIP); } catch (e) {} }
  const asked = new URLSearchParams(location.search).get('welcome') === '1';
  if (!asked && (navigator.webdriver || skipped())) return;
  if (welcomeSeen() >= TOUR_VERSION) return;
  openWelcome();
}
