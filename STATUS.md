# STATUS.md

Where the build stands. Update it at the end of each piece of work.

## Where the work happens

- **Code, tests, commits:** Claude Code cloud sessions on `theranjitsaran-lab/r4-pulse`, pushed to
  `main`.
- **Anything that touches the live database** (applying `sql/`, `npm run snapshot`,
  `npm run kpi:rebuild`, checking figures): Claude Code on Theran's PC, which is on the
  DigitalOcean allow-list. Cloud sessions cannot connect and should not try. The PC cannot push:
  Theran types `! git push origin main`.
- **Tests in the cloud:** `npm run test:offline` (25 of 25), plus a local Postgres in the
  container with fake tables, used for queries, the snapshot and the app role.

## Built (redesign, 26 October 2026, customer-centred)

- **Home:** the October bill so far (core, like-for-like); work done per working day; main
  customers on the move; levers to grow EBITDA, each opening its customer list; margin by line;
  team; core by month.
- **Customers:** lists (this week's conversations, main, slipping, price gaps, missed rate rounds,
  margin, all). The customer page has a 24-month chart, margin by line opening to its priced lines,
  prices against the book, signals with right / not right, and **work orders and visits**
  (`/api/customer/:id`).
- **Pricing (Anne)** and **Routes (Mike)**.
- **Calls log:** `app.calls_log` (`sql/app_schema.sql`), `/api/log`.
- **Deploy:** `render.yaml`, `scripts/app_role.js` (the read-only app login, self-checking),
  `scripts/app_users.js`, `scripts/apply_sql.js`, `docs/DEPLOY.md`.

## Built (route to $1.0m, 26 October 2026)

- **Home:** this month's bill and next month's building; the bridge to $1.0m (`components/levers.js`);
  customers moving in dollars a month.
- **Customers:** Cross-sell grid (`components/whitespace.js`), Main customers as a month grid, Price
  gaps counting storage. Customer page: "Not bought yet" card; each work order opens to its cost build.
- **Pricing:** the price on one track; invoiced against the book, worst first.
- 18 of 18 tests offline, including the bridge reconciling to its lists (`model/levers.test.js`).

## Built (margin drill, cross-sell explained, Routes, overdue boxes, 26 October 2026)

- **Margin drill as one path:** Home margin row → Margin (all · thin · below cost) → account → line
  (its cost worked out, priced lines, its own orders) → order cost build, with a breadcrumb.
  Finding: 88 of the 92 accounts under 15% are visit-heavy, so the delivery-route question (Mike)
  decides most of the margin list.
- **Cross-sell explainer:** each dashed figure opens how it was assumed (with its comparables), why
  this account (its own data), what R4 has done before (from the next snapshot), and a draft playbook.
- **Overdue boxes:** destruction once against the storage it ends, per account.
- **Routes:** the day in a sentence, thin routes named, the long way round (miles from Census ZCTA
  centroids, `public/data/zcta.json`).
- **For the PC:** `scripts/freshness.js` (read-only) and three new snapshot queries: postcodes over
  twelve months, boxes stored by month, and the first month each account bought each line.

## Finishing pass (26 October 2026)

An independent review as Trisha, Anne and Mike found twelve problems; all fixed and pushed:
one measure of movement everywhere (last three months against the account's own twelve, stopped
accounts apart); one figure per price move with unit mismatches flagged; Pricing with a real
new-customer default, a visit picker and a provisional verdict; Home opening with a verdict;
margin separating sure losses from route costs under review; stale data said on Home and Routes;
plain English; dark-mode contrast and focus; gzip (Home 4.1 MB to 314 KB). 21 of 21 tests.
Walkthrough for Theran: https://claude.ai/artifact/698mNKV9ZVzDdXdgwwWTn4

## Chart-led Home, tables, projection, route drill (26 October 2026)

- **Home:** opens with a paragraph Claude writes from the page's own figures (`server/summary.js`,
  `components/summary.js`). Any number not on the figure sheet, or no `ANTHROPIC_API_KEY`, and the
  template is shown instead. Then one chart, **where the month lands**: bills building by working
  day, last month and last year beside it, a projection cone to month end (`components/projection.js`).
  The band is backtested on the last twelve months, leave one out, once the snapshot carries fifteen
  months of daily work; until then it is labelled untested. Bookings × completion is shown as a check.
- **Customer tables** (`components/custtable.js`; Home preview and Customers › Up and down): last
  month against the month before and a year ago, the year to date against last year's, and this
  month so far ◇ (done services × the account's own value per service), sortable, Falling · Rising ·
  All. The month grid moved to Customers › Month grid.
- **Order drill → the route that day** (`components/routemap.js`): a map of the route on postcode
  centres, each stop's share of the route day (travel by detour, time on site by visit, summing to the
  route day exactly), the account's costliest stop, other routes within 2 miles and 3 days with the
  saving, and the cost a service with more customers on the same visit.
- **Snapshot queries added** (need one PC snapshot): `pulse.dailyDone` (15 months), `activity.accountDays`
  and `activity.routeHistory`, `customerDrill.routes` (live per account). 25 of 25 tests.

## Next

1. On the PC: `node scripts/freshness.js` (why does the data stop on 6 October?), then
   `npm run snapshot`, commit the fixtures, push.
2. Deploy: `docs/DEPLOY.md`. Before that, Theran decides on putting Render's outbound addresses
   on Trusted Sources.
3. Theran tries it, then Trisha on her phone: can she say where the month lands and which two levers
   matter most, within 30 seconds?
4. Theran passes on the team's process; the draft playbook is rewritten in their words.

## Open

- **The daily push stopped on 8 October 2026** (`scripts/freshness.js`, 26 October). Every source
  table was loaded once on 8 October with nothing added since; done work stops on 5 October. The push
  runs on a machine at R4: check its scheduled task's last run and its log from 9 October.

- **Boxes level of the drill:** rule 9 settled 26 October 2026. Units are box counts, so barcodes
  need VCK's work-order detail table in the daily push. The customer page shows it as pending.
- **Route costs under review:** delivery routes are missing from the route volumes (Mike).
- Driver pay rates; Citadel agreement and the Access fall (Anne); Iron Mountain figures are off
  until they are sourced.
- **Design iteration** with Theran, now that the full build is in.
