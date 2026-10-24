# DECISIONS.md

Settled. Do not re-propose these unless Theran reopens them. Each line cost a round of iteration
to reach. Newest section first.

## Data basis — settled 8 October 2026, Prompt 3

| | |
|---|---|
| **The posted series** | `invoices` only, month on `COALESCE(invdate, billdate)`. 23 months from November 2024; the October 2024 fragment (36 early invoices billed 1 November) is dropped. The database wins over the documents: August 2026 service is 364,052 and September 233,411 |
| **Citadel** | `ser_tot` where `custno = '00870'` (level1 6714). Negative months are carried, never clipped. The smooth 168,900 → 233,100 series is withdrawn |
| **Core** | $646,519: six-month average March–August 2026, invoice date, posted invoices only |
| **The live run** | `v_current_run`, never the posted series. `run` = undated `invoices_current` rows; `pending` = dated rows printed but not yet in `invoices` |
| **Customer key** | `level1` everywhere: one `custno` each in invoices, and the only key `priced_lines` and Veri-Shred carry |
| **Modal rate** | Work-order month; zero-rate (flat-fee) lines counted but kept out of the mode; ties take the lower rate |
| **Flag down two months** | Below the account's own trailing-six mean (six full prior months, gaps as $0) this month and last |
| **Termination fees** | Permanent-withdrawal codes P1, P2, P3, P5, PC, pending Anne's confirmation |
| **Revenue per stop** | Destruction revenue (servtype F and S, Citadel apart) by work month ÷ done stops (distinct `slocid` per route-day) |
| **Rebuild** | `npm run kpi:rebuild` creates the six views in order, then the `kpi` tables, as one transaction |
| **October range** | $598k–$699k, was $598k–$690k: storage $387,101 from `v_current_run` plus core service $211,133–$311,665, the last six posted months (Apr–Sep 2026) |
| **City of Chicago down-since** | Below its own trailing-six mean every month since January 2026, flagged two-down since February 2026; was "every month since August 2025" |
| **Service credit month** | November 2025 at −$60,759, the 23-month low; was "−$144k". The high is April 2026 at $781,944, was "$784k" |
| **Shred plant pounds** | One source, VCK priced lines, for both the rate's total and each account's charge: S3 weighed shredding + S5 recorded weight + unweighed shred boxes (R3/R5/SC) at 28.4 lb + unweighed bins at lb per bin by size. 3,330,582 lb; shred plant $0.1406/lb, provisional. Chosen 24 October 2026 over Veri-Shred weights: S5 agrees with Veri-Shred within 0.3% where both exist, also covers the 19% Veri-Shred never weighs (shred truck, one-offs), and does not carry the B3/B6 capacity default |
| **Lb per bin** | The flat 24 lb is withdrawn. Where an account has no S5: 95-gallon 219.3, 65-gallon 121.7, executive 34.9, under-desk 15.7, from S5 on single-code work orders. Flagged estimate |
| **17 September 2026** | 283 booked, 200 done, 23 customers, 6 routes from `v_route_day`; was 272, 13 and 5. Angel ran 13 services across 6 customers, not one bin. Activity reproduces `v_route_day`, not the addendum |

## Design — settled 7 October 2026, in Claude Design

| | |
|---|---|
| **Two registers** | Briefing for Pulse (Trisha); Ledger for Activity, Pricing, Calls, Margin. Chosen after drawing Pulse in both at 390 wide, side by side. Not to be blended. |
| **Type** | Newsreader for display (the headline sentence, verdict sentences, pull quotes). IBM Plex Sans for body. IBM Plex Sans Condensed for labels, figures and source lines — chosen over Geist and Public Sans because it is the only one with a condensed cut in the same family. |
| **Colour rule** | R4's mark is green; brand green is masthead, links and drill affordance only. Status colour marks exceptions: amber below median, red below cost and down. "Sound" and "up" are ink. This removed the brand-green / status-green clash. |
| **Core gauge** | A straight bar from $0 to $1.0m with October as a dashed range. No dial. |
| **Phone first** | Pulse at 390 was drawn before desktop; desktop is the same content with room, not more content. Above the fold on a phone: headline (three lines at 28px), core bar, one chart. |
| **"Needs a decision"** | Four rows on Pulse, each a sentence, a number, the evidence and an Open link to its drill path. Capped at four. This replaced a six-number scoreboard that was a KPI-tile row in disguise. |
| **Two businesses** | Storage and service side by side, each with growth, gross margin and a lead indicator, with Iron Mountain's figure beside each. Retention rate and service gross margin are honest empty states until the data exists. |
| **Charts titled by conclusion** | "Storage is the annuity with one step. Service swings ten times as wide." — not "Revenue by month". |
| **Hairline rules, not boxes** | The single-surface card-on-grey look is gone. Depth from tone; sections divided by a 2px ink rule under the label. |
| **Design tokens** | Extracted into `public/tokens.css` from the committed export. No other colours. |

## Product scope — settled 7 October 2026

Four screens: **Pulse, Activity, Pricing, Calls.** Margin is a drill-down behind Pulse and
Pricing. This replaces the earlier "Brief, Month, Customers, Pricing" and the seven-tab v12.

