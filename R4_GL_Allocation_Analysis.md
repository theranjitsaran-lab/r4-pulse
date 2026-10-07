# R4 — GL allocation analysis

Source: QuickBooks Profit and Loss Detail, 1 January 2025 – 4 June 2026 (17.1 months), read at
transaction level. Total expense accounts $15.47m before exclusions.

---

## 1. A correction to the current cost model

**`7400 Transportation Expense` is air travel, not vehicles.**

| Vendor | Amount |
|---|---|
| United Airlines | $31,250 |
| American Airlines | $26,939 |
| Uber | $21,149 |
| Citi Cards | $18,725 |
| Unnamed | $102,385 |

The $620 route day was built as `drivers $256,429 + vehicles $445,508 ÷ 1,134 route days`, where
"vehicles" was `7011 Auto` **plus** `7400 Transportation`. Roughly **$219,000 of airline tickets
and Ubers has been sitting inside the cost of driving a truck around Chicago.**

Removing it, and using the GL's own driver salary line rather than the ADP extract:

| | Old | Corrected |
|---|---|---|
| Driver payroll | $256,429 (ADP) | **$510,098** (GL `7335700`) |
| Vehicles | $445,508 (auto + air travel) | **$226,485** (`7011` only) |
| Pool | $701,937 | **$736,583** |

The two errors partly cancel, so the route day lands near where it was — but for the right
reasons, and the driver figure is now consistent with the GL rather than a separate file.

**`7096 Equip Lease` is also mislabelled** — $34,804 of it is a Lexus. Not equipment, not allocable.

---

## 2. R4 has vehicle telematics

`7011 Auto Expense` contains **Teletrac, Inc. — $6,406**.

Veri-Shred's GPS fields were never switched on, which is why the travel/on-site split had to be
assumed at 40/60. But Teletrac is a fleet-tracking platform, so **the mileage and stop-duration
data may already exist outside VCK.** If Mike can export it, the one genuinely assumed input in
the entire model becomes measured.

This is the single highest-value follow-up in this analysis.

---

## 3. What can now be allocated

About **$820,000 a year** of cost currently sitting above the line has a defensible driver.

| Account | 17-month | Annualised | Driver | Basis |
|---|---|---|---|---|
| `7385` Temporary Services — Anchor $271,166 + Banner $111,865 | $383,031 | $268,724 | movements / pounds | Warehouse agency labour. Split 40/60 like permanent warehouse payroll |
| `7385` Temporary Services — **Citadel $167,068** | $167,068 | $117,224 | direct to Citadel | Labour billed against Citadel work. A direct cost, not an overhead |
| `7435` Warehouse Supplies | $154,999 | $108,760 | movements | Containers, Adapt-A-Pak, wire, Home Depot |
| `7095` Equipment | $119,076 | $83,551 | movements | Warehouse plant |
| `7410` Uniforms | $85,799 | $60,205 | route days / movements | Drivers and warehouse staff |
| `7064` Computer — **Routeware $69,426** | $69,426 | $48,720 | route days | Route optimisation software |
| `7098` Repairs — Allegheny Shredders $32,500 | $32,500 | $22,807 | pounds | Shred plant maintenance |
| `7098` Repairs — Crown Equipment $12,205 | $12,205 | $8,565 | movements | Forklifts |
| `7064` Computer — **Datamation $69,940** | $69,940 | $49,081 | scanning revenue | Already netted against scanning income in the GL — see §5 |
| **Total** | **$1,094,044** | **$767,637** | | |

**Effect on the rates**, annualised and applied to the existing volumes:

| Rate | Now | With the additions | Change |
|---|---|---|---|
| Handling, per movement | $4.70 | **$6.13** | +30% |
| Shred plant, per pound | $0.25 | **$0.34** | +36% |
| Route day | $620 | **$680** | +10% |

**This matters for the loss-makers.** Ingalls' break-even rises from $7.17 a bin to roughly
$9.40. Larabida gets worse. And several accounts currently showing thin-but-positive margins
move closer to the line.

---

## 4. What must stay out — and needs raising

These are not allocable, and three of them need a conversation before this tool goes near a board.

| Account | 17-month | Note |
|---|---|---|
| `7195` Meals & Entertainment | **$1,202,844** | $1,082,127 of it on **one Citi card**. That is roughly 12% of annual revenue. Also Gold Coast Tickets $57,646 |
| — Trisha Personal Expenses | **$592,523** | Booked as an expense sub-account |
| `7050` Charitable Contributions | $314,885 | Saint Ignatius $55,000, Chicago Public Library Foundation $49,286, Denison University $15,416 |
| `7170` Legal & Professional | $532,745 | Includes **Philip B. Rooney, Jr. $180,000** — related party |
| `8700` Citadel accounts | $806,116 | Pass-through. The `REFUND FROM REBATE` line alone is $656,857 |
| `7360` Taxes | $323,596 | $305,000 is an Illinois PTE payment — below the operating line |
| `7096` Equip Lease | $53,229 | $34,804 Lexus |

