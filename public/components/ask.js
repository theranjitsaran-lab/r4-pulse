// Ask R4 Pulse: a sheet from the bottom on a phone, a panel on the right on a desk. Questions go to
// /api/ask (server/ask.js), which answers only from the app's own figures. The conversation lasts
// while the page is open; nothing is stored.
import { esc } from './data.js';

let sheet = null;
const history = [];

export function openAsk({ suggestions = [], ask = null } = {}) {
  if (!sheet) sheet = build(suggestions);
  else if (suggestions.length) sheet.querySelector('.ask-sugg').innerHTML = suggestions.map(s => `<button type="button">${esc(s)}</button>`).join('');
  document.documentElement.classList.add('ask-open');
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add('is-on'));
  sheet.querySelector('textarea').focus({ preventScroll: true });
  if (ask) sheet.send(ask);
}

function close() {
  sheet.classList.remove('is-on');
  document.documentElement.classList.remove('ask-open');
  setTimeout(() => { if (!sheet.classList.contains('is-on')) sheet.hidden = true; }, 250);
}

function build(suggestions) {
  const el = document.createElement('div');
  el.className = 'ask';
  el.hidden = true;
  el.innerHTML = `<div class="ask-scrim"></div>
    <section class="ask-panel" role="dialog" aria-label="Ask about the figures">
      <header><b>Ask R4 Pulse</b><small>Answers from the app's own figures</small><button class="ask-x" type="button" aria-label="Close">✕</button></header>
      <div class="ask-log" aria-live="polite">
        <div class="ask-sugg">${suggestions.map(s => `<button type="button">${esc(s)}</button>`).join('')}</div>
      </div>
      <form class="ask-form"><textarea rows="1" placeholder="Ask about a customer, a line or the month…" aria-label="Your question"></textarea><button type="submit" aria-label="Send">↑</button></form>
    </section>`;
  document.body.appendChild(el);
  const log = el.querySelector('.ask-log'), ta = el.querySelector('textarea'), form = el.querySelector('form');
  el.querySelector('.ask-x').addEventListener('click', close);
  el.querySelector('.ask-scrim').addEventListener('click', close);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !el.hidden) close(); });
  addEventListener('hashchange', () => { if (!el.hidden) close(); });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

  const send = async q => {
    q = q.trim(); if (!q) return;
    ta.value = '';
    log.insertAdjacentHTML('beforeend', `<p class="ask-q">${esc(q)}</p>`);
    const a = document.createElement('div');
    a.className = 'ask-a is-wait'; a.textContent = 'Reading the figures…';
    log.appendChild(a); log.scrollTop = log.scrollHeight;
    try {
      const r = await fetch('/api/ask', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, history }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'no answer');
      a.classList.remove('is-wait');
      // plain text; a line starting with a dash becomes a list item
      const lines = String(j.answer).split('\n').map(s => s.trim()).filter(Boolean);
      a.innerHTML = lines.map(l => /^[-•]\s/.test(l) ? `<li>${esc(l.replace(/^[-•]\s/, ''))}</li>` : `<p>${esc(l)}</p>`).join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`)
        + `<small>${j.source === 'claude' ? 'Claude, from the app’s figures; every number checked' : 'From the app’s figures'}</small>`;
      history.push({ role: 'user', content: q }, { role: 'assistant', content: j.answer });
    } catch (e) {
      a.classList.remove('is-wait'); a.classList.add('is-err'); a.textContent = `No answer: ${e.message}`;
    }
    log.scrollTop = log.scrollHeight;
  };
  form.addEventListener('submit', e => { e.preventDefault(); send(ta.value); });
  el.querySelector('.ask-log').addEventListener('click', e => { const b = e.target.closest('.ask-sugg button'); if (b) send(b.textContent); });
  el.send = send;
  return el;
}
