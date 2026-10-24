# STATUS.md

Where the build stands. Update it at the end of each prompt.

## Where the work happens

- **Code, tests, commits:** Claude Code cloud sessions on `theranjitsaran-lab/r4-pulse`, pushed
  to a branch, merged to `main`.
- **Anything that touches the live database** (applying `sql/`, `npm run kpi:rebuild`, checking
  figures): Claude Code on Theran's PC, which is on the DigitalOcean allow-list. Cloud sessions
  cannot connect and should not try; the `DATABASE_URL` in the cloud environment is stale.
- **Structure without data:** `docs/schema.md`, a snapshot of `kpi`, `model` and `public`
  (24 October 2026). Refresh it from the PC when the schema changes.
- **Tests in the cloud:** `npm run test:offline`, or a local Postgres in the container.

## Done

- **Prompt 1** scaffold. **Prompt 2** cost model.
- **Prompt 3** SQL views and the `kpi` schema; data basis corrected from the database.
  Core $646,519 (six-month average March–August 2026, invoice date, posted invoices only).

## In progress — Prompt 4, the model schema

Branch `levers` (on top of `prompt4-shred` and `setup-tidy`). Rates derived as GL pool ÷ the
database's twelve-month volume, all provisional: route day $450.62 · handling $7.53 · shred plant
$0.1509/lb · facilities $0.0994. Measured 24 October 2026 (`scripts/measure.js`): shred-truck pounds
(228,493) come out of the plant total; Veri-Shred done bins agree with VCK billing within 4%; the
decline is mostly a Pfizer prepayment and an ended badging project plus Access and 2FM. Ingalls and
ICU Medical sign changes accepted. CLAUDE.md, the logic pack and the margin spec carry the new
rates and the Ingalls worked check ($10.53 a bin, +$1,148). 15/15 tests, offline and local Postgres.

Next, on the PC:

1. Apply `sql/model_schema.sql`, then `npm test` with DATABASE_URL set (must pass 15/15).
2. `node scripts/prompt4_before_after.js --accepted="Ingalls,ICU Medical"` and
   `node scripts/levers.js > levers_output.txt`; attach both outputs.
3. Then merge `levers` to `main`, and write the decision ledger from the lever figures.

Open: Mike on shred-truck paper; Anne on a Citadel agreement and on Access (DECISIONS.md).

## Next

Prompt 5 — fixtures, tokens, components, styleguide. Its step 1 (`npm run snapshot`) needs the
database, so it runs on the PC; the fixtures it writes are gitignored and will need to reach
the cloud another way (to be decided).