**Roughly $2.1m of the $15.5m expense base is owner-related or discretionary.** That is not a
costing question, but it is the reason any "we need to raise prices to close a $354k monthly gap"
conversation will get a sharp response from a buyer or a lender. It belongs in the diagnostic, not
in the cost model.

---

## 5. Two accounting issues to fix at source

**Datamation is netted against scanning income.** $69,940 of supplier cost sits in `7064` while the
related revenue is reduced in `6060 Scanning`. Both revenue and cost are understated, so scanning
margin cannot be read from the GL at all.

**`7335 Salaries` does not reconcile to its own sub-accounts.** The parent totals $5,002,253; the
named sub-accounts total $2,529,687. Around $2.47m sits in deeper sub-sub-accounts
(`733570A Regular`, `7335601 Hourly`, and so on). Workable, but the extract has to walk the full
tree rather than reading the parent, or pools get double-counted.

**Salary pools as the GL actually holds them:**

| Sub-account | 17-month | Allocable? |
|---|---|---|
| `7335200` Sales | $1,675,247 | No — 33% of salary cost, purpose still unexplained |
| `7335100` Management | $662,346 | No |
| `7335600` Warehouse | $651,401 | **Yes** — movements and pounds |
| `7335700` Drivers | $510,098 | **Yes** — route days |
| `7335450` Scanning + Data Entry | $468,568 | **Yes** — scanning revenue |
| `7335440` Aviation + Badging | $234,303 | **Yes** — a named customer group |

`7335440 Aviation + Badging` is worth noting on its own: **$234,303 of payroll dedicated to the
City of Chicago aviation and badging accounts** — the same group whose revenue has collapsed.
Badging revenue is now $960 a month against a $30,112 run rate. That is a quarter of a million in
salary attached to a shrinking relationship.

---

## 6. Period alignment — do this before recomputing anything

The GL covers **17.1 months**. The volume denominators do not:

- 1,134 route days — 2026 to date
- 135,000 movements — a twelve-month figure
- 1.2m boxes — a point-in-time count
- 1.5m pounds — approximate, twelve months

Every rate in the current model divides a 17-month cost by a 12-month volume, or vice versa.
The figures have been close enough to be useful, but they are not internally consistent.

**Fix:** restate every pool and every volume over the same window — the twelve months to
31 August 2026 — and store both in `model.gl_pool` and `model.driver_volume` with explicit
`period_from` and `period_to`. That is exactly what those tables were designed for.

---

## 7. Proposed seed for `model.gl_pool`

Annualised from the 17.1-month figures, pending the period restatement above.

| pool_id | amount | allocated | driver | share |
|---|---|---|---|---|
| facilities | 1,247,230 | yes | boxes | 1.00 |
| warehouse_perm | 456,983 | yes | movements 0.40 / pounds 0.60 | |
| warehouse_temp | 268,724 | yes | movements 0.40 / pounds 0.60 | |
| warehouse_supplies | 108,760 | yes | movements | 1.00 |
| warehouse_equipment | 92,116 | yes | movements | 1.00 |
| shred_maintenance | 22,807 | yes | pounds | 1.00 |
| drivers | 357,964 | yes | route_days | 1.00 |
| vehicles | 158,937 | yes | route_days | 1.00 |
| route_software | 48,720 | yes | route_days | 1.00 |
| uniforms | 60,205 | yes | route_days 0.5 / movements 0.5 | |
| scanning | 378,915 | yes | scanning revenue | 1.00 |
| citadel_direct | 117,224 | yes | direct to Citadel | 1.00 |
| aviation_badging | 164,423 | yes | direct to that customer group | 1.00 |
| sales | 1,175,612 | **no** | — | — |
| management | 464,804 | **no** | — | — |
| overhead | (to confirm) | **no** | — | — |
| discretionary | 1,479,000 | **no** | — | flagged separately, not a cost of service |

---

## 8. What to ask for

**Mike, one question:** can Teletrac export mileage and stop duration? It would replace the only
assumed input in the model.

**Anne, three:**
1. Monthly P&L by account code for the twelve months to August 2026 — so pools can be trended and
   aligned to the volume window.
2. What does `7335200 Sales` at $1.68m actually cover? It is a third of all salary cost.
3. Can Datamation be booked as a cost of sale rather than netted against scanning income?
