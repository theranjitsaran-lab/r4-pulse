// The cross-sell explainer: one account, one line it doesn't buy yet. Three parts:
//   how the figure was assumed (the basis and the comparable accounts behind the median),
//   why this account (the trigger in its own data),
//   how it is usually sold (a draft playbook, to be rewritten in R4's words).
// Opened from a dashed cell on the Cross-sell grid and from the customer page's "Not bought yet".
import { money0, moneyK } from '/components/chart.js';
import { titleCase, esc } from '/components/data.js';
import { LINES } from '/components/whitespace.js';


const n = v => Math.round(v || 0).toLocaleString('en-US');

// why this account: what its own data says
function trigger(key, row, call) {
  const boxes = row.boxes >= 500 ? `${n(row.boxes)} boxes` : null;
  switch (key) {
    case 'shred': return call && call.boxes_review_overdue > 0
      ? `${n(call.boxes_review_overdue)} of its ${n(row.boxes)} boxes are past their retention review date. It is paying every month to store records it could destroy; R4 would bill the destruction once and the storage on those boxes would stop.`
      : `${boxes || 'Its boxes'} in storage and no destruction bought in twelve months. Every records programme retires boxes eventually; this one retires them somewhere else, or not at all.`;
    case 'bin': return `${boxes ? `It stores ${boxes} with R4` : `It spends ${moneyK(row.total)} a year with R4`} but has no shred bins in its offices, so its day-to-day paper goes to another shredder or into the recycling.`;
    case 'itad': return `It spends ${moneyK(row.total)} a year with R4 and buys no hardware or media destruction. Its laptops, drives and phones are retired somewhere.`;
    case 'handling': return `${boxes || 'Its boxes'} in storage and almost no retrievals or refiles: the records are dormant. That is usually a destruction conversation as much as a retrieval one.`;
    case 'movement': return `${boxes || 'It stores boxes'} and pays for no deliveries or pickups, so new boxes reach the warehouse some other way.`;
    case 'storage': return `It buys ${row.spend && row.spend.bin > 0 ? 'shredding' : 'services'} from R4 (${moneyK(row.total)} a year) but stores no records with us. Its archive is with someone else or in its own basement.`;
  }
  return '';
}

// how it is usually sold: a draft, to be rewritten in the team's words
const PLAY = {
  shred: { who: 'Anne, with the account\'s records manager', open: n => `${n} of your boxes have passed their retention date. We can certify their destruction and stop the storage charge on them.`, needs: 'The client\'s sign-off on the retention list, a destruction quote, then Mike books the pull. Destroying boxes ends their storage, so price the destruction knowing what it replaces.' },
  bin: { who: 'The account owner, at the next visit or review', open: () => 'We already look after your records. We can put locked shred bins in your offices and empty them on a schedule.', needs: 'A walk round the offices for the bin count, a quote, and a route slot from Mike near the account\'s other stops.' },
  itad: { who: 'Anne, ideally ahead of an office move or hardware refresh', open: () => 'When you next retire laptops or drives, we can collect them and certify their destruction.', needs: 'A per-device quote and a collection date. Ask when their next refresh is due.' },
  handling: { who: 'Anne, at the account review', open: () => 'Your records have barely moved this year. Shall we review what still needs keeping?', needs: 'Retrievals follow use and can\'t be sold directly; dormant boxes are the opening for a retention review and destruction.' },
  movement: { who: 'The account owner', open: () => 'We can deliver new boxes and collect full ones on a regular schedule.', needs: 'A delivery rate and a route slot from Mike.' },
  storage: { who: 'Anne or Trisha, at a senior level', open: () => 'We already shred for you. Your archive could sit in our warehouse, indexed and retrievable the same day.', needs: 'A box count, a storage quote, and the intake run planned with Mike.' },
};

