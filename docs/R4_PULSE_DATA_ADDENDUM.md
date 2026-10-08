# R4 Pulse — Data Addendum

The three things the logic pack did not carry. All real, from VCK billing and Veri-Shred service orders. Swap these in for the fitted lines and the weekday averages.

---

## 1. The 23-month series — storage, service and Citadel, as invoiced

Monthly, November 2024 to September 2026, from the database (`invoices`, posted runs only). Month is invoice date, `COALESCE(invdate, billdate)`. Storage is `ret_tot`, service is `ser_tot`. Service here is **all** service, including Citadel; Citadel is `ser_tot` where `custno = '00870'`. October 2024 is left out: the table begins with the 1 November 2024 run, and the 36 invoices dated October 2024 are a fragment, not a month.

| Month | Storage | Service | Citadel | Note |
|---|---|---|---|---|
| Nov 2024 | 417,009 | 390,304 | 62,457 | |
| Dec 2024 | 404,628 | 267,272 | 9,340 | |
| Jan 2025 | 447,293 | 260,102 | 0 | January rate round: storage peak |
| Feb 2025 | 418,426 | 562,946 | 5,394 | |
| Mar 2025 | 417,848 | 271,817 | 7,344 | |
| Apr 2025 | 416,867 | 363,973 | 1,078 | |
| May 2025 | 417,225 | 415,699 | 79,074 | |
| Jun 2025 | 416,417 | 418,699 | 44,882 | |
| **Jul 2025** | **383,486** | 421,518 | 51,088 | **The step: storage −$33k and never recovers. 2FM rate cut.** |
| Aug 2025 | 385,625 | 570,041 | 10,743 | Badging scanning project ends this month |
| Sep 2025 | 384,546 | 481,257 | 108,974 | |
| Oct 2025 | 381,775 | 670,960 | 419,664 | |
| Nov 2025 | 381,620 | −60,759 | −432,637 | **Credit run** — service net negative, Citadel the whole of it |
| Dec 2025 | 380,010 | 374,819 | 66,064 | |
| Jan 2026 | 421,243 | 571,903 | 199,505 | January rate round |
| Feb 2026 | 404,162 | 391,660 | 91,691 | |
| Mar 2026 | 393,011 | 292,520 | 76,714 | |
| Apr 2026 | 383,634 | 781,944 | 470,279 | Service peak |
| May 2026 | 383,250 | 428,450 | 138,816 | |
| Jun 2026 | 381,077 | 658,757 | 423,394 | |
| Jul 2026 | 380,879 | 313,977 | 71,147 | |
| Aug 2026 | 387,477 | 364,052 | 89,565 | Includes 26 invoices dated 31 August ($16,060), billed in the 1 September run |
| **Sep 2026** | **388,813** | **233,411** | **22,278** | Includes 34 invoices dated 22 and 24 September ($36,141), billed in the 1 October run. Weakest service month in two years, bar the November 2025 credit run |

*Corrected 8 October 2026.* The first version of this table had August at 347,992 and September at 213,330: an earlier snapshot that put the 31 August batch in September and left out the late-September invoices. Neither invoice date nor bill date in the database reproduces them.

How to read it on the chart:

- **Storage is the flat line with one step.** $404k–$447k through June 2025, then $380k–$389k from July 2025 onward, with a small bump each January when the rate round lands. The step is the City of Chicago 2FM rate falling to $0.137 a box.
- **Service is the volatile line.** Range −$61k to $782k. The spikes (Oct 2025, Apr 2026, Jun 2026) are Citadel ITAD settlements. The November 2025 trough is a credit run and should be drawn as it is, below zero, not clipped.
- **One axis for both.** Storage never leaves $380k–$447k; service swings ten times that. Both on the same axis is the point: it shows which half is the annuity.

### Core versus total

Trisha's $1.0m target is **core**: storage plus service with Citadel held apart. Citadel's monthly service is the column above. It is not a smooth ramp: it swings from −$432,637 (the November 2025 credit run) to $470,279 (April 2026), and the last twelve months sum to $1.64m. The ten-month Citadel series in the first version of this addendum (168,900 rising to 233,100) did not come from the database and is withdrawn; $233,100 is not a Citadel figure. Citadel's September is $22,278.

