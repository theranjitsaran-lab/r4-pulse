# CLAUDE.md

Read this first, every session. Then `DECISIONS.md`. Then `docs/` for the brief, the logic pack,
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
| **Home** | `#pulse` | Trisha | This month's bill (already known) and next month's building · the bridge from the six-month average to $1.0m, each step opening its accounts · margin row · customers moving |
| **Customers** | `#customers?view=` | Anne, Trisha | This week's calls · Main customers (month grid) · Cross-sell (whitespace grid, each gap explained) · Slipping · Price gaps · Missed rate rounds · Overdue boxes · Margin (all, thin, below cost) · All |
| **Customer page** | `#customer/<id>` | Anne | Headline figures · 24-month chart · not bought yet · prices against the book · signals · margin by line → its cost, invoices and orders → one order's cost build · visits |
| **Pricing** | `#pricing` | Anne | The price on one track (cost, middle half, median) · what it is worth a year · the cost working · invoiced against the book |
| **Routes** | `#activity` | Mike | The day in a sentence, thin routes named · by route against its norm · the week · booked ahead · distance from the yard and the long way round |

Every figure shown in two places comes from one function (`components/levers.js`, `margin.js`,
`whitespace.js`) and `model/levers.test.js` holds them together. Tokens are in `public/tokens.css`.

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
  views/       pulse.js (Home), customers.js, customer.js, pricing.js, activity.js (Routes)
  data/zcta.json                                  ← postcode centroids (US Census, public)
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
| `labour` | hours × the loaded rate | travel, boxes |

**Visits, not units, drive route cost.** A visit is one customer on one route on one day, from
Veri-Shred done orders (Ingalls 101, Larabida 15, UChicago Medicine 300); otherwise units ÷ 5.80 for
bins and movement, ÷ 4,000 for ITAD.

Worked check: Ingalls, 3,540 bins, 101 visits, 154,887 lb on S5 → **$10.53 a bin, $37,273 a year**,
+$1,148 on its $38,421 of revenue: thin, not below cost. If the model returns anything else, the
model is wrong.

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

## Writing rules

Copy is part of the product. Plain English. British spelling in prose; US dollar figures.

- Sentences where a sentence explains more: "Larabida pays $991 a year for 356 bin services that cost $4,108 to serve" beats "Margin: −314%".
- Every chart is titled by its conclusion, not a label, and carries its source line.
- Every number carries its comparison: last year, the account's own six-month run, or the book's median.
- **Measured and modelled look different.** Modelled figures carry the ◇ mark and the assumption named once nearby.
- **Not yet calculable is an honest empty state** — dashed border, one-line reason — never an invented figure. Today: retention rate, book-wide service gross margin, book-wide bin and ITAD margins.
- No invented data, ever. If it isn't in the database, the panel says where it will come from.

## Design — redesigned 26 October 2026 (supersedes the 7 October design)

**The customer is the centre.** Home → a customer list (`#customers?view=…`) → one customer page
(`#customer/<level1>`) → lines → visits → boxes. Every number on Home opens a list; every list row
opens the customer page. Nothing is a dead end. Nav: Home · Customers · Pricing · Routes; on a
phone it is a tab bar at the bottom.

**Brand, type and tokens.** R4 Services' own branding, from r4services.com (26 October 2026): the barcode
logo `public/brand/r4-logo.png` (always on white: its bars are black), the icon `r4-icon-192.png`, green
`--brand` #0e5116 and `--r4-bright` #38b449 (fills and lines only, never text). **Average Sans**
(`--f-brand`, SIL OFL, one weight) is for the "Pulse" wordmark and the intro only, with `font-synthesis: none`
(Theran, 27 October 2026: its one light weight made titles read as body text). Titles and big figures are the
system sans at 600 (`--f-display`, `--w-head`); tables, labels and body the system sans at 400 (`--f-sans`:
San Francisco, Segoe UI). Seven sizes only: 12 · 14 · 16 · 20 · 28 · 40 · 64 (`--fs-1` to `--fs-7`). No other
web font, no serif, nothing from Google at run time. `public/tokens.css` holds every colour and size, light
and dark; components read variables only.

**Charts** (`components/chart.js`, method from the dataviz skill): one axis always; 2px lines over a
12% area wash; bars no wider than ~24px with 4px rounded ends; hairline grids; legend for two or more
series; crosshair tooltip; drawn at their on-screen width. Colour follows the entity: storage blue
`--s-storage`, service orange `--s-service`, Citadel a neutral `--s-citadel`. Text never wears a
series colour. Real sparklines on customer rows.

**Status colour** marks exceptions only and always comes with a word: red below cost and down,
amber below median, green only for a delta that is up. Sound is ink. A delta wears colour only at a fifth
or more (±20%); smaller moves keep the arrow in ink, and sparklines are ink with only the latest point coloured.

**Copy.** One idea per row: a number and one line; detail on tap. Show what changed, not what Anne
and Mike already know. Modelled figures carry ◇. Route-based costs (bins, handling, delivery) show
"under review" until delivery routes are in the route volumes.

**Never on screen:** a dual axis, a pie chart, a gauge or dial, count-ups, invented figures.

## When you are unsure

Ask, or build two variants side by side. Do not guess and iterate.
