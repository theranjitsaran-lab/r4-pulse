// Who is signed in. Everyone signed in sees modelled costs; only an admin sees Settings. It fails closed: until /api/me has answered, or
// if it fails, nobody sees a cost.
import { OWNERS } from './opps.js';
let me = { name: null, role: null, costs: false, welcome: 0 };

export async function loadAccess() {
  try { const r = await fetch('/api/me', { credentials: 'same-origin' }); if (r.ok) me = await r.json(); } catch {}
  for (const n of me.owners || []) if (!OWNERS.includes(n)) OWNERS.push(n);   // a new user can own a move
  return me;
}
export const costsVisible = () => !!me.costs;
export const isAdmin = () => me.role === 'admin';
export const whoAmI = () => me.name;
export const myRole = () => me.role;
// the first screen after sign-in, for someone who has not asked for one
export const landing = () => me.role === 'billing' ? '#opportunities' : null;
export const NOT_READY = 'Cost to serve not ready yet — price judged against the book only.';
export const welcomeSeen = () => me.welcome || 0;
export function setWelcomeSeen(version) { me.welcome = version; fetch('/api/me/welcome', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) }).catch(() => {}); }
