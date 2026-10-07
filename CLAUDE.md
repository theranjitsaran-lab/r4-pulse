# CLAUDE.md

Read this first, every session. Then `DECISIONS.md`. Then `docs/` for the brief, the logic pack,
the data addendum and the margin spec — those four hold every number the screens show.

## What this is

**R4 Pulse**: a four-screen management tool for **R4 Services**, a Chicago records-management and
destruction firm with about 35 staff and $10.16m of revenue. Built by StepsGrowth. It reads a
DigitalOcean Postgres database refreshed daily from two source systems: **VCK** (billing and
pricing, SQL Server) and **Veri-Shred** (operations, FoxPro).

**The owner's target:** $1.0m a month in core storage and service revenue, Citadel ITAD held
apart. Core is $643,842 on a six-month average. Every screen is organised around that gap.

**Three users, three rhythms.** Trisha Rooney (CEO, phone first, weekly). Mike Kelly (operations,
desktop, 06:30 daily). Anne Sterne (billing and pricing, desktop, mid-task). Each screen is for one
of them. Nothing is for all three.

## The four screens

| Screen | Owner | Register | What it is |
|---|---|---|---|
| **Pulse** | Trisha | Briefing | Headline sentence carrying the gap · four "Needs a decision" rows · storage and service side by side with Iron Mountain beside them · the 24-month chart · one finding a week |
| **Activity** | Mike | Ledger | Yesterday as one row per route-day · the week as a grid of route-days · booked ahead |
| **Pricing** | Anne | Ledger | Input rail · verdict sentence · the distribution strip · cost to serve with derivations · what the decision is worth |
| **Calls** | Anne, Trisha | Ledger | Ten accounts a week, each with its signal, evidence, opening line, three actions |

**Margin** is a drill-down behind Pulse and Pricing, not a tab: every customer ranked by gross
margin, worst first, opening to lines, cost build, visits, boxes.

The committed design is in `docs/design/` as four PNGs (Pulse desktop, Pulse phone, Margin,
Pricing). Build to those. Tokens extracted from it are in `public/tokens.css`.

## Stack

Node, Express, vanilla JS, inline SVG. **No React, no framework, no chart library.** One Google
Fonts link (Newsreader, IBM Plex Sans, IBM Plex Sans Condensed) is the only external dependency.
Postgres via `pg`. Deployed on Render.

If a task seems to need a library, it doesn't — write the SVG.

## Repo layout

