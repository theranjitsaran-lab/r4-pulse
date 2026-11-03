// What phones share. phoneFold wraps secondary content behind "Show …" at phone width; on a desk it is not there at all (display:
// contents, public/components/phone.css). Folded content keeps its width, so a chart drawn inside it draws at the right size. A tap on
// anything in a chart with a <title> shows that title, because a phone has no hover.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
export const phoneFold = (label, html) => `<div class="ph-fold"><button type="button" class="ph-show" aria-expanded="false" data-label="${esc(label)}">Show ${esc(label)}</button><div class="ph-body">${html}</div></div>`;
function toggle(f, open) {
  f.classList.toggle('open', open);
  const b = f.querySelector(':scope > .ph-show');
  if (b) { b.setAttribute('aria-expanded', String(open)); b.textContent = `${open ? 'Hide' : 'Show'} ${b.dataset.label}`; }
}
// open whatever fold holds this element, for the tour
export function openFoldsFor(el) {
  for (let f = el && el.closest && el.closest('.ph-fold:not(.open)'); f; f = f.parentElement && f.parentElement.closest('.ph-fold:not(.open)')) toggle(f, true);
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('.ph-show');
    if (b) { const f = b.parentElement; toggle(f, !f.classList.contains('open')); return; }
    if (!isPhone()) return;
    const mark = ev.target.closest && ev.target.closest('svg rect, svg path, svg circle, svg g'), t = mark && mark.querySelector(':scope > title');
    if (!t || ev.target.closest('a, button, [role=button]')) return;
    let tip = document.querySelector('.tap-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tap-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.textContent = t.textContent;
    tip.classList.add('on');
    clearTimeout(tip.t); tip.t = setTimeout(() => tip.classList.remove('on'), 3000);
  });
}
