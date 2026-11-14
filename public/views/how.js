// How Pulse works: what each screen is for, how to read it, and where its figures come from, in plain words, so the working
// stays off the screens themselves. Each screen's detail folds away. Box codes come from the storage data; the rest is fixed text.
import * as Fmt from '/components/format.js';
import { esc } from '/components/data.js';
import { LABELS } from '/components/metrics.js';
import { isAdmin } from '/components/access.js';
import { start } from '/components/tour.js';

const GUIDE = { 'Getting around': 'full', Today: 'g-today', Accounts: 'g-accounts', 'Cross-sell': 'g-cross', Quote: 'g-quote', Operations: 'g-ops', Opportunities: 'g-opps', Ask: 'g-ask' };

// a screen: its title, the question it answers, then groups of [heading, lines]
const SCREENS = () => [
  { title: 'Getting around', line: 'The five tabs, the top bar and the colours.', groups: [
    ['The five tabs', [
      'Today: how is the month going? Accounts: who is growing or slipping, and what does each earn? Quote: what should we charge? Operations: where did the trucks go? Opportunities: what do we do next?',
      'Nearly everything opens something. A figure on Today opens a list, a row in a list opens the account, and an account opens its lines and jobs.',
    ]],
    ['The top bar', [
      '? brings back the welcome and the tours. Ask opens the chat. The line underneath says how up to date the data is, and turns amber when a feed is late.',
      isAdmin() ? 'The gear opens Settings, which only admins see: the cost assumptions, and Users, where you add people, set passwords and show someone the welcome again.' : 'Settings is for admins only. Ask an admin to change a cost assumption, reset your password or show you the welcome again.',
    ]],
    ['Colours and marks', [
      'Red is below cost or down. Amber is worth a look. Blue is up. A green light means on track. A colour always comes with a word or a figure.',
      'In a month table a cell is shaded only when it is more than 25% and $5K from that row\'s own 12-month average: red below, blue above.',
      '"est." means modelled rather than measured, and charts hatch those figures. Three small squares show how sure a figure is: three is the account\'s own billing or the book median, two is comparable accounts of its kind, one is the whole book or only a few accounts.',
    ]],
  ] },
  { title: 'Today', line: 'How the month is going, and the gap to $1.0M.', groups: [
    ['How to read it', [
      'The headline is the month so far: this month\'s storage, confirmed on its bill, plus the work done so far priced at each customer\'s own rates (est.), against last month at the same point. The bar shows that solid, where the month is heading if the pace holds faint, what is still to check, and $1.0M a month at the end.',
      'The three lines below it are the things most worth knowing. Tap one to see behind it.',
      'The first tile is the month so far, with the forecast faint beneath it; tap it for every customer and service line behind it, each list adding to the figure. Then the last bill and the gap to $1.0M on the forecast. Below are the last working day against normal, the last weeks, three things to act on, the lines of business and the map of where the work is.',
    ]],
    ['What you can do', [
      'On each thing to act on, tell Pulse it was useful, you knew it already, or it isn\'t right. To the list puts it on Opportunities.',
    ]],
    ['Where the figures come from', [
      `${LABELS.invoiced} means posted invoices, dated by invoice date. The month reconciles to QuickBooks within about 0.4%.`,
      'Storage bills in advance and service in arrears, so a month\'s bill is that month\'s storage and the month before\'s work.',
      'Last month at the same point: its storage whole, and its work scaled to the same share of its working days.',
      'Core is storage and service. Citadel is held apart from every total and can run negative, because credits are carried as they fall.',
      'Next month\'s bill is finished work from Veri-Shred, priced at each account\'s own latest price, or the median of R4\'s accounts if it has never bought that service. Jobs far larger than anything the account has bought are left out and named as jobs to check. Flat bin fees, deliveries and pound shredding only appear when the run posts.',
    ]],
  ] },
  { title: 'Accounts', line: 'Who is growing or slipping, and what each one earns.', groups: [
    ['All accounts', [
      'The summary and tiles come first, then the book by line and who moved: the largest, those rising and those slipping, each the last three months against its own 12-month average, or, with the switch, the 3 months before or the same 3 months last year.',
      'Tap a name and the drawer says why it moved: each line\'s part, whether it was one-off work (bought in 3 or fewer of the last 12 months, or a month over 3× usual) or regular work, and for regular work how much was volume and how much price. Then one move to send to Opportunities with a note.',
      'In the table, choosing a line of business makes every figure that line only. Units shows boxes stored, bin services done (from Veri-Shred, by the month of the work), boxes moved, delivery trips, devices or hours.',
      'The table has every account by the month it was billed, in $K, largest first, and adds to the invoiced total at its foot. The switch changes how many months show.',
      'Tap the arrow on a row for its lines, a name for the account page, a month for its invoices. Find an account by name, filter by line of business, size or trend, save a view, choose columns or download the table.',
    ]],
    ['Month grid', [
      'The same accounts, month by month, with a switch between storage and service, for spotting a month that stands out.',
    ]],
    ['What the words mean', [
      `Slipping: ${LABELS.slipping}.`,
      `Active: ${LABELS.activeAccounts.replace(/^active accounts /, '').replace(/[()]/g, '')}.`,
      '"The book" is what R4\'s own accounts pay: under the book means under their median. R4\'s price list is not in the data yet.',
    ]],
    ['Margins', [
      'Every account shows a margin: Healthy, Normal or Thin, with the cut-offs in the key above the table. The switch shows it in % or $K.',
      'Tap a margin for what it keeps, where the money is made and lost, and the fixes ranked by how realistic they are. Send the top fix to Opportunities from there.',
      'Each cost is built from a named rate, and all are provisional until the ledger is restated over the same twelve months, so margins always say "est.". Route costs are shared by visits and minutes on real route days. Nothing is a percentage of revenue.',
    ]],
    ['The account page', [
      'Three points on the account, its figures and its chart. Tap a month for its invoices. Below are what would improve it and every line, and a line opens every job behind it.',
    ]],
  ] },
  { title: 'Cross-sell', line: 'In Accounts: what each account buys, and what it could buy.', groups: [
    ['How to read it', [
      'One row per account, one column per service line. The key above the table says what each kind of figure means: a plain figure is twelve months of what it already buys, and the others are what it could buy, or a line it buys but low for its size.',
      'Room to grow adds the two: not bought yet, and low for its size.',
    ]],
    ['How each gap is sized', [
      'Retrieval, delivery and destruction, for an account that stores: the median spend per 1,000 boxes among storers of 500 boxes or more who buy that line, times this account\'s boxes.',
      'Storage, shred bins and ITAD: the median share of spend on that line among accounts of the same size that buy it as an add-on, under 40% of what they spend, applied to this account\'s other spend.',
      'It is the median comparable account, never the best, and a gap is never larger than what the account spends in total today. So it is a ceiling to explore, not a forecast. R4\'s own accounts and placeholders are left out.',
    ]],
    ['What you can do', [
      'Tap a row for three points, one chart for each line, how each gap was sized, who it was compared with and how sure that is. From there, ask about it, price it in Quote or send it to Opportunities.',
    ]],
  ] },
  { title: 'Quote', line: 'What to charge, and what it would earn.', groups: [
    ['How to use it', [
      'Say what you are quoting and how many, then where it is: tap the map or type a postcode. The four figures at the top update as you go.',
      'Where the price goes shows what each cost is made of. Four ways to price it offer alternatives; tap one to try it. Build the lines into a quote and save it.',
    ]],
    ['How it is costed', [
      'A new stop is costed from real route days within three miles. If none are near, it is its own trip from the yard. Until you choose a place, it is the average stop.',
      'Back-tested against existing accounts, this came within 11% in total but about a third out on any one account. So treat a quote as a guide.',
    ]],
  ] },
  { title: 'Operations', line: 'Where the trucks went, and how to plan them.', groups: [
    ['Routes', [
      'Choose a period from Day to Year, and tick Compare to set it against the one before. The summary, tiles and map all follow.',
      'The map has three views. Routes draws each corridor once, thicker and darker the more route days it had; with Compare on, green grew, amber shrank and grey is the period before. Where to add customers shows where one more stop would save most. Costly to serve shows the areas that cost most to reach for what they bill.',
      'Below are the routes in the period, whether the work is getting denser over two years, the costly areas, each opening its moves, and distance from the yard. Day shows each route against its norm, the week and what is booked ahead.',
    ]],
    ['Where the figures come from', [
      `${LABELS.veriShred} Booked work is not counted until it is done.`,
      `Normal for a day is that weekday's median over 8 weeks; ${LABELS.normalRoute} is the route's own 8-week median.`,
      'The order drivers made their stops in was never recorded, so a route on a map is the shortest likely round between its postcodes, along the main roads. A far area\'s cost is its share of the real route days it was served on, by minutes; its revenue is the bin and ITAD work billed at that site.',
      'Distances are miles from the 35th Street yard, measured from the centre of each postcode, or along main roads where a route is drawn. Drivers\' GPS was never captured.',
    ]],
    ['Warehouse', [
      'The tab beside Routes. Boxes in storage are those VCK shows as currently held, all at one location in Chicago. Boxes out, withdrawn or destroyed are not counted until R4 confirms what their codes mean.',
      'Eligible boxes are past their retention review, with no permanent or hold flag. "Not billed" compares boxes held with those on the latest storage bill.',
      'An account counts as dormant when it has no invoice in the last twelve months. R4\'s own accounts and placeholders are left out.',
    ]],
  ] },
  { title: 'Opportunities', line: 'What to do next, and who is doing it.', groups: [
    ['How to work the list', [
      'One row per account, its best move first. Give it an owner, a status and a date for the next step, and everyone sees where it has got to. Tap a row for its other moves.',
      'Open, Contacted, Agreed, Won and Lost show where the list has got to, counting each account once, at its move furthest along. Today, Cross-sell, Operations and the margin drawer all send to this same list.',
    ]],
    ['What each kind of move is', [
      'Win back: still billing but down on its own run, sized at the drop. Cross-sell: a line it could buy, sized at what comparable accounts spend. Price gap: paying under the book\'s median, sized at the difference. Rate round: sized at the typical 8%. Overdue boxes: past retention, a one-off that needs the client\'s sign-off.',
      '$ a year is each account\'s best move, once, because moves on one account overlap and do not add up. One-offs have their own column and never add to the yearly figure.',
    ]],
  ] },
  { title: 'Ask', line: 'Questions in your own words, answered from Pulse\'s figures.', groups: [
    ['What it can answer', [
      'The month, next month\'s bill, the gap to $1.0M and the lines of business.',
      'Any account: its last 13 months, its margin by line, its prices against the book, what else it could buy, and what its bins cost on the road.',
      'Who is largest, rising or slipping; cross-sell; Opportunities, by kind or status; boxes eligible to shred; where one more stop would save most; saved quotes; margin by line; and the company P&L.',
      'A quick quote: name a service, how many a year, and a postcode or an account.',
    ]],
    ['What it won\'t do', [
      'It only reads. It can\'t change an owner, a status or a price, or send anything.',
      'It uses only what Pulse holds. If something isn\'t there, it says so and says where it would come from. Every number in an answer is checked against Pulse\'s figures, and an answer that can\'t pass is refused rather than guessed.',
    ]],
    ['Getting a good answer', [
      'Name one account or one line, such as "Why is City of Chicago down?" or "What else could Metra buy?". Ask opens with suggestions for the screen you are on.',
    ]],
  ] },
];

