// The opening: R4's mark draws itself, "Pulse" slides in beside it, a pulse line runs across, and the
// whole sheet lifts away to the screen underneath. Once a browser session, never under reduced
// motion, and a tap or key skips it. It stays at least MIN ms and until the first screen is drawn.
// The mark is the R4 tile from the masthead; a real logo file replaces MARK and nothing else.
import { endIntro } from './motion.js';

const MIN = 1700;
const KEY = 'r4-intro-seen';
const MARK = `<svg class="intro-mark" viewBox="0 0 64 64" aria-hidden="true">
  <rect class="im-tile" x="2" y="2" width="60" height="60" rx="16" pathLength="1"/>
  <text class="im-r4" x="32" y="41" text-anchor="middle">R4</text></svg>`;
// a heartbeat: flat, a small rise, the spike, the dip, flat again
const BEAT = 'M0 30 H150 l10 -6 l8 6 H196 l8 -24 l10 46 l9 -30 l7 8 H300 l10 -5 l8 5 H460';

const seen = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
const mark = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* private window */ } };

export function playIntro() {
  const skip = matchMedia('(prefers-reduced-motion: reduce)').matches || seen();
  if (skip) { endIntro(); return { ready() {} }; }
  mark();
  const el = document.createElement('div');
  el.className = 'intro';
  el.setAttribute('role', 'presentation');
  el.innerHTML = `<div class="intro-in">
      <div class="intro-lock">${MARK}<span class="intro-word">Pulse</span></div>
      <svg class="intro-beat" viewBox="0 0 460 60" preserveAspectRatio="none" aria-hidden="true"><path d="${BEAT}" pathLength="1"/></svg>
      <p class="intro-line">R4 Services · Reliable · Resourceful · Responsive · Reasonable</p>
    </div>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('intro-on');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));

  const t0 = performance.now();
  let drawn = false, gone = false;
  const leave = () => {
    if (gone) return; gone = true;
    el.classList.add('is-leaving');
    document.documentElement.classList.remove('intro-on');
    endIntro();
    const bye = () => el.remove();
    el.addEventListener('transitionend', e => { if (e.target === el) bye(); });
    setTimeout(bye, 1200);
  };
  const tryLeave = () => { if (drawn && performance.now() - t0 >= MIN) leave(); };
  el.addEventListener('click', leave);
  addEventListener('keydown', leave, { once: true });
  setTimeout(tryLeave, MIN);
  setTimeout(leave, 6000);        // never hold the screen hostage to a slow API
  return { ready() { drawn = true; tryLeave(); } };
}