// R4's own record: accounts that already bought from R4 and later started this line.
function history(H, key, names) {
  if (!H || !H.firsts || key === 'storage') return '';
  const plus = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
  const from = plus(H.dataStart, 3);
  const made = H.firsts.filter(f => f.family === key && f.account_first && f.first >= from && f.first > plus(f.account_first, 2));
  const mon = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (!made.length) return `<h3>What R4 has done before</h3><p>No existing account has started buying it since ${mon(from)}. This would be a first.</p>`;
  const fy = made.map(f => f.first_year || 0).sort((a, b) => a - b), med = fy[fy.length >> 1];
  const recent = made.slice().sort((a, b) => b.first.localeCompare(a.first)).slice(0, 5);
  return `<h3>What R4 has done before</h3><p>${made.length} existing account${made.length === 1 ? '' : 's'} started buying it since ${mon(from)}, spending a median ${money0(med)} in their first year. Most recently: ${recent.map(f => `<a href="#customer/${f.level1}" style="color:var(--brand);text-decoration:none">${esc(titleCase(names.get(f.level1) || 'Account ' + f.level1))}</a> (${mon(f.first)})`).join(', ')}.</p>`;
}

export function openExplainer({ row, key, call, H, names }) {
  const line = LINES.find(x => x.key === key), c = row.cells[key];
  const name = titleCase(row.customer), lname = line.name === 'ITAD' ? 'ITAD' : line.name.toLowerCase();
  const play = PLAY[key];
  const peers = c.peers || [];
  const byBoxes = line.by === 'boxes';
  const d = document.createElement('dialog');
  d.className = 'xpl';
  d.innerHTML = `<div class="in">
    <div class="top"><h2>${esc(name)} doesn't buy ${esc(lname)}. Comparable accounts would spend about ${moneyK(c.opp)} a year ◇</h2><button class="x" aria-label="Close">×</button></div>
    <h3>Where the figure comes from</h3>
    <p>${esc(c.basis)}. It is the median comparable, not the best one, and never more than the account spends today.</p>
    ${peers.length ? `<table class="peers"><thead><tr><th>Comparable accounts that buy it (${c.peerCount} in all, largest shown)</th>${byBoxes ? '<th>Boxes</th><th>Spend a year</th><th>Per 1,000 boxes</th>' : '<th>Other spend</th><th>Spend a year</th><th>Per $ of other</th>'}</tr></thead><tbody>
      ${peers.map(p => `<tr><td><a href="#customer/${p.level1}">${esc(titleCase(p.customer))}</a></td>${byBoxes ? `<td>${n(p.boxes)}</td><td>${money0(p.spend)}</td><td>${money0(p.per1000)}</td>` : `<td>${moneyK(p.other)}</td><td>${money0(p.spend)}</td><td>${Math.round(p.ratio * 100)}¢</td>`}</tr>`).join('')}
    </tbody></table>` : ''}
    <h3>Why this account</h3>
    <p>${esc(trigger(key, row, call))}</p>
    ${history(H, key, names || new Map())}
    <h3>How it is usually sold <span class="draft">draft</span></h3>
    <dl class="play">
      <dt>Who raises it</dt><dd>${esc(play.who)}</dd>
      <dt>Opening line</dt><dd>“${esc(play.open(call && call.boxes_review_overdue > 0 ? n(call.boxes_review_overdue) : 'Some'))}”</dd>
      <dt>What it needs</dt><dd>${esc(play.needs)}</dd>
    </dl>
    <p class="sub" style="margin-top:var(--sp-3)">The playbook is a draft until the team's own process replaces it.${H ? '' : ' The next snapshot adds the cross-sells R4 has actually made, line by line.'}</p>
  </div>`;
  document.body.appendChild(d);
  const opener = document.activeElement;
  const close = () => { d.close(); d.remove(); if (opener && opener.focus) opener.focus(); };
  d.querySelector('.x').addEventListener('click', close);
  d.addEventListener('click', ev => { if (ev.target === d) close(); });
  d.addEventListener('cancel', () => { d.remove(); if (opener && opener.focus) setTimeout(() => opener.focus()); });
  d.querySelectorAll('.peers a, .in p a').forEach(a => a.addEventListener('click', () => close()));
  d.showModal();
}
