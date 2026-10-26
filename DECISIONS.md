# DECISIONS.md

Settled. Do not re-propose these unless Theran reopens them. Each line cost a round of iteration
to reach. Newest section first.

## Daily push — settled 26 October 2026

| | |
|---|---|
| **Truncate, never drop** | The push scripts truncate and reload; they never drop, because the views depend on the tables. A column change in VCK or Veri-Shred needs a manual `ALTER TABLE` before the push |
| **Blocked looks stale** | A table the push cannot load logs `DDL FAILED` in `push_log.txt` or `vs_push_log.txt` and keeps its old rows, so it looks stale rather than broken. `node scripts/freshness.js --logs <folder>` reads both logs on the R4 machine |
| **Who runs it** | Tasks `R4_Daily_Push` (06:00), `R4_Verishred_Push` (06:30) and `R4_KPI_Rebuild` (07:00) run as `tsaran`, LogonType Interactive, until R4's IT grants "Log on as a batch job" or re-registers them. Until then: close the Remote Desktop with the X (disconnect), never sign out; a reboot stops them too. Ask IT: "Please set tasks R4_Daily_Push, R4_Verishred_Push and R4_KPI_Rebuild to run whether the user is logged on or not." |
| **Watching it** | `/health/data` (dates only, no login) and a GitHub Action at 07:30 Central that fails, and emails Theran, when any date is more than two days old |

## Brand — settled 26 October 2026

| | |
|---|---|
| **Source** | r4services.com, read in the browser: logo `6366387.png` (247×100), icon `cropped-6366387-192x192.png`, font Average Sans (Google Fonts, SIL OFL, weight 400 only), green #0e5116 (top bar, buttons) and #38b449 (the mark). The site's blue #2ea3f2 is its theme's default, not R4's, and is not used |
| **Web font** | Reopened by Theran: Average Sans is allowed, self-hosted, for display text only. The site fakes a bold from its one weight; R4 Pulse does not (`font-synthesis: none`) |
| **Logo** | The everyday barcode logo, not the "30 years" header lockup (a 567 KB screenshot, time-bound). Raster only; ask R4 for the vector and replace the file, nothing else |
| **Green as text** | #38b449 is 2.7:1 on white: fills, bars and the pulse line only. Text and links use #0e5116 (9.5:1) |

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
| **Shred truck** | S5 on shred-truck (S0) work orders, 228,493 lb, is shredded on site and carries no plant cost; plant pounds 3,102,089, shred plant $0.1509/lb. Theran's understanding, 24 October 2026, to confirm with Mike |
| **Bin counts** | Veri-Shred done bins, confirmed by VCK billed bin units within 4% (24,861 against 25,812). Bookings are not work: Ingalls' 10,024 bookings are 3,540 done, 3,821 billed |
| **Sign changes accepted** | Under the derived rates Ingalls (−$3,184 → +$2,679) and ICU Medical (−$3,055 → +$48,850) move from loss to profit. Both were within 1.5% of break-even; the new rates trace to the GL, the old ones did not. Accepted 24 October 2026 |
| **The decline, restated** | Of the −$135,071 between the two six-month averages, Pfizer's −$36.6k is timing (a $219k prepaid-retention and scanning bill in February 2025) and City badging's −$31.5k is a scanning project that ended in August 2025. The recurring losses are Access Community Health (executive bins about $32k → $11k a month from February 2026) and 2FM (storage price cut July 2025, −$22.4k a month) |
| **Retention backlog** | `storage_retention` status I is in storage: 1,195,560 boxes, 284,553 overdue for review, 725,640 over ten years. Other statuses are boxes out, withdrawn or destroyed |
| **Placements** | `vs_placement.lplactive` is true on every record and means nothing. Placements created before 2021 are mostly records never closed; idle-bin counts use 2021 onward |
| **Pricing medians** | Services compare account by account: 95-gallon median $85.00 a service (378 accounts, about eight services each a year; VCK bin units match Veri-Shred done services within 4%), so the logic pack's $22 was stale. Storage compares box-weighted, because monthly minimums make small accounts look dear per box: median $0.228 a box a month against an account median of $0.750; the logic pack's $0.246 was box-weighted. Settled 26 October 2026 |
| **17 September 2026** | 283 booked, 200 done, 23 customers, 6 routes from `v_route_day`; was 272, 13 and 5. Angel ran 13 services across 6 customers, not one bin. Activity reproduces `v_route_day`, not the addendum |

## The route to $1.0m and cross-sell — settled 26 October 2026

Theran reviewed the earlier work with the team's reactions. The Phase 1 deck and v3.3 confused them
(a tile row and an "AI insights" box on every tab, finance words, no next action). Trisha's number is
**core billed revenue** against $1.0m, and she believes most of the gap closes through **upselling and
cross-selling**. So:

