# CLAUDE.md

Read this first, every session. Then `DECISIONS.md`, and `DESIGN.md` for the visual system. Then `docs/` for the brief, the logic pack,
the data addendum and the margin spec — those four hold every number the screens show.

## What this is

**R4 Pulse**: a four-screen management tool for **R4 Services**, a Chicago records-management and
destruction firm with about 35 staff and $10.16m of revenue. Built by StepsGrowth. It reads a
DigitalOcean Postgres database refreshed daily from two source systems: **VCK** (billing and
pricing, SQL Server) and **Veri-Shred** (operations, FoxPro).

**The owner's target:** $1.0m a month in core storage and service revenue, Citadel ITAD held
apart. Core is $646,519 on a six-month average (March to August 2026, invoice date, posted
invoices only). Every screen is organised around that gap.

**Three users, three rhythms.** Trisha Rooney (CEO, phone first, weekly). Mike Kelly (operations,
desktop, 06:30 daily). Anne Sterne (billing and pricing, desktop, mid-task). Each screen is for one
of them. Nothing is for all three.

## The four screens

*Rebuilt 26 October 2026 around Trisha's number and the customer. The 7 October screens (Pulse,
Activity, Calls, Margin as separate screens) and the design PNGs in `docs/design/` are superseded;
DECISIONS.md "The route to $1.0m and cross-sell" holds what was settled.*

