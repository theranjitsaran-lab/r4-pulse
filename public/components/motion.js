// Motion: entrances only. A card rises into place, a line draws from left to right, a bar grows from
// its start. Numbers are never counted up (CLAUDE.md). Everything waits for the intro to lift, and
// nothing moves under prefers-reduced-motion: the page is simply there.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let release;
const introDone = new Promise(r => { release = r; });
export const whenIntroDone = () => introDone;
export const endIntro = () => release();

// Every [data-rv] inside root rises into place in document order, a stagger apart.
export async function reveal(root) {
  if (!root) return;
  const els = [...root.querySelectorAll('[data-rv]')];
  if (reduced()) { els.forEach(e => e.classList.add('is-in')); return; }
  document.documentElement.classList.add('motion-on');
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
