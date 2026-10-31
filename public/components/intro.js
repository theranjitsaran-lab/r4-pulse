// The opening: on a white sheet, a green scan line reads R4's barcode logo into view, "Pulse" slides in
// beside it, a pulse line runs across, and the sheet lifts away to the screen underneath. Once a
// day, never under reduced motion, and a tap or key skips it. It stays at least MIN ms
// and until the first screen is drawn. The logo is R4's own (public/brand/r4-logo.png, from
// r4services.com); a vector from R4 replaces that file and nothing else.
import { endIntro } from './motion.js';

const MIN = 900;
const KEY = 'r4-intro-day';
const MARK = `<span class="intro-mark"><img src="/brand/r4-logo.png" alt="R4 Services"><i class="intro-scan"></i></span>`;
// a heartbeat: flat, a small rise, the spike, the dip, flat again
const BEAT = 'M0 30 H150 l10 -6 l8 6 H196 l8 -24 l10 46 l9 -30 l7 8 H300 l10 -5 l8 5 H460';

// once a day, not once a browser session: the second visit of the morning goes straight to the figures
const today = () => new Date().toISOString().slice(0, 10);
const seen = () => { try { return localStorage.getItem(KEY) === today(); } catch { return false; } };
const mark = () => { try { localStorage.setItem(KEY, today()); } catch { /* private window */ } };

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
  setTimeout(leave, 2500);        // never hold the screen hostage to a slow API
  return { ready() { drawn = true; tryLeave(); } };
}