| Screen | Route | Owner | What it is |
|---|---|---|---|
| **Home** | `#pulse` | Trisha | A headline and three tappable bullets · next month's bill building, last bill, gap · this month's work against last month's, the last 13 weeks · lines of business (month, 3 months, YTD) · largest, rising, slipping five · cross-sell, the density map, shredding's effect on revenue (`views/home2.js`; the 26 October Home is at `#classic`) |
| **Customers** | `#customers?view=` | Anne, Trisha | Overview (KPI band, the book by line, who moved, then every account by month billed: the 50 largest and all the others, adding to invoiced core, each row opening to its lines; `accountmonths` and `accountlines` queries) · Month grid · Cross-sell. The Margin sub-tab is retired: its route stays for the admin drill and old links, and Drop and Renegotiate become a Reprice opportunity once costs are signed off |
| **Opportunities** | `#opportunities` (the last tab) | Anne, Trisha | One row per account, largest first: its best move with one reason, $ a year, one-off, owner, status; a tap opens its other moves, each with an opener, an owner and a status in `app.opportunity` (`views/opps.js`, `components/opps.js`). The old Slipping, Price gaps, Rate rounds, Overdue boxes and This week lists are folded into it, kept for old links |
| **Customer page** | `#customer/<id>` | Anne | Four figures · 24-month chart with axes, a tap on a month for its invoices · margin bridge and lines · what would improve it · open opportunities; folded below: not bought yet, prices against the book, signals; where it is served and its visits. A line opens the drill drawer (`components/margindrawer.js`), also from a Margin cell on Accounts: account → line and every job in twelve months, uncapped → one job's cost build and route. `accountJobs` in `margin.js` shares each line's cost to its jobs, so jobs plus what is not on any job add to the line; the levers (`marginLevers`) are sized one by one and never added |
| **Pricing** | `#pricing` (the Quote tab) | Anne | Four figures that stay in view (price, revenue, margin $ and %, labelled from Settings) · on the left, 1. what are we quoting, with time on site, on a run or a dedicated vehicle for deliveries, and the price on the real band, and 2. where is it: the map, pin, ring, nearest route day · on the right, 3. where the price goes: the bar, what is in each cost (`costNotes`) and three points written from computed fields (`quoteFacts`, Claude's version checked) · 4. four ways to price it (`quoteOptions`) · the quote builder (saved to `app.quote`) · folded: every account, the cost working · invoiced against the book |
| **Warehouse** | `#numbers?tab=warehouse`, linked from Operations | Mike | Boxes by retention state and location. The Money page was taken out on 3 November 2026 (Theran); `#numbers` goes to Accounts, and `view/numbers` still works its figures out for footing |
| **How it's calculated** | `#how` | Everyone | Where the figures come from, in plain words; the working stays off the screens (`views/how.js`) |
| **Settings** | `#settings` (gear in the masthead) | Theran, Mike | The cost model's assumptions, editable by admins with who and when (`app.setting`, `server/settings.js`): speed, minutes a stop and a service, the travel share, whether box deliveries are placed on the shred routes by location · the rates, read-only |
| **Operations** | `#activity?p=&cmp=&lens=` (Warehouse beside it at `#numbers?tab=warehouse`) | Mike | To plan from. A period switch, Day to Year, default 3 months, and compare with the period before · three lit points and four tiles · the map, three lenses: Routes (each corridor once, thicker and darker by route days, grew green, shrank amber, over the period before in grey), Where to add customers, Costly to serve · routes in the period · is the work getting denser, two years · costly to serve, each row a drawer with its moves and Send to Opportunities · distance from the yard. Day keeps the day: by route against its norm, the week, booked ahead (`views/activity.js`, `components/opsdata.js`, `view/operations`) |

Every figure shown in two places comes from one function (`components/levers.js`, `margin.js`,
`whitespace.js`) and `model/levers.test.js` holds them together. Every number on screen goes through `components/format.js` (`money()`, `pct()`, `change()`), which `model/format.test.js` holds to the exact output; chart coordinates and the server's and `model/rates.js`'s own text do not. A margin reads one way everywhere: `marginBand` in `components/margin.js`, Healthy, Normal, Thin from the cut-offs on Settings. Every list is `components/datatable.js`: 13px tabular figures on 30px rows, months with YTD and 12 months, 50 rows then Show all, and `npm run footing` reads what it draws. Tokens are in `public/tokens.css`.

## Stack

Node, Express, vanilla JS, inline SVG. **No React, no framework, no chart library.** One font file:
R4's Average Sans, self-hosted in `public/fonts/` for the "Pulse" wordmark and the intro only; everything else is the system sans. Postgres via `pg`. Deployed on Render. The API gzips its JSON with Node's zlib.

If a task seems to need a library, it doesn't — write the SVG.

## Repo layout

```
/server      db.js, api.js, auth.js, log.js, queries.js, snapshot.js, kpi_rebuild.js
/sql         views/*.sql, kpi_rebuild.sql, model_schema.sql, app_schema.sql
/model       rates.js, rates.test.js, levers.test.js   ← the cost model and the agreement tests
/scripts     PC-side scripts: freshness, app_role, app_users, apply_sql, measurements
/public
  tokens.css, app.css, app.js (router)
  components/  chart.js, table.js, strip.js, margin.js, levers.js, whitespace.js, explain.js, data.js
  views/       home2.js (Home), pulse.js (the old Home, #classic), customers.js, custoverview.js, customer.js, pricing.js, activity.js (Routes)
  data/zcta.json                                  ← postcode centroids (US Census, public)
  data/basemap.json                               ← the Chicagoland outline under the maps (US Census; scripts/build_basemap.js)
  data/roadnet.json                               ← main roads as a network, for road miles and the drawn path (US Census; scripts/build_roadnet.js)
/fixtures    snapshotted JSON for offline work (npm run snapshot, on the PC)
/docs        brief, logic pack, data addendum, margin spec, DEPLOY.md
```

## How to work

- **One file per task.** If a prompt names a file, touch that file only.
- **Fixtures, not the database,** for anything visual. `npm run snapshot` refreshes them.
- **Guard every module:** `const el = document.getElementById('x'); if (!el) return;`
- **Commit before large changes.** Run `npm test` after anything in `/model`.
- **Hoist shared helpers to the top of a module.** A `const` used before its declaration took
  the whole page down once (`Cannot access 'RM' before initialization`).

## The cost model — rules

`model/rates.js` is the single source of truth. Pricing and Margin both import it. There is no
second formula and no literal cost number anywhere else.

Every rate carries its derivation and a confidence flag (`measured` · `observed` · `partial` ·
`estimate` · `assumed`). Every displayed cost line traces to a named rate. Nothing is a percentage
of revenue.

Rates are GL pools ÷ the database's twelve-month volumes (September 2025 to August 2026), all
**provisional** until the GL is restated over the same twelve months: facilities $0.0994/box/month ·
handling $7.53 a movement · shred plant $0.1509/lb · route day $450.62 · driver hour $32.49 · 3.27
customer visits a route day · 5.80 services a visit · bin pounds from the account's own S5, else by
bin size (estimate) · 28.4 lb a shred box (estimate) · 1.5 lb an ITAD unit (estimate) · travel
share of a route day 40% (**the one assumption**, exposed as a slider that recomputes Pricing and
Margin). `model/rates.js` holds every derivation; DECISIONS.md "Data basis" records each choice.

| Family | Costs | Never |
|---|---|---|
| `storage` | facilities × boxes × 12 | travel, handling |
| `handling` — retrieval, refile, pull | handling per movement | travel, on-site. Warehouse work |
| `movement` — delivery, pickup | travel + on-site per visit, handling per unit | — |
| `bin` | travel + on-site per visit, shred per lb | box handling |
| `itad` | travel + on-site per visit, plant per lb | facilities, box handling |
| `labour` | hours × the loaded rate; Shredding Truck Hourly (S0) is hours × the route-hour rate plus the drive there and back for each job (Theran, 3 November 2026) | travel and boxes, except S0's drive |

A route day is shared between its stops **by minutes** (31 October 2026): drive minutes from each stop's detour in **road miles** along the main roads at an assumed 20 mph, plus 8 minutes a stop and 3 a service (all `assumed`, `SETTINGS` in `model/rates.js`, for Mike to check). An account's bins are costed from its own route days (`components/routecost.js`, `server/routecost.js`, the `routestops` query); a new quote from real route days within three miles (`nearbyCost`; back-tested 2 November 2026: within 11% in total, about a third out on any one account, so a quote is a guide, `scripts/quote_backtest.mjs`), its own trip from the yard if none are near, the book's average stop until a place is chosen; the route-hour rate (route day over `routeHours` on Settings) prices only what one more stop adds on the Ride card and that trip from the yard; the 40% split prices only what has no route days. Box deliveries ride the shred trucks (Theran, 1 November 2026) but VCK (code 01, `deliverydays` query) does not say which route: each is placed on the route that passed closest to it that day (`placeDeliveries` in `components/routecost.js`) and shares that day by minutes, so bins get the benefit and delivery and pickup are costed from real route days. A delivery's postcode: the sub-account's own Veri-Shred address (the site), else the account's usual one, else one typed on Settings (stored as `pc:<level1>` in `app.setting`). The database holds no other addresses (checked 1 November 2026 with `scripts/address_check.js`: 2,450 delivery days a year, 971 with no postcode, $31K of delivery revenue); VCK's address table is not in the daily push. A delivery with no postcode still rode a truck: it takes its share of that day's fullest route at the average detour, so route days are never charged twice. Only a date no route ran stays at the average visit. Code 01 carries two things (checked 2 November 2026): a trip fee on lines of one unit or less, and boxes at a box rate above that; the margin query splits them as 01 and 01B, trips from the first, boxes to handling. Any account with stops on real route days is costed from its own share of them, whatever its size. The route-day pool now ties: $598K charged against $596K. Every assumption is on Settings, never edited in code.

**Visits, not units, drive route cost.** A visit is one customer on one route on one day, from
Veri-Shred done orders (Ingalls 101, Larabida 15, UChicago Medicine 300); otherwise units ÷ 5.80 for
bins and movement, ÷ 4,000 for ITAD.

Worked check: Ingalls, 3,540 bins, 101 visits, 154,887 lb on S5 → **$10.53 a bin, $37,273 a year**,
+$1,148 on its $38,421 of revenue: thin, not below cost. If the model returns anything else, the
model is wrong. (That check is the average-visit model, with no route days loaded. On its own route days Ingalls costs $13.44 a bin, $51,470 on $35,388 of bin revenue; Mike's check on its 14 stops a day is still open.)

## Data rules — each cost a wrong answer once

1. **Revenue on `invdate`, not `billdate`** — `COALESCE(invdate, billdate)`. Reconciles to QuickBooks within 0.4%.
2. **`billable` is a completion flag, not a contract flag.** Bookings run at about 1.9 times completions (Ingalls 2.8) because forward and recurring bookings that never happen stay in the table with `billable='false'`. Count done work only: Veri-Shred done bins agree with VCK billed bin units within 4% across the book (24,861 against 25,812).
3. **All Veri-Shred columns are text.** Cast everything: `NULLIF(weight,'')::numeric`.
4. **Storage bills in advance, service in arrears.** A billing month is this month's storage and last month's work.
5. **Never divide twelve months of `ret_tot` by boxes.** Use a single recent month.
6. **Executive bin weights (B3, B6) sit at capacity in Veri-Shred** — a default, not a weigh. 95-gallon weights are real. **Plant pounds come from S5 in VCK**, which does not carry the default and agrees with Veri-Shred within 0.3% in total where both exist.
7. **The live month is whatever `invoices_current` holds with no `invdate`.** When a run posts, its rows move to `invoices` with an `invdate`. The posted series reads `invoices` only. `invoices_current` is read only through `v_current_run`: the undated rows are the run, and the few dated rows (printed, not yet in `invoices`; 14 on 8 October 2026) are shown there as pending until they post. Work done is `priced_lines_current`, joined by `invoice_no`.
8. **GPS, arrival times and service duration were never captured** — zero real values across 365,000 records. Build nothing that needs them.
9. **The `units` field on retrieval, return and destruction-pull lines is a count of boxes, not a barcode** (checked 26 October 2026: median 2 on codes 20 and 30, 20 on S1, up to 1,832 on one line). The barcodes in the margin spec came from a VCK work-order Excel extract. The database has no storage-box barcodes, so the drill stops at the work-order line until VCK's work-order detail table joins the daily push.
10. **Citadel is `ser_tot` where `custno = '00870'`, on posted invoices.** September 2026 is $22,278 against $233,411 of total service. The $233,100 once quoted as Citadel's September was not a Citadel figure, and the smooth Citadel series in the first addendum (168,900 → 233,100) did not come from the database and is withdrawn. Citadel runs from −$432,637 (November 2025 credit run) to $470,279 (April 2026); carry negatives, never clip them.
11. **Driver payroll is $510,098 from GL `7335700`**, not the $256,429 ADP figure. **`7400 Transportation` is air travel**, not vehicles.

12. **A month's work has no prices until the next month's run, but `work_orders` already holds it.** Finished orders × each account's own price: bins within 1%, the total within 3.6% on average over May to September 2026 (June missed by 12%). Prices are the account's own, however old; a first-time buyer pays about list whatever the volume (S4 at $8.00 on 235 and on 1,991 units), so never price one from similar-sized accounts. Flat-fee accounts have $0 on their rotation lines: their own rate is $0. Retrievals (20, 30) have orders with blank units. Flat bin fees (IR), deliveries (01) and pound shredding (S3) only appear at the run. `components/linework.js` holds it.

13. **The order stops were driven in is not recorded.** `rorder` is one number for the whole route day; `porder` follows the record order; neither it nor `sorder` runs any closer to a sensible round than a shuffle (69.6 and 79.6 road miles a day against 71.4 shuffled and 57.5 for the shortest round; checked 3 November 2026 with `scripts/route_history_check.js`). Lines follow `likelyRound` in `components/opsdata.js` and say "likely". The cost model still shares a route day in stop-ID order, which moves a typical area by about 4%. Mike can say whether drivers follow a printed sequence.

14. **Route days are complete from January 2025** (31 December 2024 has 4). A route is not a driver: MRS drives both MARK and FLT02. Services a route day fell from 22.6 to 19.1 between January to October 2025 and 2026, a step down in November 2025 that VCK's billed bin units show too (2,389 to 1,965).

## Writing rules

Copy is part of the product. Plain English. British spelling in prose; US dollar figures.

- Sentences where a sentence explains more: "Larabida pays $991 a year for 356 bin services that cost $4,108 to serve" beats "Margin: −314%".
- Every chart is titled by its conclusion, not a label, and carries its source line.
- Every number carries its comparison: last year, the account's own six-month run, or the book's median.
- **Measured and modelled look different.** Estimated figures carry the word "est." and the assumption named once nearby; charts hatch them. No other mark.
- **Not yet calculable is an honest empty state** — dashed border, one-line reason — never an invented figure. Today: retention rate, book-wide service gross margin, book-wide bin and ITAD margins.
- No invented data, ever. If it isn't in the database, the panel says where it will come from.

## Design — redesigned 26 October 2026 (supersedes the 7 October design)

**The customer is the centre.** Home → a customer list (`#customers?view=…`) → one customer page
(`#customer/<level1>`) → lines → visits → boxes. Every number on Home opens a list; every list row
opens the customer page. Nothing is a dead end. Nav: Today · Accounts · Quote · Operations · Opportunities (routes #pulse, #customers, #pricing, #activity, #opportunities); on a
phone it is a tab bar at the bottom. Accounts opens on All accounts; Anne signs in on Opportunities.

**Brand, type and tokens.** R4 Services' own branding, from r4services.com (26 October 2026): the barcode
logo `public/brand/r4-logo.png` (always on white: its bars are black), the icon `r4-icon-192.png`, green
`--brand` #0e5116 and `--r4-bright` #38b449 (fills and lines only, never text). **Average Sans**
(`--f-display`, SIL OFL, one weight) is for titles, the masthead and Home's big figures only, at 400 with
`font-synthesis: none`; tables, labels and body stay on the system sans (`--f-sans`: San Francisco, Segoe UI)
for tabular figures and small-size legibility on Windows. No other web font, no serif, nothing from Google at
run time. `public/tokens.css` holds every colour and size, one theme on white (dark mode dropped 30 October 2026); components read variables only.

**Ask** (`components/ask.js`, `server/ask.js`) is on every screen: Claude answers only through tools over
`components/home2data.js` and `custbook.js`, the same functions the screens draw, and every number in an answer
must appear in what the tools returned or the answer is refused. Pop-outs (`components/pop.js`) hand a question to it.

**Charts** (`components/chart.js`, method from the dataviz skill): one axis always; 2px lines over a
12% area wash; bars no wider than ~24px with 4px rounded ends; hairline grids; legend for two or more
series; crosshair tooltip; drawn at their on-screen width. Colour follows the entity: storage blue
`--s-storage`, service orange `--s-service`, Citadel a neutral `--s-citadel`. Text never wears a
series colour. Real sparklines on customer rows.

**Status colour** marks exceptions only and always comes with a word: red below cost and down,
amber below median, blue for a delta that is up. Green is the brand and never on a number. Sound is ink. A delta wears
colour only at a fifth or more (±20%); smaller moves keep the arrow in ink, no arrow under 1%, "new" or "stopped" past
300%. In a month table a cell is coloured only when more than 25% and $5K from its row's own 12-month average: red below,
blue above. Sparklines are ink with only the latest point coloured.

**Copy.** One idea per row: a number and one line; detail on tap. Show what changed, not what Anne
and Mike already know. Estimated figures carry "est.". Route-based costs (bins, handling, delivery) show
"under review" until delivery routes are in the route volumes.

**Never on screen:** a dual axis, a pie chart, a gauge or dial, invented figures. Count-ups only in Home's and Accounts' once-a-session entrances and Quote's four figures (Theran, 2 and 3 November 2026; `DESIGN.md` Motion), never anywhere else.

## When you are unsure

Ask, or build two variants side by side. Do not guess and iterate.
