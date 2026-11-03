// Settings › Users, for an admin: who can sign in, and setting a password, changing access or switching someone off.
// Passwords go straight to server/users.js and are never shown or kept here.
import { esc } from './data.js';
import { whoAmI } from './access.js';

const nameOf = n => { const s = String(n || ''); return s ? s[0].toUpperCase() + s.slice(1) : ''; };
const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'That did not save.'); return j.data; });

export async function drawUsers(el) {
  if (!el) return;
  let D;
  try { const r = await fetch('/api/users', { credentials: 'same-origin' }); if (!r.ok) { el.hidden = true; return; } D = (await r.json()).data; }
  catch (e) { el.innerHTML = '<div class="pending">The users did not load. Try again in a minute.</div>'; return; }
  const me = String(whoAmI() || '').toLowerCase();
  const paint = (say = '') => {
    el.innerHTML = `<div class="h2-ch"><h2>Users</h2><small>Only an admin sees Settings. Everyone else sees every other screen and can work the lists.</small></div>
      ${D.storable ? '' : '<p class="st-warn">Changes cannot be saved until the setup SQL has been applied.</p>'}
      <ul class="us-list">${D.users.map(u => { const self = u.name.toLowerCase() === me; return `<li class="us-row${u.active ? '' : ' off'}" data-u="${esc(u.name)}">
        <div class="us-who"><b>${esc(nameOf(u.name))}</b><small>${self ? 'You, ' : ''}${u.active ? '' : 'switched off, '}${u.at && u.who ? `last changed by ${esc(nameOf(u.who))}, ${esc(String(u.at).slice(0, 10))}` : 'from the starting list'}</small></div>
        <label class="us-f">Access <select data-role aria-label="Access for ${esc(nameOf(u.name))}" ${self ? 'disabled' : ''}><option value="user"${u.role === 'user' ? ' selected' : ''}>User</option><option value="admin"${u.role === 'admin' ? ' selected' : ''}>Admin</option></select></label>
        <label class="us-f">New password <input type="password" data-pass autocomplete="new-password" minlength="${D.minPassword}" aria-label="New password for ${esc(nameOf(u.name))}"></label>
        <span class="us-acts"><button type="button" class="pq-btn" data-set>Set password</button><button type="button" class="pq-btn" data-rewelcome>Show welcome again</button>${self ? '' : `<button type="button" class="pq-btn" data-active="${u.active ? 0 : 1}">${u.active ? 'Switch off' : 'Switch on'}</button>`}</span>
      </li>`; }).join('')}</ul>
      <form class="us-add" autocomplete="off"><h3>Add a user</h3>
        <label class="us-f">Name <input name="name" required autocomplete="off" pattern="[A-Za-z0-9._\\-]{2,30}" title="2 to 30 letters or numbers, with no spaces"></label>
        <label class="us-f">Password <input name="password" type="password" required minlength="${D.minPassword}" autocomplete="new-password"></label>
        <label class="us-f">Access <select name="role"><option value="user">User</option><option value="admin">Admin</option></select></label>
        <button class="pq-btn cd-go" type="submit">Add user</button>
      </form>
      <p class="us-msg" role="status">${esc(say)}</p>
      <p class="src">A password needs at least ${D.minPassword} characters. Setting one signs that person out everywhere. Tell them it yourself; Pulse sends no email.</p>`;
  };
  const act = async (fn, ok) => { const m = el.querySelector('.us-msg'); m.textContent = 'Saving…'; try { D.users = await fn(); paint(ok); } catch (e) { m.textContent = e.message; } };
  paint();
  el.addEventListener('change', ev => { const s = ev.target.closest('[data-role]'); if (!s) return; const n = s.closest('[data-u]').dataset.u; act(() => post(`/api/users/${encodeURIComponent(n)}`, { role: s.value }), `${nameOf(n)}'s access changed.`); });
  el.addEventListener('click', ev => {
    const row = ev.target.closest('[data-u]'); if (!row) return;
    const n = row.dataset.u;
    if (ev.target.closest('[data-set]')) { const p = row.querySelector('[data-pass]').value; if (!p) { el.querySelector('.us-msg').textContent = 'Type the new password first.'; return; } act(() => post(`/api/users/${encodeURIComponent(n)}`, { password: p }), `${nameOf(n)}'s password is set.`); }
    if (ev.target.closest('[data-rewelcome]')) act(() => post(`/api/users/${encodeURIComponent(n)}/welcome`, {}), `${nameOf(n)} will see the welcome at their next sign-in.`);
    const a = ev.target.closest('[data-active]'); if (a) act(() => post(`/api/users/${encodeURIComponent(n)}`, { active: a.dataset.active === '1' }), `${nameOf(n)} is switched ${a.dataset.active === '1' ? 'on' : 'off'}.`);
  });
  el.addEventListener('submit', ev => { ev.preventDefault(); const f = new FormData(ev.target), name = String(f.get('name') || '').trim(); act(() => post('/api/users', { name, password: f.get('password'), role: f.get('role') }), `${nameOf(name)} added.`); });
}
