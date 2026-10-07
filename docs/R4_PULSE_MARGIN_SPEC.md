# R4 Pulse — Margin

What the Margin view is, what it shows, and the real figures to design with. Gross margin is **revenue less cost to serve** — no sales, admin or management overhead — and the label always says "gross".

---

## 1. What it answers

Three questions, in this order, for Trisha and Anne:

1. **Who earns and who costs?** Every customer ranked by gross margin, worst at the top.
2. **Which kind of work earns?** Margin by service family — storage, bins, ITAD, movement, retrieval — so it is obvious that storage is the annuity and bins are where the losses hide.
3. **What would fix each loss?** For every account below cost, the price that gets it to break-even, using the same cost model as Pricing, line for line.

It is not a tab of its own. It opens from Pulse ("Needs a decision → Ingalls is below cost → Open") and from Pricing ("where does this customer sit in the book?").

---

## 2. How margin is built

Same cost model as the Pricing screen. Nothing is a percentage of revenue.

| Family | Cost per unit | Where it comes from |
|---|---|---|
| Storage | $0.124 a box a month | Facilities pool ÷ 1.2m boxes. No route time, no handling. |
| Retrieval / handling | $6.13 a movement | Warehouse payroll ÷ 135,000 movements. Warehouse work only. |
| Delivery / movement | travel + on-site per visit, plus $6.13 handling per box | A $680 route day, 5.4 visits a day, 40/60 travel/on-site |
| Bin rotation | travel + on-site per visit, plus 24 lb × $0.34 shred | Bin weights are defaulted for executive consoles — **partial** |
| ITAD / media destruction | travel + on-site per collection, plus 1.5 lb × $0.34 | Media is not weighed — **estimate** |

Where a customer's margin leans on a partial or estimated rate, the row carries the modelled mark.

---

## 3. The customer ranking — real figures

Eight accounts, twelve months, cost model run over their actual invoiced lines and visit counts. Worst at the top, because that is where the decisions are.

| Customer | Revenue | Cost to serve | Gross margin | Margin % | Mix | What is going on | Fix |
|---|---|---|---|---|---|---|---|
| **Larabida Children's** | $991 | $6,684 | **−$5,693** | **−575%** | bins 100% | 601 services a year for $991. A floater spends whole days on one site. | $8.70 a bin to break even; or release the route capacity |
| **Ingalls Hospital** | $25,643 | $65,529 | **−$39,886** | **−156%** | bins 88% · ITAD 12% | 6,886 bin swaps a year across 62 visit days. The fee fell while volume held. | $9.29 a bin to break even; $7.20 recovers the loss without profit |
| ICU Medical | $196,621 | $153,244 | $43,377 | 22% | storage 57% · handling 37% · movement 6% | More than one movement per stored box a year, on below-median rates | Handling rate to the $2.05 median |
| City of Chicago — 2FM | $650,772 | $471,250 | $179,522 | 28% | storage 58% · handling 36% · movement 6% | Largest storage account at $0.137 a box against $0.60 list; revenue down 43% in a year | $0.25 a box adds $309k a year |
| UChicago Medicine | $100,961 | $63,227 | $37,734 | 37% | bins 88% · movement 12% | Flat monthly fee, $18.55 a service against a $45 list, unchanged as volume grew | Volume-banded fee |
| Chapman & Cutler | $457,697 | $142,562 | $315,135 | 69% | storage 93% · handling 4% | A large archive that barely moves. The model relationship. | None — protect it |
| Walsh Group | $125,219 | $15,536 | $109,683 | 88% | bins 91% · ITAD 9% | Bin rotation at $119.94 a service, dense and downtown | None |
| Citadel | $1,614,202 | $180,315 | $1,433,887 | 89% ◇ | ITAD 99% · movement 1% | 90% of ITAD revenue and 24% of the company, nothing contractual, no storage | Win the storage; the margin figure leans on the 1.5 lb estimate |

◇ modelled — the ITAD plant cost uses an estimated weight; the true margin is likely lower but still the highest in the book.

Two things the table makes visible without a chart: the two losses are both **flat-fee bin contracts at hospitals**; and the two best margins are a **storage annuity** and a **dense downtown bin route** — the two things R4 should sell more of.

---

## 4. Margin by service family

Across the whole book, twelve months. Storage is measured; the service families carry the model.

| Family | Revenue | Gross margin % | Confidence | Read |
|---|---|---|---|---|
| Storage | $4.66m | about 62% | measured (GL facilities over boxes) | The annuity. Iron Mountain reports 70.5%; the gap is the $0.137 accounts. |
| Bin rotation | ~$1.8m | **not yet run across the book** | partial — console weights defaulted | The family with the widest rate spread (27×) and both known losses |
| ITAD / media destruction | $2.36m | high ◇ | estimate — media not weighed | One customer |
| Movement (delivery, pickup) | ~$0.3m | **negative at the median rate** | modelled | $12.10 median against $25.62 cost to serve |
| Retrieval / handling | ~$0.4m | positive | measured | Warehouse work; low cost floor |
| Labour | ~$0.3m | positive | measured | 2FM at $43.48 against a $55 median |

