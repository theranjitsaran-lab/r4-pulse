// The welcome and the tours, as data. A step is the tab it opens, the data-tour element it points at, a title and a line or two.
// whole: point at the whole section the target sits in. admin: only an admin gets this step, because only an admin has what it points at.
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
const TODAY = '#pulse', ACCOUNTS = '#customers?view=overview', QUOTE = '#pricing', OPS = '#activity', OPPS = '#opportunities';
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
  account: [
    { tab: ACCOUNTS, target: 'moved', title: 'Who moved', body: 'Largest, rising and slipping, each against its own run. Every account is in the table below.' },
    { tab: ACCOUNTS, target: 'margin', title: 'Read the margin', body: 'Tap it for where the margin is made and lost, and the fixes ranked by how realistic they are.' },
    { tab: ACCOUNTS, target: 'account-link', title: 'Open the account', body: 'Tap a name: three points, what it buys and its twelve months.' },
  ],
};
export const allTargets = () => [...new Set(Object.values(TOURS).flat().map(s => s.target))];
export const stepsFor = (which, admin) => TOURS[which].filter(s => !s.admin || admin);