export async function render(main, S) {
  if (!main) return;
  const types = new Map();
  for (const r of (S && S.rows) || []) types.set(r.boxtype, (types.get(r.boxtype) || 0) + (r.boxes || 0));
  const total = [...types.values()].reduce((t, v) => t + v, 0);
  const codes = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  main.innerHTML = `<div class="how">
    <h1>How Pulse works</h1>
    <p class="how-lede">Refreshed daily from VCK (billing and pricing) and Veri-Shred (operations). Tap a screen for how to use it and where its figures come from, or have Pulse show you on the screen.</p>
    ${SCREENS().map(s => `<section class="h2-card"><details class="how-sec"><summary><h2>${esc(s.title)}</h2><small>${esc(s.line)}</small></summary>
      ${GUIDE[s.title] ? `<button type="button" class="pq-btn cd-go how-show" data-guide="${GUIDE[s.title]}">Show me on the screen</button>` : ''}
      ${s.groups.map(([h, ps]) => `<h3>${esc(h)}</h3>${ps.map(p => `<p>${esc(p)}</p>`).join('')}`).join('')}
    </details></section>`).join('')}
    ${codes.length ? `<section class="h2-card"><details class="how-sec"><summary><h2>Box types, as VCK holds them</h2><small>The share of boxes; R4 has still to name these codes.</small></summary><p>${codes.map(([k, v]) => `${esc(k || 'none')} ${Fmt.pct(v / total)}`).join(', ')}</p></details></section>` : ''}
  </div>`;
  main.querySelector('.how').addEventListener('click', e => { const b = e.target.closest('[data-guide]'); if (b) start(b.dataset.guide); });
}