Core for a month = storage + service − Citadel. Core is volatile month to month because Citadel's settlements land in lumps and its credits net against them; carry the negatives, never clip them. The six-month average is what smooths it for the headline: **$646,519**, March to August 2026, invoice date, posted invoices only. For the chart, draw total service and mark Citadel as a lighter band within it, or draw core service with a note; either is honest, the first is more informative. The band must be allowed to go below zero.

---

## 2. A real day — Thursday 17 September 2026

Every figure below is from `v_route_day` and the Veri-Shred service orders behind it for that date: **283 services booked, 200 done, 23 customers, 6 routes.** "Done" is `billable = 'true'`, the completion flag (data rule 2); the other 83 were booked and not confirmed complete. *Rewritten from the database 8 October 2026; the first version (272 services, 13 customers, 5 routes, Angel with one bin) did not match it.*

### Routes

| Route | Driver | Services | Done | Customers | Postcodes | What happened |
|---|---|---|---|---|---|---|
| MARK | MRS | **137** | 84 | 4 | 60409 · 60422 · 60448 · 60473 · 60477 | Ingalls ×107, UChicago Medicine ×28, UChicago School ×1, NEB Medical ×1. Five south-suburban postcodes, two hospitals 135 of the 137: a dense day. |
| JORGE | JA | **51** | 44 | 8 | 60603 · 60606 · 60607 · 60654 · 60660 | Downtown bins. Walsh ×27, AHA ×10, National Futures ×6, Hoogendoorn ×3, Pearlman ×2, plus three singles |
| FLT02 | JAD | **45** | 37 | 1 | 60649 | Larabida Children's ×45: a whole day on one site for an account that billed $1,264 in the last twelve months |
| DEMOND | DH | **32** | 24 | 4 | 60607 · 60609 · 60622 · 60637 | UChicago School ×18, Access Community ×12, Belmont Bank ×1, Four Corners ×1 |
| ANGEL | ANG | **13** | 9 | 6 | 60130 · 60402 · 60613 · 60618 · 60640 · 60657 | Six small accounts in six postcodes from Forest Park to Lakeview: Center on Halsted ×4, Avenue One ×3, Berwyn Kia ×2, Park Inc ×2 (neither done), Chicago Headache Center ×1, Fettes Love ×1. All booked the day before. The thinnest day: the most postcodes for the fewest services |
| MOBILE | — | **5** | 2 | 1 | — | Chicago Fireman's Credit Union: shred truck, hourly ×4, electronic media ×1. No driver or postcode recorded |
| | | **283** | **200** | **23** | | UChicago School appears on two routes; counted once in the total |

### Services by customer

LTM is the last twelve months of invoiced revenue (October 2025 to September 2026, `kpi.customer_monthly`), service and total.

| Customer | Services | Done | Bin mix | Route | LTM service | LTM total |
|---|---|---|---|---|---|---|
| Ingalls Hospital | 107 | 60 | B3 ×97, B6 ×10 | Mark | $38,488 | $38,488 |
| Larabida Children's Hospital | 45 | 37 | B3 ×21, B6 ×19, B2 ×5 | FLT02 | $1,264 | $1,264 |
| University of Chicago Medicine | 28 | 22 | B3 ×17, B6 ×9, B2 ×2 | Mark | $151,613 | $151,613 |
| Walsh Group | 27 | 24 | B3 ×26, B2 ×1 | Jorge | $142,371 | $171,000 |
| University of Chicago School | 19 | 12 | B3 ×13, B6 ×6 | Demond / Mark | $17,936 | $17,936 |
| Access Community Health Network | 12 | 11 | B6 ×8, B3 ×4 | Demond | $248,271 | $281,960 |
| American Hospital Association | 10 | 10 | B3 ×10 | Jorge | $23,843 | $37,150 |
| National Futures Association | 6 | 5 | B3 ×6 | Jorge | $32,030 | $37,357 |
| Chicago Fireman's Assoc. Credit Union | 5 | 2 | S0 ×4, S4 ×1 | Mobile | $1,436 | $1,436 |
| Center on Halsted | 4 | 4 | B2 ×4 | Angel | $340 | $340 |
| Avenue One | 3 | 1 | B3 ×2, B4 ×1 | Angel | $1,198 | $1,198 |
| Hoogendoorn & Talbot | 3 | 1 | B2 ×2, B3 ×1 | Jorge | $14,734 | $14,734 |
| Berwyn Kia / Meyer Imports | 2 | 2 | B4 ×2 | Angel | $6,913 | $6,913 |
| Park, Inc. | 2 | 0 | B2 ×2 | Angel | $0 | $0 |
| Steven B Pearlman and Associates | 2 | 1 | B2 ×2 | Jorge | $989 | $3,389 |
| Academy of General Dentistry | 1 | 1 | B3 ×1 | Jorge | $122 | $122 |
| Belmont Bank Wicker Park | 1 | 1 | B3 ×1 | Demond | $769 | $769 |
| Chicago Headache Center | 1 | 1 | B3 ×1 | Angel | $2,490 | $2,490 |
| Clune Construction | 1 | 1 | B3 ×1 | Jorge | $956 | $10,475 |
| Eckhardt Trading | 1 | 1 | B2 ×1 | Jorge | $866 | $866 |
| Fettes Love and Sieben Plumbing | 1 | 1 | B2 ×1 | Angel | $187 | $187 |
| Four Corners Taverns | 1 | 1 | B3 ×1 | Demond | $3,107 | $3,107 |
| NEB Medical Services | 1 | 1 | B2 ×1 | Mark | $718 | $718 |

