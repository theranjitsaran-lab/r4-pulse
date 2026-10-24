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

Committed as WIP (`c75599c`). `sql/model_schema.sql` is applied to the live database; rates are
derived as pool ÷ the database's twelve-month volume, all provisional. 12/12 tests pass.

Open, waiting on Theran:

1. **S5 pounds.** S5 double-counts bin paper, and S3 + S5 (2,968,424 lb) does not match the shred
   rate's denominator (1,756,127 lb).
   - (a) S5 drives shred cost, the bin family drops its own pound line, volume = S3 + S5,
     shred rate about $0.158/lb.
   - (b) S5 is a record only, S3 drives shred, and S3's 836,376 lb is added to the volume.
2. Then the eight-account before/after (Ingalls, Larabida, ICU Medical, City of Chicago 2FM,
   UChicago Medicine, Chapman & Cutler, Walsh, Citadel). Stop if any margin changes sign.
3. Then replace the rate figures in CLAUDE.md, the logic pack and the margin spec, add the
   DECISIONS.md line, and commit "Prompt 4: model schema; rates derived from pools and database
   volumes".

## Next

Prompt 5 — fixtures, tokens, components, styleguide. Its step 1 (`npm run snapshot`) needs the
database, so it runs on the PC; the fixtures it writes are gitignored and will need to reach
the cloud another way (to be decided).
