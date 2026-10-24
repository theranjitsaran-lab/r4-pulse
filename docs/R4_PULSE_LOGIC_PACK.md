# R4 Pulse — Logic Pack

What every screen actually shows, where each number comes from, and how it is calculated. Send this after the first design frames exist. Design around these numbers; do not invent placeholders.

All figures are real, from R4's VCK billing system, Veri-Shred operations system and QuickBooks general ledger, as at September 2026. Where a figure is modelled rather than measured, it says so.

---

## 1. The numbers at the top

| Number | Value | Basis |
|---|---|---|
| Core revenue, monthly | **$646,519** | Storage plus service, six-month average March to August 2026, invoice date, posted invoices only, Citadel (`custno 00870`) held apart |
| Target | **$1,000,000 a month** | Trisha's stated goal for core storage and service |
| Gap | **$353,481 a month** | Target less core |
| Last twelve months revenue | $10.16m | Reconciles to the accounts within 0.4% |
| Storage, LTM | $4.66m (46%) | Billed monthly in advance on the 1st; 422 customers; 1.2m boxes |
| Service, LTM | $5.50m (54%) | Everything that needs a truck |
| September 2026 billing | $622,224 | Storage $388,813 · Service $233,411 (invoice date) |
| October in-month range | **$598k – $699k**, narrowing through the month | Storage known from the October run at $387,101 (`v_current_run`); core service at the last six posted months' range, $211,133–$311,665 |
| September service vs August | **−36%** | August service was $364,052 — September the weakest service month in two years, bar the November 2025 credit run |
| Early-2025 six-month average | $781,590 | January–June 2025, same basis. The decline is −17% over eighteen months, three-quarters of it service |

---

## 2. Storage and service as two businesses

| | Storage | Service |
|---|---|---|
| Revenue, LTM | $4.66m | $5.50m |
| Monthly range, 23 months | $380k – $447k | −$60,759 (November 2025 credit run) to $781,944 (April 2026) |
| Customers | 422 | 219 active (up from 178 average in 2025, +23%) |
| Growth, year on year | about −8% | customers up, revenue down |
| Gross margin | about 62% (revenue less facilities pool) | not yet calculable — runs once the cost model is in the database. Empty state with that reason; expected well under 32% |
| Lead indicator | **Retention rate** — not yet calculable, needs box in/out history from VCK. Design as an honest empty state with that one-line reason; never invent it | **Revenue per stop** — from Veri-Shred service orders |
| What moved | Stepped down $35k a month in July 2025, never recovered. All of it the City of Chicago. | 80% is destruction: shredding, bin rotation, $2.36m ITAD largely for one client |

The twenty-four month chart on Trisha's screen is storage against service, one axis, two lines. Storage is flat with a visible step in July 2025. Service is the volatile one.

---

## 3. The customer story that proves the drill-down

Use this for the six-level walkthrough. Every level has a real number.

| Level | What it says | Number |
|---|---|---|
| 1 Company | Core revenue is short of target | $646,519 vs $1.0m |
| 2 Half | Storage stepped down and stayed down | $417–447k through early 2025 → $381–387k from July 2025 |
| 3 Family | Carton storage, not retrieval or handling | Storage line only |
| 4 Customer | City of Chicago group has fallen 74% | $211,304 a month (Aug 2025) → $55,755 (Aug 2026), roughly $1.9m annualised |
| 5 Line | Two things: 2FM storage rate stepped down; Badging scanning project ended | Storage −$29.5k a month from July 2025. Badging peaked at $138k in July 2025, ended August 2025, now $960 a month |
| 6 Rate | 2FM pays $0.137 a box a month against a $0.60 list and a $0.0994 cost to house ◇ | 227,915 boxes. Law firms pay $0.191–$0.434 for the same thing |

Source line at every level: `invoices` and `priced_lines`, 24 months to August 2026; `storage_rate_hist` for the rate change date.

---

## 4. The cost model (one object, every screen uses it)

Nothing is a percentage of revenue. Every rate is a GL pool divided by the volume that consumed it.

| Rate | Value | Derivation | Status |
|---|---|---|---|
| Facilities | $0.0994 per box per month | 7028 Bldg Exp and 7335660 Maintenance payroll, $1,354,998 a year ÷ (1,135,790 boxes × 12) | provisional |
| Handling | $7.53 per box movement | 40% of warehouse payroll and temp labour, supplies, equipment, half of uniforms, $489,999 a year ÷ 65,065 box movements (retrievals, pulls, returns, delivery boxes) | provisional |
| Shred plant | $0.1509 per lb | 60% of warehouse payroll and temp labour, Allegheny, shredding payroll, $468,144 a year ÷ 3,102,089 lb (S3 + S5 less shred-truck pounds + estimated unweighed boxes and bins) | provisional |
| Route day | $450.62 | Drivers payroll 7335700, 7011 Auto, Routeware, half of uniforms, $595,725 a year ÷ 1,322 route days | provisional |
| Driver hour | $32.49 | ADP payroll, loaded | measured |
| Service Centre hour | $25.05 | ADP payroll, loaded | measured |
| Visits per route day | 3.27 | 4,329 customer visits ÷ 1,322 route days, September 2025 to August 2026; a visit is one customer on one route on one day | observed |
| Services per visit | 5.80 | 25,102 done services ÷ 4,329 customer visits | observed |
| Average miles from yard | 11.4 | Volume-weighted across 150 postcodes | observed |
| Pounds per bin | the account's S5 recorded weight; without it, by size: 95-gallon 219.3, 65-gallon 121.7, executive 34.9, under-desk 15.7 | S5 on single-code work orders | **estimate** where there is no S5 |
| Pounds per shred box | 28.4 | S5 ÷ boxes on 256 work orders carrying both | **estimate** |
| Pounds per ITAD unit | 1.5 | Media destruction is not weighed; paper rate stands in | **estimate** |
| Travel / on-site split of a route day | 40 / 60 | **The one assumption.** GPS, arrival times and durations were never captured — 0 real values across 365,000 records | assumed, exposed as a slider |

