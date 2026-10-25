// The drill container: company → half → family → customer → work order → line → box. Each level
// is a render function; opening one pushes it, the breadcrumb goes back, and going back returns
// to the scroll position you left.
//
//   const d = drill(el, { title, render(body, d) })
//   d.open({ title, render(body, d) })     from inside a level, e.g. on a row click
//   d.back(n)                              back n levels (default 1)
'use strict';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function drill(el, root) {
  if (!el) return null;
  const stack = [];
  el.innerHTML = '<nav class="drill-crumbs" aria-label="Drill path"></nav><div class="drill-body"></div>';
  const crumbs = el.querySelector('.drill-crumbs'), body = el.querySelector('.drill-body');
  const api = {
    open(level) { if (stack.length) stack[stack.length - 1].scroll = window.scrollY; stack.push(level); draw(); window.scrollTo(0, el.offsetTop - 12); },
    back(n = 1) { while (n-- > 0 && stack.length > 1) stack.pop(); draw(); window.scrollTo(0, stack[stack.length - 1].scroll || 0); },
    depth: () => stack.length,
  };
  function draw() {
    crumbs.innerHTML = stack.map((l, i) => i === stack.length - 1
      ? `<span class="here">${esc(l.title)}</span>`
      : `<button data-i="${i}">${esc(l.title)}</button><span class="sep">›</span>`).join('');
    body.innerHTML = '';
    stack[stack.length - 1].render(body, api);
  }
  crumbs.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-i]');
    if (b) api.back(stack.length - 1 - +b.dataset.i);
  });
  stack.push(root);
  draw();
  return api;
}
