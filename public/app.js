// Router. Each screen is a module in /views exporting render(main, data, params); it fetches any
// further data it needs through components/data.js. Routes:
//   #pulse                      Home
//   #customers?view=slipping    a customer list (views in views/customers.js)
//   #customer/<level1>          one customer
//   #pricing, #activity         the tools
import { getJson } from '/components/data.js';
import { playIntro } from '/components/intro.js';

const ROUTES = {
  pulse:     { view: 'pulse',     api: 'pulse',     nav: 'pulse' },
  home2:     { view: 'home2',     api: 'pulse',     nav: 'pulse' },   // the second design, on trial
  customers: { view: 'customers', api: 'customers', nav: 'customers' },
  customer:  { view: 'customer',  api: 'customers', nav: 'customers' },
  pricing:   { view: 'pricing',   api: 'pricing',   nav: 'pricing' },
  activity:  { view: 'activity',  api: 'activity',  nav: 'activity' },
  calls:     { view: 'customers', api: 'customers', nav: 'customers', params: { view: 'conversations' } },
};
const main = document.getElementById('main');
if (!main) throw new Error('no #main');

// ?design=1: the baseline grid and element boxes (public/design.css), for checking spacing
if (new URLSearchParams(location.search).get('design') === '1') {
  document.documentElement.classList.add('design-overlay');
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/design.css">');
}

function parse() {
  const raw = (location.hash || '#pulse').slice(1);
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (id) params.id = decodeURIComponent(id);
  return { name: ROUTES[name] ? name : 'pulse', params };
}

const intro = playIntro();   // the R4 mark, once a session; lifts when the first screen is drawn

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
    if (asof && j.snapshotAt) asof.textContent = 'Read ' + new Date(j.snapshotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch (e) {
    if (e.status === 401) { location.href = '/login'; return; }
    if (my !== seq) return;
    main.innerHTML = `<div class="empty"><h2>No data yet</h2>${e.message}. This screen reads <code>/api/${route.api}</code>; run <code>npm run snapshot</code>.</div>`;
    intro.ready();
    return;
  }
  try {
    const mod = await import(`/views/${route.view}.js`);
    if (my !== seq) return;           // the user moved on while this loaded
    main.innerHTML = '';
    await mod.render(main, data, Object.assign({}, route.params, params));
    if (my === seq) window.scrollTo(0, 0);
    intro.ready();
  } catch (e) {
    if (my !== seq) return;
    main.innerHTML = `<div class="empty"><h2>This screen is not built yet</h2>${e.message}</div>`;
    intro.ready();
  }
}

// The design-preview service (render.yaml, r4-pulse-design) says so in the header, so nobody takes
// it for the team's tool.
fetch('/health').then(r => r.json()).then(h => {
  const right = document.querySelector('.mast-right');
  if (!h.preview || !right) return;
  const tag = document.createElement('span');
  tag.className = 'preview-tag';
  tag.textContent = 'Design preview';
  right.prepend(tag);
}).catch(() => {});

addEventListener('hashchange', show);
show();