### How a cost is built, by service family

- **Storage** — boxes × facilities × 12. No route time, no handling.
- **Retrieval / carton process** — movements × handling. Warehouse work only; no route time.
- **Delivery / pickup** — visits × travel + visits × on-site + movements × handling. Visits = units ÷ 5.80 unless known.
- **Bin rotation** — visits × travel + visits × on-site + the account's S5 pounds × shred plant (bins × lb per bin by size where there is no S5).
- **ITAD / media destruction** — visits × travel + visits × on-site + units × 1.5 lb × shred plant. Visits = units ÷ 4,000.
- **Labour** — hours × the loaded hourly rate.

Travel per visit = (route day × travel share ÷ 3.27) × (miles ÷ 11.4). On-site per visit = route day × (1 − travel share) ÷ 3.27.

### Worked example: Ingalls Hospital, bins

3,540 done bin services in the twelve months to August 2026 (VCK billed 3,821), 101 customer visits,
11.4 miles, 154,887 lb recorded on S5. *Rewritten 24 October 2026: the earlier 6,886 bins, 62 visits
and $3.26 a bin gave −$41,549, which the database and the derived rates do not support.*

| Line | Per bin | A year |
|---|---|---|
| Travel to site — 101 visits at $55.05 | $1.57 | $5,560 |
| Time on site — 101 visits at $82.57 | $2.36 | $8,339 |
| Shred plant — 154,887 lb at $0.1509 | $6.60 | $23,374 |
| **Total cost to serve** | **$10.53** | **$37,273** ◇ |
| Revenue, twelve months invoiced | | $38,421 |
| **Gross margin** | | **+$1,148 (+3%)** — thin, not below cost |

---

## 5. Pricing screen — what the book pays

Each service: percentile summary of the modal invoiced rate per account, thirteen months to September 2026, and the 2025 list price. The distribution strip draws every account as a dot across this range.

| Service | Accounts | Min | 10th | 25th | **Median** | 75th | 90th | Max | List |
|---|---|---|---|---|---|---|---|---|---|
| 95-gallon bin rotation | 371 | $7.00 | $14.50 | $19.00 | **$22.00** | $28.00 | $41.00 | $190.61 | $45.00 |
| Executive bin rotation | 155 | $3.50 | $11.00 | $15.50 | **$18.00** | $24.00 | $37.50 | $126.50 | $45.00 |
| Delivery | 289 | $9.50 | $11.50 | $11.50 | **$12.10** | $14.00 | $22.00 | $48.00 | $35.00 |
| Retrieval / carton process | 318 | $0.95 | $1.45 | $1.70 | **$2.05** | $2.60 | $3.40 | $6.75 | $2.50 |
| Carton storage, per box per month | 422 | $0.121 | $0.137 | $0.185 | **$0.246** | $0.330 | $0.434 | $0.950 | $0.600 |
| Certified media destruction, per unit | 47 | $1.80 | $2.63 | $3.90 | **$5.20** | $6.80 | $8.00 | $12.50 | $8.00 |
| Labour / data entry, per hour | 36 | $28.00 | $38.00 | $43.48 | **$55.00** | $68.00 | $78.00 | $95.00 | $75.00 |

Named accounts that sit on the strip (label these):

- **95-gal bins:** Ingalls Memorial $3.26 · Sinai Health $14.00 · Loyola $19.00 · Northwestern $22.00 · Rush $26.50 · Advocate $31.00
- **Executive bins:** Larabida $1.65 · City of Chicago 2FM $8.50 · Jenner & Block $18.00 · K&L Gates $21.00 · Latham & Watkins $24.00 · Chapman & Cutler $37.50
- **Delivery:** 2FM $11.50 · Latham & Watkins $11.50 · SG Americas $12.10 · City of Chicago Admin $14.00 · Northwestern $18.00 · Grosvenor $22.00
- **Storage:** Airfield Operations $0.121 · Administration $0.127 · City of Chicago 2FM $0.137 · Latham & Watkins $0.191 · K&L Gates $0.228 · Chapman & Cutler $0.434
- **ITAD:** Grosvenor $2.63 · SG Americas $5.20 · Citadel $8.00
- **Labour:** City of Chicago 2FM $43.48 · Northwestern $68.00

