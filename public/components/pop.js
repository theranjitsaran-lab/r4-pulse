// The explain pop-out: a panel from the right on a desk, a sheet from the bottom on a phone. One open
// at a time; Escape, the scrim, the close button or moving screen closes it. Content is HTML the
// caller has escaped. A question in `ask` adds a button that hands it to the Ask sheet (app.js).
let el = null;

export function openPop({ title, sub = '', html, ask = null }) {
  if (!el) el = build();
  el.querySelector('.pop-t').textContent = title;
  el.querySelector('.pop-s').textContent = sub;
  el.querySelector('.pop-b').innerHTML = html;
  const a = el.querySelector('.pop-ask');
  a.hidden = !ask; a.dataset.q = ask || '';
  el.hidden = false;
  document.documentElement.classList.add('ask-open');
  requestAnimationFrame(() => el.classList.add('is-on'));
  el.querySelector('.pop-b').scrollTop = 0;
}

export function closePop() {
  if (!el || el.hidden) return;
  el.classList.remove('is-on');
  document.documentElement.classList.remove('ask-open');
  setTimeout(() => { if (!el.classList.contains('is-on')) el.hidden = true; }, 250);
}

function build() {
  const d = document.createElement('div');
  d.className = 'ask pop';
  d.hidden = true;
  d.innerHTML = `<div class="ask-scrim"></div>
    <section class="ask-panel" role="dialog" aria-label="Explain this figure">
      <header><b class="pop-t"></b><small class="pop-s"></small><button class="ask-x" type="button" aria-label="Close">✕</button></header>
      <div class="pop-b"></div>
      <footer class="pop-f"><button class="pop-ask" type="button">Ask Claude why ›</button></footer>
    </section>`;
  document.body.appendChild(d);
  d.querySelector('.ask-x').addEventListener('click', closePop);
  d.querySelector('.ask-scrim').addEventListener('click', closePop);
  d.querySelector('.pop-b').addEventListener('click', e => { if (e.target.closest('a[href^="#"]')) closePop(); });
  d.querySelector('.pop-ask').addEventListener('click', e => { const q = e.currentTarget.dataset.q; closePop(); dispatchEvent(new CustomEvent('open-ask', { detail: { ask: q } })); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });
  addEventListener('hashchange', closePop);
  return d;
}