| | |
|---|---|
| **Home** | This month's bill (already known: this month's storage, last month's work); next month's building from this month's done services at last month's value per service ◇; a bridge from the six-month average to $1.0m; customers moving as dollars a month against each account's own run |
| **The bridge** | Steps from `components/levers.js`, each the sum of the list it opens: cross-sell (whitespace, top 200 accounts, full take-up, ◇), prices halfway to the median (service medians by account, storage box-weighted), slipping shortfall, missed rate rounds only where no price gap is counted. Steps under $1k a month go to the footnote. What is left is new business. On 26 October: $645k + $145k + $56k + $50k, leaving $104k of new business |
| **Overdue boxes** | Beside the bridge, never in it: destruction bills once (R3 median $10 a box) and ends storage every month after (284,048 boxes ≈ $2.8m once, ≈ $65k a month of storage) |
| **Cross-sell sizing** | `components/whitespace.js`. Box-driven lines (retrieval, delivery, destruction) for storers of 500+ boxes: the median spend per 1,000 boxes among storers that buy the line. Storage, bins, ITAD: the median ratio to the account's other spend among similar-sized accounts that buy it as an add-on (under 40% of their spend), so specialists (electronics clients for ITAD) are not comparables. Never more than the account spends today |
| **Main customers** | The 30 largest by month, each cell shaded by change against the account's own six months before it |
| **Order cost** | `margin.js jobCost()`: the account rules applied to one work order, one visit shared between the account's route orders that day |
| **List prices** | Off the screens. The logic pack's section 5 table did not come from this database (95-gallon median $22 against $85 billed; list $45 below most accounts). The book's own median is the comparison until a list is sourced |
| **References** | Keep from v10: the margin drill to one order, the price track, diverging movers. Keep from the Henry Broch dashboards: the customer × month grid and one sentence above it. Never copy a v10 figure |

## Redesign — settled 26 October 2026

Trisha's needs (in-month tracking, levers to grow EBITDA, margin views that point to action, pricing
the team can use and size) and an end-user review of Pulse v2 led to a customer-centred app: Home →
customer list → customer page → lines, visits, boxes. One system typeface, a validated chart palette
(storage blue, service orange, Citadel neutral), cards, a phone tab bar, light and dark. Citadel is
held apart everywhere and its change reads "lumpy". The month's pace is the bill so far plus work
done per working day against last month (VCK prices work only at the run). The 7 October design
below is superseded: registers, serif headline, hairline-only layout and the Iron Mountain panel.

## Design — settled 7 October 2026, in Claude Design (superseded 26 October 2026)

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
customer → work order → line → box. *Corrected 26 October 2026:* the `units` field on retrieval,
return and destruction lines is a count of boxes, not a barcode (median 2, up to 1,832 on one line),
so the box level is not in the database; it shows as pending until VCK's work-order detail joins the push. The earlier "two levels only" decision was about *fabricated* depth; real depth
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
- **Ingalls costs $10.53 a bin to serve** (3,540 bins, 101 visits, 154,887 lb) against $38,421 of revenue: thin, not below cost. The $9.29, −$41,549 and $7.17 figures are withdrawn wherever they still appear (corrected 24 October 2026)
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
- **Anne:** is there a written agreement with Citadel (term, volumes, rebate), and who holds it?
- **Anne:** Access Community Health's executive-bin work fell by two-thirds from February 2026. Did they cut back or move some to another vendor?
- **Mike:** do drivers mark every emptied bin done? Done agrees with VCK billing within 4%, so probably yes; worth one sentence from him
- **Anne:** are the sixteen never-raised accounts contractually fixed?
- **Anne:** does a permanent-withdrawal or termination fee exist in the price sheet?
- **Anne:** is shredded paper sold, and where does that revenue land in the GL?
- **Anne:** what does `7335200 Sales` at $1.68m cover?
- **VCK:** the box master with date-in, date-out and out-reason — needed for retention rate
- **VCK:** the work-order detail table, one row per box with its barcode — the bottom level of the drill (the margin spec's example came from an Excel extract of it)

## Redesign after the CEO grill — settled 26 October 2026

| | |
|---|---|
| **One branch** | `design/iterate-in-code` merged into `main`; all work on `main` from now |
| **Home** | Yesterday first: the day in a sentence, then only what was not normal (`components/changes.js`), each line with Useful · Knew · Not right. A one-row strip (this month's bill, next month's likely, the gap, slipping), Anne's and Mike's lists, the month chart titled by its conclusion, the bridge folded away |
| **What counts as unusual** | Each figure against its own norm, thresholds set by backtest over 40 working days: a day outside all of the last eight same weekdays, a route under 30% of a usual day of 20 or more, booked work not done beyond the usual share, an account served most weeks gone ten working days, month pace beyond ±10% on Mondays. Each fires on a quarter of days or fewer; half of days are quiet. Mike to confirm the flagged days |
| **Feedback** | `app.feedback`. Knew or Not right holds that line back from that person for 30 days. Measured: someone acts on one line a week; two weeks with none and it is pulled |
| **Morning emails** | Weekdays 07:15 from the R4 machine (`R4_Morning_Brief`), Microsoft 365 mailbox; Trisha, Anne and Mike each their own. A morning with no new data says only that. Taps are signed links to Render |
| **Provisional costs** | Where route costs are under review, Pricing judges against the book only: no below-cost verdict, no margin. Margin keeps Check routes |
| **This month's bill** | From the run, else the posted invoices (`P.posted`) when the KPI rebuild has not run since, else shown as posted with the total to follow |
| **Go live** | Render's outbound addresses go on Trusted Sources (Theran, 26 October) |