```
/server      db.js, api.js, auth.js, snapshot.js
/sql         views/*.sql (one per KPI), kpi_rebuild.sql, model_schema.sql
/model       rates.js, rates.test.js              ← the cost model; see rules below
/public
  tokens.css                                      ← every design variable
  components/  strip.js, table.js, chart.js, meter.js, drill.js
  views/       pulse.js, activity.js, pricing.js, calls.js, margin.js
  styleguide.html                                 ← every component, every state
/fixtures    snapshotted JSON for offline design work
/docs        brief, logic pack, data addendum, margin spec, design PNGs
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

GL-corrected rates, twelve months to August 2026: facilities $0.124/box/month · handling $6.13 a
movement · shred plant $0.34/lb · route day $680 · driver hour $32.49 · 5.4 visits a day · 6.5
services a visit · 24 lb a bin (partial) · 1.5 lb an ITAD unit (estimate) · travel share of a
route day 40% (**the one assumption**, exposed as a slider that recomputes Pricing and Margin).

| Family | Costs | Never |
|---|---|---|
| `storage` | facilities × boxes × 12 | travel, handling |
| `handling` — retrieval, refile, pull | handling per movement | travel, on-site. Warehouse work |
| `movement` — delivery, pickup | travel + on-site per visit, handling per unit | — |
| `bin` | travel + on-site per visit, shred per lb | box handling |
| `itad` | travel + on-site per visit, plant per lb | facilities, box handling |
| `labour` | hours × the loaded rate | travel, boxes |

**Visits, not units, drive route cost.** Use observed visit counts where they exist (Ingalls 62,
Larabida 17, UChicago 148); otherwise units ÷ 6.5 for bins and movement, ÷ 4,000 for ITAD.

Worked check: Ingalls, 6,886 bins, 62 visits → **$9.29 a bin, $63,997 a year**, −$41,549 at $3.26.
If the model returns anything else, the model is wrong.

## Data rules — each cost a wrong answer once

1. **Revenue on `invdate`, not `billdate`** — `COALESCE(invdate, billdate)`. Reconciles to QuickBooks within 0.4%.
2. **`billable` is a completion flag, not a contract flag.** 56% of scheduled services are confirmed complete. Forward bookings show `billable='false'`.
3. **All Veri-Shred columns are text.** Cast everything: `NULLIF(weight,'')::numeric`.
4. **Storage bills in advance, service in arrears.** A billing month is this month's storage and last month's work.
5. **Never divide twelve months of `ret_tot` by boxes.** Use a single recent month.
6. **Executive bin weights (B3, B6) sit at capacity on every order** — a default, not a weigh. 95-gallon weights are real.
7. **`invoices` holds posted months only.** The live month is `invoices_current` / `priced_lines_current`.
8. **GPS, arrival times and service duration were never captured** — zero real values across 365,000 records. Build nothing that needs them.
9. **The `units` field on retrieval, return and destruction-pull lines is the box barcode.** One row per box. That is the bottom of the drill path.
10. **Citadel's September ITAD ($233,100 by customer) exceeds total September service ($213,330 in `invoices_current`).** The two series are on different bases. Reconcile before drawing the Citadel band for September; until then leave September out of the band and say so in the source line.
11. **Driver payroll is $510,098 from GL `7335700`**, not the $256,429 ADP figure. **`7400 Transportation` is air travel**, not vehicles.

## Writing rules

Copy is part of the product. Plain English. British spelling in prose; US dollar figures.

- Sentences where a sentence explains more: "Ingalls pays $3.26 a bin and costs $9.29 to serve" beats "Margin: −156%".
- Every chart is titled by its conclusion, not a label, and carries its source line.
- Every number carries its comparison: last year, the account's own six-month run, or the book's median.
- **Measured and modelled look different.** Modelled figures carry the ◇ mark and the assumption named once nearby.
- **Not yet calculable is an honest empty state** — dashed border, one-line reason — never an invented figure. Today: retention rate, book-wide service gross margin, book-wide bin and ITAD margins.
- No invented data, ever. If it isn't in the database, the panel says where it will come from.

## Design

`public/tokens.css` holds every colour, size and font. Components read variables only.

**Two registers, chosen on purpose.** Briefing for Pulse: Newsreader display headline (46px
desktop, 28px phone), generous measure, charts support prose. Ledger for everything else: dense,
tabular, 28px rows, hairline rules instead of boxes, Plex Sans Condensed labels and figures.

**Colour rule.** Brand green `#2B4F1E` is the masthead, links and the drill affordance only. Data
sits in ink. Status colour marks exceptions, never the default: amber `#C07A1E` below median and
for the thin day; red `#B3261E` below cost and for down. "Sound" and "up" carry no colour.

**Never on screen:** a gauge or dial, a KPI-tile row, a pie chart, a target meter with commit
buttons, a dual axis, count-ups, reveal choreography. The core gauge is a straight bar.

Phone: Trisha's Pulse above the fold is the headline, the core bar and one chart. Tables restack
under 640px.

## Known fixes carried from the design review

- Section labels must never share a line with their rule (the rule was striking through "Needs a decision", "This week", "October to date"). Use `.sec`.
- The Pricing strip's left-edge labels must stay inside the plot; swing the anchor at the edges.
- Off-scale accounts on the strip are counted ("33 accounts above $49") not stacked at the edge.
- Long negatives (−$41,549) never break across lines: `white-space: nowrap` on `.num`.

## When you are unsure

Ask, or build two variants side by side. Do not guess and iterate.