### Verdict rules

Three states, by comparing the entered price to cost to serve and to the median:

| State | Condition | Colour | Sentence pattern |
|---|---|---|---|
| Below cost | price < cost to serve | red #B3261E | "$2.78 is below what this costs to serve. Cost to serve is $11.54 a bin service. Every one loses $8.76, and the volume makes it worse, not better." (Larabida, derived rates) |
| Below median | cost ≤ price < median | amber #C07A1E | "$14.00 earns, but sits below the median. Cheaper than 71% of the 371 accounts on this service." |
| Sound | price ≥ median | **ink — no colour** | "$25.00 is a sound price. Cheaper than 38% of the 371 accounts. Cost to serve is $10.53." |

Colour marks exceptions, never the default. "Sound" and "up" sit in ink; only amber and red carry status colour. R4's brand green is reserved for the masthead, links and the drill affordance, so it never collides with a status. Amber and red pass colour-blind separation against a light surface.

### What the decision is worth — three cells

At your price · at the comparison (median / list / upper quartile, user's choice) · break-even price. Each shows annual gross margin in dollars and the per-unit rate.

---

## 6. Activity screen — Mike's numbers

| Fact | Value |
|---|---|
| Routes | Four daily: Mark (suburbs), Jorge (downtown), Demond (south), Angel (suburbs) — plus FLT02 and others |
| A typical day | Thursday 17 September 2026: 283 services booked, 200 done, 23 customers, 6 routes (`v_route_day`) |
| Weekday imbalance | Week of 14 September 2026, booked: Mon 184 · Tue 209 · Wed 216 · **Thu 283** · **Fri 117** — a 2.4× spread; done: 125 · 108 · 160 · 200 · 44 |
| Single-stop journeys | 1,145 trips in nine months carried one or two stops; ~$43k a year |
| Scheduling | 97% of bin work booked as "Client Request Rotation" — reactive. The schedule module is in use (rules updated 19 October 2026, 34,421 links to placements); "last rule May 2021" was wrong |
| Bin fill | Measured bins emptied at 13–15% full |
| Idle placements | 4,336 of 7,509 bin placements unserviced this year |
| Route productivity | One route at 34 effort units a day vs 72–74 for peers |
| Postcode concentration | Four customers are 70% of 17 September; Mark covers five south-suburb postcodes (60409, 60422, 60448, 60473, 60477) |

Route-day P&L per driver per day becomes computable once pay rates are loaded: invoiced value of the day's orders, less driver pay and $445,508 ÷ 1,134 of vehicle cost. The week grid is coloured by that margin.

---

## 7. Calls screen — the signals

Ten accounts a week, each put on the list by one of these signals:

| Signal | Example | Count today |
|---|---|---|
| Rate not raised in two years | Administration: 20 service lines, $105,670, delivery at $14.00, retrieval at $1.70 | **16 accounts** |
| Below cost to serve | Larabida $991 a year for 356 bin services that cost $4,108 to serve | from `scripts/levers.js` section 3 |
| Storage with no destruction | Every law firm; the whole City group | ~60 |
| Destruction with no storage | Citadel, $1.6m, 24% of revenue, nothing contractual | 1 critical |
| Volume up 20% against own six-month run | from `kpi.customer_monthly` | varies weekly |
| Boxes past retention review | 286,786 boxes across the book; destruction at $10 a box ≈ $2.87m one-off against ~$1.10m a year of storage forgone | by customer |
| Account down two months running | City of Chicago (level1 8153): below its own six-month mean every month since January 2026, flagged every month since February 2026 | from `kpi.customer_monthly` |

Each card: the signal, the evidence in two lines with numbers, a suggested opening line, and three actions — call, email, not this week. Logging the outcome is the only input.

---

## 8. Rate increase history — what "the January round" means

| Round | Share of all rates that moved |
|---|---|
| January 2025 | 59% |
| April 2025 | 7% |
| July 2025 | 10% |
| October 2025 | 5% |
| January 2026 | 58% |
| April 2026 | 45% |
| June 2026 | 46% |
| Never, in two years | 16 accounts |

The process works. Sixteen accounts fell through it. From `priced_lines`, modal rate by customer and service, 24 months.

---

## 9. Concentration

| Group | Share of revenue |
|---|---|
| Top 5 customers | 35.5% |
| Top 20 | 57% |
| Top 50 | 75% |
| Largest (Citadel) | $1.6m, 100% service, zero storage |

---

## 10. What the screens never show

- A number without its comparison (last year, own six-month run, or the book's median)
- A modelled figure set the same as a measured one
- A chart without its source line
- Two y-axes
- A pie chart, a gauge, a KPI-tile row, a target meter with commit buttons
- Overhead inside "gross margin" — it is revenue less cost to serve and the label says gross

---

*Sources: VCK `invoices`, `priced_lines` (36 months), `storage_rates`, `storage_rate_hist`, `storage_retention`; Veri-Shred service orders, routes, bin placements; QuickBooks GL to August 2026. Rates marked measured come from the GL over twelve months of volume. The 40/60 route-day split is the one input that is not in the data.*
