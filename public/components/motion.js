// Motion: entrances only. A card rises into place, a line draws from left to right, a bar grows from
// its start. Numbers are never counted up (CLAUDE.md). Everything waits for the intro to lift, and
// nothing moves under prefers-reduced-motion: the page is simply there.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let release;
const introDone = new Promise(r => { release = r; });
export const whenIntroDone = () => introDone;
// this page load is a fresh sign-in (server/auth.js), read before intro.js tidies the address
export const justSignedIn = typeof location !== 'undefined' && new URLSearchParams(location.search).has('signin');
export const endIntro = () => release();

// Every [data-rv] inside root rises into place in document order, a stagger apart.
export async function reveal(root) {
  if (!root) return;
  const els = [...root.querySelectorAll('[data-rv]')];
  if (reduced()) { els.forEach(e => e.classList.add('is-in')); return; }
  document.documentElement.classList.add('js', 'motion-on');
  els.forEach((e, i) => e.style.setProperty('--i', Math.min(i, 5)));   // the first six stagger; the rest arrive with the sixth
  await introDone;
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(e => e.classList.add('is-in'))));
}

// A chart's marks drawn from left to right: a clip that opens over the plot.
export function drawIn(svg, { x = 0, y = 0, w, h } = {}) {
  if (!svg || reduced()) return;
  const id = 'clip' + Math.random().toString(36).slice(2, 8);
  const NS = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(NS, 'defs'), cp = document.createElementNS(NS, 'clipPath'), r = document.createElementNS(NS, 'rect');
  cp.id = id; r.setAttribute('x', x); r.setAttribute('y', y - 20); r.setAttribute('width', w); r.setAttribute('height', h + 40); r.setAttribute('class', 'draw-clip');
  cp.appendChild(r); defs.appendChild(cp); svg.prepend(defs);
  svg.querySelectorAll('.c-line, .c-end, .c-area').forEach(n => n.setAttribute('clip-path', `url(#${id})`));
  introDone.then(() => requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add('is-in'))));
}

// The entrance Home plays, once a session for each page. Later visits, and reduced motion, get the end state as drawn.
export function firstPlay(key) {
  if (reduced()) return false;
  try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1'); return true; } catch (e) { return false; }
}
const easeOut = t => 1 - Math.pow(1 - t, 3);
// a figure runs up to itself: the real text is there first, stays for a screen reader, and is put back at the end
function countUp(e) {
  const final = e.textContent, m = final.match(/^(\D*)(\d[\d,]*(?:\.\d+)?)(.*)$/); if (!m) return;
  const to = Number(m[2].replace(/,/g, '')), dp = (m[2].split('.')[1] || '').length, comma = m[2].includes(','), delay = +(e.dataset.delay || 0), dur = +(e.dataset.dur || 900);
  const show = v => { const n = dp ? v.toFixed(dp) : String(Math.round(v)); e.textContent = m[1] + (comma ? Number(n).toLocaleString('en-US') : n) + m[3]; };
  e.setAttribute('aria-label', final); show(0);
  let from = null;
  const step = now => { if (from === null) from = now + delay; const t = Math.min(1, Math.max(0, (now - from) / dur)); show(to * easeOut(t)); if (t < 1 && e.isConnected) requestAnimationFrame(step); else e.textContent = final; };
  requestAnimationFrame(step);
}
export function playIn(root) {
  const go = el => { el.classList.add('on'); el.querySelectorAll('[data-count]').forEach(countUp); };
  if (typeof IntersectionObserver !== 'function') { root.querySelectorAll('[data-in]').forEach(go); return; }
  const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { go(x.target); io.unobserve(x.target); } }), { threshold: 0.15 });
  root.querySelectorAll('[data-in]').forEach(el => io.observe(el));
}
