// The welcome and the tours, as data. A step is the tab it opens, the data-tour element it points at, a title and a line or two.
// whole: point at the whole section the target sits in. admin: only an admin gets this step, because only an admin has what it points at.
// within: point at this part inside the target. open: click this first if what the step points at is not on screen yet. tap: click this every time.
// model/tour.test.js and scripts/tour_check.cjs fail if a target goes missing.
export const TOUR_VERSION = 1;
export const WELCOME = {
  title: 'How R4 is doing, and what to do next',
  text: 'Pulse reads every VCK invoice and every finished Veri-Shred service, and tells you in plain words where to look. It refreshes every working day.',
  boxes: [
    ['See the month', "What we've billed, what's still to bill, and the gap to $1.0M."],
    ['Know each account', "Who's growing, who's slipping, and what each one earns, est."],
    ['Act on it', 'Price a quote, find the next sale, and give it an owner.'],
  ],
  choices: [
    ['full', 'Take the tour', 'Every tab and what the colours mean'],
    ['quote', 'Price a new customer', 'Quote: where it is, what it earns, better ways to price it'],
    ['account', 'Check an account', 'Accounts: margin bands and the breakdown'],
  ],
};
const TODAY = '#pulse', ACCOUNTS = '#customers?view=overview', CROSS = '#customers?view=whitespace', QUOTE = '#pricing', OPS = '#activity', WAREHOUSE = '#numbers?tab=warehouse', OPPS = '#opportunities';
// How each screen works: one walkthrough a screen, on the screen itself
export const GUIDES = [
  ['g-today', 'Today', 'The month, the bill and the gap'],
  ['g-accounts', 'Accounts', 'Who moved, and every account by month'],
  ['g-margin', 'Margins', 'Where the money goes, and how to improve it'],
  ['g-cross', 'Cross-sell', 'What each account could buy, and how it is sized'],
  ['g-quote', 'Quote', 'Price a job from the real routes'],
  ['g-ops', 'Operations', 'Where the trucks went, and where to add stops'],
  ['g-warehouse', 'Warehouse', 'What is in the building, and what could go'],
  ['g-opps', 'Opportunities', 'Who is doing what next'],
  ['g-ask', 'Ask', 'What it can answer, and what it will not do'],
];
export const TOURS = {
  full: [
    { tab: TODAY, target: 'nav', title: 'Five places, one question each', body: 'Today: how is the month going? Accounts: who is growing or slipping? Quote: what should we charge? Operations: where did the trucks go? Opportunities: what do we do next?' },
    { tab: TODAY, target: 'fresh', title: 'How up to date the numbers are', body: 'Check this line first. It says late, in amber, when a feed has not arrived.' },
    { tab: TODAY, target: 'hero', title: 'The answer comes first', body: "One sentence on the month. The bar shows what's priced, what's still to check and the gap to $1.0M. Green is on track and red needs attention: tap a line to see behind it." },
    { tab: ACCOUNTS, target: 'accounts-lit', title: 'Amber means worth a look', body: 'The same lights on every screen. Who moved and every account are below.' },
    { tab: ACCOUNTS, target: 'margin', title: 'Every margin is a button', body: 'Healthy, 35% or more. Normal, 15% or more. Thin, under 15%. Tap it for where the money goes and what would improve it. Margins are estimates, from a cost model still being checked.' },
    { tab: QUOTE, target: 'q-where', title: 'Price where the customer is', body: 'Tap the map or type a postcode. A route that already stops nearby costs far less, and Pulse says so.' },
    { tab: OPS, target: 'ops-period', title: 'Where the trucks went', body: 'Pick a period and compare it with the one before. Thicker lines are the corridors driven most. Warehouse is the tab beside it.' },
    { tab: OPPS, target: 'opp-pipe', title: 'What to do next', body: "One row per account, its best move first. Give it an owner and a status, and everyone sees where it's got to." },
    { tab: OPPS, target: 'gear', admin: true, title: 'Settings are yours, as an admin', body: 'The gear opens the cost assumptions and Users, where you add people and set passwords. Nobody else sees it.' },
    { tab: OPPS, target: 'ask', title: 'Ask in plain words', body: "Ask about the month, any account, cross-sell or a quick quote. It uses only Pulse's figures and changes nothing. Replay this tour, or read the guide, from ? at any time." },
  ],
  quote: [
    { tab: QUOTE, target: 'q-what', whole: true, title: 'What are we quoting?', body: 'Pick the service, how many and how often. The slider shows the price against what other accounts pay.' },
    { tab: QUOTE, target: 'q-where', title: 'Where is it?', body: "Tap the map or type a postcode. Until then it's costed at the book's average stop." },
    { tab: QUOTE, target: 'q-figures', title: 'Read the answer', body: 'Price, revenue, margin a year and margin %: Healthy, Normal or Thin.' },
    { tab: QUOTE, target: 'q-better', whole: true, title: 'Try a better way', body: 'Tap one to try it, and everything above updates.' },
  ],
  'g-today': [
    { tab: TODAY, target: 'hero', title: 'The month in a sentence', body: "What this month's work will bill. The bar shows what's priced, what's still to check and the gap to $1.0M." },
    { tab: TODAY, target: 'hero', within: '.h2-bul', title: 'Three things worth knowing', body: 'Green is on track, red needs attention. Tap a line to see behind it.' },
    { tab: TODAY, target: 't-kpis', title: 'The bill and the gap', body: "Next month's bill as it builds, the last bill and the gap. Tap the last two for the list behind them." },
    { tab: TODAY, target: 't-yest', title: 'The last working day', body: 'Services and routes against a normal day. Tap it for Operations.' },
    { tab: TODAY, target: 't-acts', title: 'Three things to act on', body: "Say if it helped, if you knew, or if it isn't right. To the list puts it on Opportunities." },
    { tab: TODAY, target: 't-lines', title: 'The lines of business', body: 'What each line brought in. Switch the month at the top.' },
    { tab: TODAY, target: 't-map', title: 'Where the work is', body: 'Darker areas had more services. Pick a day or a route to see it driven.' },
  ],
  'g-accounts': [
    { tab: ACCOUNTS, target: 'a-tabs', title: 'Three views of the book', body: 'All accounts, the Month grid to spot a month that stands out, and Cross-sell.' },
    { tab: ACCOUNTS, target: 'accounts-lit', title: 'What matters first', body: 'Who is slipping, how the month went and the cross-sell, in plain words.' },
    { tab: ACCOUNTS, target: 'a-tiles', title: 'The tiles', body: 'Tap Slipping or Cross-sell to open that list.' },
    { tab: ACCOUNTS, target: 'a-lob', title: 'The book by line', body: 'Each line of business this month. Tap one for its accounts.' },
    { tab: ACCOUNTS, target: 'moved', title: 'Who moved', body: "The last three months against each account's own year before: largest, rising and slipping." },
    { tab: ACCOUNTS, target: 'a-table', within: '.dt-tools', title: 'Find and filter', body: 'Search by name, or filter by line, size or trend. On a phone the filters are under More.' },
    { tab: ACCOUNTS, target: 'a-table', within: '.dt-t', title: 'Every account, by month', body: "In $K, adding to the total at the foot. A month is shaded when it's more than 25% and $5K from that row's average." },
    { tab: ACCOUNTS, target: 'a-table', within: 'tr.dt-child', open: '[data-tour="a-table"] tbody tr[data-i] td:first-child', title: 'Open a row', body: 'Tap a row for its lines of business, month by month. Tap again to close it.' },
    { tab: ACCOUNTS, target: 'account-link', title: 'Open the account', body: 'Tap a name for its page: three points, its chart, what would improve it and every job.' },
  ],
  'g-margin': [
    { tab: ACCOUNTS, target: 'margin', title: 'Every margin is a button', body: 'Healthy, Normal or Thin, with the cut-offs in the key above the table. The switch shows it in % or $K.' },
    { tab: ACCOUNTS, target: 'pop', within: '.pop-b > :first-child', open: '[data-tour="margin"]', title: 'What it keeps', body: 'Tapping it opens this: what the account pays, what it costs to serve and what is left, est.' },
    { tab: ACCOUNTS, target: 'md-where', title: 'Where it is made and lost', body: 'Line by line, or by type of cost. Tap a line for every job behind it.' },
    { tab: ACCOUNTS, target: 'md-fixes', title: 'How to improve it', body: 'Fixes ranked by how realistic they are. They overlap, so they do not add up.' },
    { tab: ACCOUNTS, target: 'pop', within: '.pop-f', title: 'Act on it', body: 'Ask why, or send the top fix to Opportunities with an owner.' },
  ],
  'g-cross': [
    { tab: CROSS, target: 'xs-lit', title: 'Where the money is', body: 'The total, and the first account worth a conversation. Always est.' },
    { tab: CROSS, target: 'xs-key', title: 'What the figures mean', body: 'Plain: it buys that line. A + is what comparable accounts spend. Highlighted: it buys, but low for its size.' },
    { tab: CROSS, target: 'xs-table', title: 'One row per account', body: 'One column per service line, with the most room to grow first.' },
    { tab: CROSS, target: 'xs-table', within: '.cd-tiles', open: '[data-tour="xs-table"] tbody tr[data-i] td:first-child', title: 'Open a row for its room to grow', body: 'What it has not bought yet, plus what is low for its size. Pulse has opened the first row for you.' },
    { tab: CROSS, target: 'xs-table', within: '.cd-lines', title: 'Line by line', body: 'What it buys against comparable accounts. It is the median, never the best: a ceiling, not a forecast.' },
    { tab: CROSS, target: 'xs-table', within: '.cd-acts', title: 'Take it further', body: 'Ask why, price it in Quote, or send it to Opportunities with an owner.' },
  ],
  'g-quote': [
    { tab: QUOTE, target: 'q-figures', title: 'The answer stays in view', body: 'Price, revenue, and margin in $ and %. They update as you change anything below.' },
    { tab: QUOTE, target: 'q-what', whole: true, title: '1. What are we quoting?', body: 'Pick the customer and service, how many and how often. The slider shows the price against what others pay.' },
    { tab: QUOTE, target: 'q-where', whole: true, title: '2. Where is it?', body: 'Type a postcode or tap the map. Real route days within three miles set the cost; if none are near, it is its own trip.' },
    { tab: QUOTE, target: 'q-goes', title: '3. Where the price goes', body: 'What each cost is made of, and three points on the result. A quote is a guide: about a third out on any one account.' },
    { tab: QUOTE, target: 'q-better', whole: true, title: '4. Better ways to price it', body: 'Tap one to try it, and everything above updates.' },
    { tab: QUOTE, target: 'q-build', title: 'Build the quote', body: 'Add the lines and save it. Saved quotes stay here.' },
  ],
  'g-ops': [
    { tab: OPS, target: 'ops-period', title: 'Pick the period', body: 'Day to Year, and tick Compare to set it against the one before. Everything below follows.' },
    { tab: OPS, target: 'o-lit', title: 'What changed', body: 'Three points on the period, in plain words.' },
    { tab: OPS, target: 'o-tiles', title: 'The tiles', body: 'The work in the period, and how dense it was.' },
    { tab: OPS, target: 'o-map', tap: '#rt-layer [data-l="routes"]', title: 'Where the trucks went', body: 'Each corridor once, thicker and darker the more route days it had. Likely rounds: the driven order was never recorded.' },
    { tab: OPS, target: 'o-map', tap: '#rt-layer [data-l="add"]', title: 'Where to add customers', body: 'The map has switched view: where one more stop would save most, because the trucks already pass.' },
    { tab: OPS, target: 'o-map', tap: '#rt-layer [data-l="cost"]', title: 'Costly to serve', body: 'Areas costing most to reach for what they bill.' },
    { tab: OPS, target: 'o-routes', tap: '#rt-layer [data-l="routes"]', title: 'Route by route', body: 'Services per route day is the measure: more work on the same trucks is better. Tap a route to see it on the map.' },
    { tab: OPS, target: 'o-dense', title: 'Is the work getting denser?', body: 'Two years of services per route day.' },
    { tab: OPS, target: 'o-costly', title: 'The costly areas', body: 'Tap a row for its moves, and send one to Opportunities.' },
    { tab: OPS, target: 'o-bands', title: 'Distance from the yard', body: 'How far the work is from 35th Street, in bands.' },
  ],
  'g-warehouse': [
    { tab: WAREHOUSE, target: 'w-lit', title: 'The building in three points', body: 'Warehouse is the tab beside Routes in Operations.' },
    { tab: WAREHOUSE, target: 'w-tiles', title: 'The tiles', body: 'Boxes held, eligible to shred, over ten years old, and not on the bill.' },
    { tab: WAREHOUSE, target: 'w-grid', title: 'Who fills it', body: 'One square for a set number of boxes, largest accounts first. Tap a group for its name.' },
    { tab: WAREHOUSE, target: 'w-elig', title: 'What could be shredded', body: 'Past retention review, with no permanent or hold flag. A one-off fee, and storage lost after it.' },
    { tab: WAREHOUSE, target: 'w-nb', title: 'Boxes not on the bill', body: 'Boxes held at current accounts against the latest storage bill.' },
  ],
  'g-opps': [
    { tab: OPPS, target: 'p-lit', title: 'Where to start', body: 'What has no owner yet, the biggest money and what to raise first.' },
    { tab: OPPS, target: 'p-tiles', title: 'What it adds up to', body: "A year, one-offs, and how much has an owner. An account's moves overlap, so it counts once." },
    { tab: OPPS, target: 'opp-pipe', title: 'Where the list has got to', body: 'Open, Contacted, Agreed, Won and Lost, each account once.' },
    { tab: OPPS, target: 'p-kinds', title: 'What kind of money it is', body: 'Win back, cross-sell, price gaps, rate rounds and overdue boxes. Tap one to filter the list.' },
    { tab: OPPS, target: 'p-table', within: 'tbody tr[data-i]', title: 'One row per account', body: 'Its best move, what it is worth and how sure. Give it an owner, a status and a date for the next step.' },
    { tab: OPPS, target: 'p-table', within: 'tr.dt-detail', open: '[data-tour="p-table"] tbody tr[data-i] td:first-child', title: 'Its other moves', body: 'Tap a row for every move, best first, each with one action.' },
  ],
  'g-ask': [
    { tab: TODAY, target: 'ask', tap: '.ask .ask-x', title: 'Ask is always here', body: 'Top of every screen, and in the drawers.' },
    { tab: TODAY, target: 'ask-can', open: '#mast-ask', title: 'What it can answer', body: 'The month, any account, who moved, cross-sell, Opportunities, and a quick quote.' },
    { tab: TODAY, target: 'ask-can', within: 'p:last-child', title: 'What it will not do', body: 'It only reads. Every number is checked against Pulse, and if Pulse does not hold something, it says so.' },
    { tab: TODAY, target: 'ask-sugg', title: 'Not sure what to ask?', body: 'These change with the screen you are on. Tap one to try it.' },
    { tab: TODAY, target: 'ask-form', title: 'Or type your own', body: 'Name one account or one line for the best answer: "What else could Metra buy?"' },
  ],
  account: [
    { tab: ACCOUNTS, target: 'moved', title: 'Who moved', body: 'Largest, rising and slipping, each against its own run. Every account is in the table below.' },
    { tab: ACCOUNTS, target: 'margin', title: 'Read the margin', body: 'Tap it for where the margin is made and lost, and the fixes ranked by how realistic they are.' },
    { tab: ACCOUNTS, target: 'account-link', title: 'Open the account', body: 'Tap a name: three points, what it buys and its twelve months.' },
  ],
};
export const allTargets = () => [...new Set(Object.values(TOURS).flat().map(s => s.target))];
export const stepsFor = (which, admin) => TOURS[which].filter(s => !s.admin || admin);
