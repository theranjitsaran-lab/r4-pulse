// Router. Each screen is a module in /views that exports render(main, data).
// Nothing here knows what a screen looks like.
const SCREENS = ['pulse', 'activity', 'pricing', 'calls', 'margin'];
const main = document.getElementById('main');
if (!main) throw new Error('no #main');

function current() {
  const h = (location.hash || '#pulse').slice(1).split('/')[0];
  return SCREENS.includes(h) ? h : 'pulse';
}

async function show() {
  const name = current();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('on', a.dataset.screen === name));
  main.innerHTML = '';
  let data;
  try {
    const r = await fetch(`/api/${name}`);
    if (r.status === 401) { location.href = '/login'; return; }
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.statusText);
    data = j.data;
    const asof = document.getElementById('asof');
    if (asof && j.snapshotAt) asof.textContent = 'data as of ' + new Date(j.snapshotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch (e) {
    main.innerHTML = `<div class="empty"><h2>${name[0].toUpperCase() + name.slice(1)} has no data yet</h2>${e.message}<br><br>This screen reads <code>/api/${name}</code>. Write <code>queries.${name}</code> and run <code>npm run snapshot</code>.</div>`;
    return;
  }
  try {
    const mod = await import(`/views/${name}.js`);
    mod.render(main, data);
  } catch (e) {
    main.innerHTML = `<div class="empty"><h2>${name[0].toUpperCase() + name.slice(1)} is not built yet</h2>Data is there. The view module <code>/views/${name}.js</code> is missing or threw: ${e.message}</div>`;
  }
}

addEventListener('hashchange', show);
show();
