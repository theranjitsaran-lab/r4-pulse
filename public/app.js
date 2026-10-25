// Router. Each screen is a module in /views exporting render(main, data, params); it fetches any
// further data it needs through components/data.js. Routes:
//   #pulse                      Home
//   #customers?view=slipping    a customer list (views in views/customers.js)
//   #customer/<level1>          one customer
//   #pricing, #activity         the tools
import { getJson } from '/components/data.js';

const ROUTES = {
  pulse:     { view: 'pulse',     api: 'pulse',     nav: 'pulse' },
  customers: { view: 'customers', api: 'customers', nav: 'customers' },
  customer:  { view: 'customer',  api: 'customers', nav: 'customers' },
  pricing:   { view: 'pricing',   api: 'pricing',   nav: 'pricing' },
  activity:  { view: 'activity',  api: 'activity',  nav: 'activity' },
  calls:     { view: 'customers', api: 'customers', nav: 'customers', params: { view: 'conversations' } },
};
const main = document.getElementById('main');
if (!main) throw new Error('no #main');

function parse() {
  const raw = (location.hash || '#pulse').slice(1);
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (id) params.id = decodeURIComponent(id);
  return { name: ROUTES[name] ? name : 'pulse', params };
}

let seq = 0;
async function show() {
  const my = ++seq;
  const { name, params } = parse();
  const route = ROUTES[name];
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.screen === route.nav));
  main.innerHTML = '<div class="loading">Loading…</div>';
  let data;
  try {
    const j = await getJson(route.api, { envelope: true });
    data = j.data;
    const asof = document.getElementById('asof');
    if (asof && j.snapshotAt) asof.textContent = 'Data as of ' + new Date(j.snapshotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch (e) {
    if (e.status === 401) { location.href = '/login'; return; }
    if (my !== seq) return;
    main.innerHTML = `<div class="empty"><h2>No data yet</h2>${e.message}. This screen reads <code>/api/${route.api}</code>; run <code>npm run snapshot</code>.</div>`;
    return;
  }
  try {
    const mod = await import(`/views/${route.view}.js`);
    if (my !== seq) return;           // the user moved on while this loaded
    main.innerHTML = '';
    await mod.render(main, data, Object.assign({}, route.params, params));
    if (my === seq) window.scrollTo(0, 0);
  } catch (e) {
    if (my !== seq) return;
    main.innerHTML = `<div class="empty"><h2>This screen is not built yet</h2>${e.message}</div>`;
  }
}

addEventListener('hashchange', show);
show();