Four customers are 70% of the day: Ingalls 107, Larabida 45, UChicago Medicine 28, UChicago School 19, 199 of 283 services. Between them they billed $209,301 in the last twelve months, nearly three-quarters of it UChicago Medicine. Cost-to-serve flags for these accounts come from `model/rates.js` on the Margin screen, not from this table.

### Bin mix

Capacity is the default weight each order carries for its bin type (`nbtweight`).

| Code | Type | Capacity | Booked | Done |
|---|---|---|---|---|
| B3 | Rotate executive | 80 lb | 202 | 147 |
| B6 | Executive under-desk | 40 lb | 52 | 40 |
| B2 | Rotate 95 gallon | 300 lb | 21 | 9 |
| B4 | Rotate 65 gallon | 175 lb | 3 | 2 |
| S0 | Mobile shred truck | hourly | 4 | 1 |
| S4 | Electronic media | per unit | 1 | 1 |

### The week around it

| | Mon 14 | Tue 15 | Wed 16 | **Thu 17** | Fri 18 |
|---|---|---|---|---|---|
| Services booked | 184 | 209 | 216 | **283** | 117 |
| Done | 125 | 108 | 160 | **200** | 44 |
| Routes | 5 | 5 | 4 | **6** | 4 |

Thursday was the peak. Friday is thin: 117 booked and only 44 confirmed done.

### What this day teaches the Activity screen

- One row per route-day, driver named, with services booked and done, customers, postcodes, and what happened in a sentence. Mark's row and Angel's row should read as obviously different without colour doing the work: 137 services in five adjacent postcodes against 13 in six scattered ones.
- The postcode list is the density signal. Services per postcode is the comparison: Mark 27, FLT02 45, Angel 2.
- Booked is not done. Over a quarter of Thursday’s bookings and almost two-thirds of Friday’s carry no completion flag; the screen shows both counts.
- Route-day margin becomes a number once pay rates are loaded; until then it is a pending state and the sentence carries the day.

---

## 3. October's in-month range

Use **$598k – $699k**. *Corrected 8 October 2026 from $598k–$690k: the top of the service range was understated.* The method:

- Storage is known on the 1st. The October run (`v_current_run`, part `run`) carries **$387,101** of storage; September posted $388,813.
- Service is modelled from the last six posted months of core service (service less Citadel, `kpi.monthly`): **$211,133** (September 2026) to **$311,665** (April 2026).
- So October core = $387,101 + $211,133 to $311,665 = **$598,234 to $698,766**, narrowing as the run completes and posts.

Mark it modelled. The run itself already carries $265,731 of service, $24,352 of it Citadel: **$241,379 core**, inside the range. Its 3,933 invoices are close to a full month (September posted 3,959), so if the run posts as it stands October core lands near $628k. The range stays the published figure until it posts.

---

*Sources: VCK `A_CstInv` monthly totals (storage = Ret_Tot, service = Ser_Tot); Citadel from VCK invoices, `custno 00870`; Thursday 17 September 2026 and the week around it from `v_route_day` (Veri-Shred service orders); October range from `v_current_run` and `kpi.monthly`.*