**The drill path is seven levels, every one a real table:** company → half → service family →
customer → work order → line → box. The `units` field on retrieval, return and destruction lines is
the box barcode. The earlier "two levels only" decision was about *fabricated* depth; real depth
is the product.

**The KPI set is Iron Mountain's.** Storage vs service split, organic growth of each, retention
rate, storage volume, storage and service gross margin, revenue per sq ft, utilisation,
termination fees — plus the operational five: stops per route-day, revenue per stop, revenue per
route-hour, route-day margin, pounds per route-day. Stored in a `kpi` schema rebuilt nightly.

## Architecture

| | |
|---|---|
| Vanilla JS, no framework | One font link is the only dependency |
| Inline SVG, no chart library | Every chart is bespoke; libraries fought the design |
| Fixtures for design work | `npm run snapshot` once, then design offline |
| One `RATES` object | Pricing and Margin previously disagreed; now they cannot |
| Costs stored as **drivers**, not amounts | `cost(customer) = Σ lineCost`, so summary ties to detail by construction |
| `kpi.monthly` and `kpi.customer_monthly` | Screens read these, not raw tables. The customer one — each month against its own trailing-six mean, flagged two months down — is where "one finding a week" comes from |
| `model` schema | `gl_pool`, `pool_split`, `driver_volume`, `rate_override`, `change_log` — the yearly allocation assumptions, updated once a year, every change logged |

## Rejected — do not bring back

| Idea | Why it went |
|---|---|
| **Decision board with commit buttons and a gap meter** | A board paper, not a tool. Trisha would open it once |
| **KPI-tile row / scoreboard with arrows and sparklines** | The uniform stack. Six equal numbers tell you nothing is most important |
| **Radial or horizontal gauge** | A straight bar does the job without the metaphor |
| **Seven-tab dashboard (v12)** | An information display with action tags bolted on |
| **Geography / Voronoi tab** | Pretty, answered no decision. Postcodes live in Activity's route rows instead |
| **Fabricated job-level detail** | v12 generated "2 Sep, 73 bins, $238" from annual volumes. Real rows exist now; use them |
| **Count-ups, split-flap digits, reveal choreography** | Showmanship on a finance instrument |
| **Fake sparklines** | One hardcoded curve reused for every falling customer |
| **A fourth status colour** | Sound is ink. Two status colours, both for exceptions |
| **Sending all 28 prototypes to the design tool** | It anchors on the look you want to escape. Brief + logic + real data only |

## Numbers and basis

- The decline is quoted on **six-month averages**: $781,590 early 2025 (January–June) against $646,519 now (March–August 2026), −17%. Both on invoice date, posted invoices only, Citadel `custno 00870` held apart. Never mix an average with a single month
- On that basis **service is about three-quarters of the fall**, storage a quarter
- **October in-month range: $598k–$699k** — storage $387,101 from the October run, core service modelled at $211k–$312k (the last six posted months). Marked modelled, narrows through the month
- **Ingalls break-even is $9.29 a bin** under GL-corrected rates. $7.17 is the pre-GL figure and is wrong wherever it still appears
- **City of Chicago 2FM to the $0.246 median = $24,843 a month** (227,915 × $0.109)
- Every figure strip states its basis

## Cost model — corrections already found

1. **`7400 Transportation Expense` is air travel**, not vehicles. Vehicles means `7011 Auto`
2. **Driver payroll is $510,098** from GL `7335700`, not the $256,429 ADP figure
3. **On-site time is per visit, not per unit.** Citadel's 315,472 devices arrive in 74 collections
4. **ITAD is ~1.5 lb per unit**, not 12
5. **Warehouse pulls carry handling only** — no route time
6. **Temp labour is allocable**: Anchor and Banner to warehouse pools, Citadel's $167,068 direct
7. **The GL covers 17.1 months and the volumes twelve.** Restate both over the twelve months to 31 August 2026
8. **Citadel September ITAD did not exceed total September service.** The $233,100 was not a Citadel figure. Citadel September is $22,278 posted, against $233,411 total service (corrected 8 October 2026)

## Excluded from costing

`6080 Other Income` · `8700 Citadel rebate` · `7333 401k` · `7195 Meals & Entertainment` ·
Trisha Personal Expenses · `7050 Charitable` · `7170` Philip B. Rooney, Jr. These belong in the
diagnostic narrative, never in the cost of service.

## Open questions

- **Mike:** can Teletrac export mileage and stop duration? It would replace `SPLIT`
- **Mike:** real travel / on-site split; rack capacity and square footage of the three centres
- **Mike:** driver pay rates by person, with overtime — turns the route day into a real P&L per driver per day
- **Mike:** does shred-truck (S0) paper come back through the plant, or is it finished on site? If on site, its S5 pounds leave the plant total — one row in `model.service_family`
- **Anne:** are the sixteen never-raised accounts contractually fixed?
- **Anne:** does a permanent-withdrawal or termination fee exist in the price sheet?
- **Anne:** is shredded paper sold, and where does that revenue land in the GL?
- **Anne:** what does `7335200 Sales` at $1.68m cover?
- **VCK:** the box master with date-in, date-out and out-reason — needed for retention rate
