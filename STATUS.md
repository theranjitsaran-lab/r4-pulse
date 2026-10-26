# STATUS.md

Where the build stands. Update it at the end of each piece of work.

## Where the work happens

- **Code, tests, commits:** Claude Code cloud sessions on `theranjitsaran-lab/r4-pulse`, pushed to
  `main`.
- **Anything that touches the live database** (applying `sql/`, `npm run snapshot`,
  `npm run kpi:rebuild`, checking figures): Claude Code on Theran's PC, which is on the
  DigitalOcean allow-list. Cloud sessions cannot connect and should not try. The PC cannot push:
  Theran types `! git push origin main`.
- **Tests in the cloud:** `npm run test:offline` (16 of 16), plus a local Postgres in the
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

## Next

1. Deploy: `docs/DEPLOY.md`. Before that, Theran decides on putting Render's outbound addresses
   on Trusted Sources.
2. Theran tries it, then Trisha on her phone: can she say where the month lands and which two levers
   matter most, within 30 seconds?
3. Next PC snapshot: net boxes per account per month from `storage_rate_hist` (storage volume).

## Open

- **Boxes level of the drill:** rule 9 settled 26 October 2026. Units are box counts, so barcodes
  need VCK's work-order detail table in the daily push. The customer page shows it as pending.
- **Route costs under review:** delivery routes are missing from the route volumes (Mike).
- Driver pay rates; Citadel agreement and the Access fall (Anne); Iron Mountain figures are off
  until they are sourced.
- **Design iteration** with Theran, now that the full build is in.
