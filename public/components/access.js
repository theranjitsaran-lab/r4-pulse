// Who is signed in, and whether they see modelled costs. While the cost model is not final, margins,
// advice built on them and the price P&L are for admins only; Settings has the switch that releases them.
// It fails closed: until /api/me has answered, or if it fails, nobody sees a cost.
let me = { name: null, role: null, costs: false };

export async function loadAccess() {
  try { const r = await fetch('/api/me', { credentials: 'same-origin' }); if (r.ok) me = await r.json(); } catch {}
  return me;
}
export const costsVisible = () => !!me.costs;
export const isAdmin = () => me.role === 'admin';
export const whoAmI = () => me.name;
export const myRole = () => me.role;
// the first screen after sign-in, for someone who has not asked for one
export const landing = () => me.role === 'billing' ? '#customers' : null;
export const NOT_READY = 'Cost to serve not ready yet — price judged against the book only.';
