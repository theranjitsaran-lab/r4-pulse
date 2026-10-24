# STATUS.md

Where the build stood at the end of the local Claude Code session on Thursday 8 October 2026,
taken from that session's transcript. The CLAUDE.md, DECISIONS.md and PROMPTS.md beside this file
are the versions uploaded on 23 October, which are **older** than the ones in the local repo
(they still say core $643,842, Citadel $233,100, route day $680). The local repo at
`C:\Users\Thera\Documents\r4-pulse` holds the corrected versions.

## Done

- **Prompt 1** Scaffold. **Prompt 2** Cost model (10/10 tests).
- **Prompt 3** SQL views and kpi schema. Committed locally as `c0dd42d`, "SQL views and kpi schema;
  data basis corrected from the database". Not known to be pushed anywhere.
  - Six views: `v_monthly_storage_service`, `v_current_run`, `v_customer_monthly`,
    `v_rate_by_customer_service`, `v_route_day`, `v_kpi_industry`. `npm run kpi:rebuild` builds them
    and `kpi.monthly` (23 rows) and `kpi.customer_monthly` in one transaction.
  - Database wins over the documents. 23 months, November 2024 to September 2026.
    August 2026 service 364,052; September 233,411.
  - Citadel = `ser_tot` where `custno = '00870'`, negatives carried. The 168,900 → 233,100 series
    is withdrawn; Citadel September is $22,278.
  - Core = **$646,519**, six-month average March–August 2026, invoice date, posted invoices only.
    The fall from $781,590 (January–June 2025) is −17%.
  - October range corrected to $598k–$699k. Addendum §2 (17 September) rewritten from
    `v_route_day`: 283 booked, 200 done, 23 customers, 6 routes. Prompt 9 now checks against
    `v_route_day`, not the addendum.

## In progress — Prompt 4, not committed

- `sql/model_schema.sql` applied to the database: `gl_pool`, `pool_split`, `driver_volume`,
  `rate_override` (empty), `change_log` with a trigger, and `service_family` (91 codes).
- Pools reconciled to the P&L Detail file (7028 = $1,777,803.49). §7 double-counted Crown and
  Allegheny; fixed. The $800,291 of 7335 salaries is reconciled (see the transcript).
- Rates derived as pool ÷ the database's twelve-month volume (Sep 2025–Aug 2026), GL annualised
  × 12 ÷ 17.1, all marked provisional:

  | Rate | Was | Now |
  |---|---|---|
  | Route day | $680 | $450.62 ($595,725 ÷ 1,322) |
  | Handling | $6.13 | $7.53 ($489,999 ÷ 65,065 movements) |
  | Shred plant | $0.34/lb | $0.2666/lb ($468,144 ÷ 1,756,127 lb) |
  | Facilities | $0.124 | $0.0994 |
  | Visits per route day | 5.4 | 3.27 (customer-days) |
  | Services per visit | 6.5 | 5.80 |

- New `shred` family (S3, S5 weighed paper). Ingalls test now 3,540 services, 101 visits →
  $10.32 a bin, $36,547 a year. 12/12 tests pass with and without `DATABASE_URL`.

## Open — waiting on Theran

1. **S5 pounds.** S5 double-counts bin paper and S3 + S5 (2,968,424 lb) ≠ the rate's
   denominator (1,756,127 lb). Option (a) S5 drives shred, bin drops its lb line, volume
   = S3 + S5, rate ~$0.158/lb; option (b) S5 is a record only, S3 drives shred, add S3's
   836,376 lb to the volume.
2. Then: the eight-account before/after (Ingalls, Larabida, ICU Medical, City of Chicago 2FM,
   UChicago Medicine, Chapman & Cutler, Walsh, Citadel); stop if any margin changes sign.
3. Then: replace rate figures in CLAUDE.md, the logic pack and the margin spec; DECISIONS.md line;
   commit "Prompt 4: model schema; rates derived from pools and database volumes".