The book-wide family margins are the numbers that run once the cost model is in the database. Until then, design the rows with the two that are known (storage, movement) filled in and the rest as honest empty states.

---

## 5. Drill-down from a customer

Click a row and it opens to the lines beneath it. Use Ingalls:

| Line | Family | Units | Visits | Revenue | Cost | Margin |
|---|---|---|---|---|---|---|
| Bin rotation — flat fee | bin | 6,886 | 62 | $22,455 | $63,997 | −$41,542 |
| Purge and box shredding | ITAD | 180 | 3 | $3,188 | $1,532 | $1,656 |
| | | | | **$25,643** | **$65,529** | **−$39,886** |

Then the cost of the bin line, built up the same way the Pricing screen shows it:

| Cost line | Per bin | A year |
|---|---|---|
| Travel to site — 62 visits at $50.37 | $0.45 | $3,123 |
| Time on site — 62 visits at $75.56 | $0.68 | $4,684 |
| Shred plant — 6,886 bins at ~24 lb, $0.34/lb | $8.16 | $56,190 |
| **Cost to serve** | **$9.29** | **$63,997** |

And beneath that, the visits themselves — 62 rows from Veri-Shred: date, driver (Mark), postcode (60406), bins serviced. That is level six of the drill path, and it is where Trisha stops doubting the number.

---

## 6. What the screen looks like, in words

Ledger register. One table, dense, sorted worst-first. Columns: customer, revenue, cost to serve, gross margin, margin %, a small stacked bar of family mix, a one-line "what is going on", and the fix. Rows below cost carry the red status; rows below the book's median margin carry amber; everything else sits in ink. Family filter chips above the table. Click a row to expand it in place to its lines; click a line to expand to its cost build; click the cost build to see the visits.

No chart on the ranking itself — the table is the chart. One chart on the family view: six families as a horizontal bar of margin %, with the modelled ones hatched.

---

## 7. How deep it goes — a real example, to the box

The drill path does not stop at the visit. VCK records every retrieval, return and destruction pull **one row per box, with the barcode**. From the work-order extract for 1 June to 10 July 2026 — six weeks, 10,310 lines, 1,381 work orders, 587 customers:

### ICU Medical, six weeks

| Work order | Date | Delivery | What happened | Lines | Status | Keyed by |
|---|---|---|---|---|---|---|
| 534171 | 1 Jun | **Rush** | 4 boxes retrieved, plus the rush fee | 5 | Verified | MCK |
| 534420 | 9 Jun | Standard | 3 retrieved, 4 returned | 7 | Verified | MCK |
| 534551 | 12 Jun | None (warehouse) | 3 retrieved, 1 returned, 1 document scanned (2,570 images) | 5 | New | MCK |
| 535052 | 29 Jun | Standard | 6 retrieved, 3 returned | 9 | Verified | MCK |
| **535149** | **30 Jun** | None (warehouse) | **2,103 boxes pulled for destruction**, 1 retrieval-shredding line | 2,104 | In progress | MCK |
| 535340 | 7 Jul | Standard | 19 boxes returned | 19 | Verified | MCK |
| 535569 | 10 Jul | None | 2 retrieved | 2 | New | MCK |

Open work order 535149 and the rows beneath it are the boxes: barcodes 687709, 687710, 687711, 687728, 687731, 687732, 687736, 695931 … and 2,095 more. Each one is a $6.13 handling movement, so that single work order carries **$12,891 of warehouse cost** before anything is invoiced — and it is still marked in progress four months later. That is the kind of thing the margin screen should surface: a cost incurred, a revenue not yet raised.

### What the extract shows about the whole book

| | Six weeks |
|---|---|
| Lines | 10,310 |
| Work orders | 1,381 |
| Customers touched | 587 |
| Warehouse-only (no delivery) | 57% of lines |
| Standard delivery | 42% |
| Rush delivery | 7 lines — rush is almost never charged |
| Largest single customer by lines | ICU Medical, 2,151 (one destruction pull) |
| Heaviest records route | 30: Downtown / Near North — Angel, 898 lines |
| Keyed by | MCK 89% of all lines |

So the drill path is seven levels, not six, and every one is a real table:

**Company → half → family → customer → work order → line → box.** Date, delivery type, status, who keyed it, and the barcode at the bottom.

Design implication: the deepest view is a plain list, and it has to look like it belongs to the same product as the headline sentence on Trisha's phone. Same type, same source line, same modelled mark. If the box list looks like a database export, the drill-down loses the trust it was built to earn.

*Source: VCK work orders, `workorders_060126_to_071026`, 1 June to 10 July 2026.*

*Sources: VCK `priced_lines` twelve months to August 2026 for revenue and units; Veri-Shred service orders for visit counts; GL pools to August 2026 for rates. Margin figures above are the cost model run over each account's actual lines.*
