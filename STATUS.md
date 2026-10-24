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

**S5 decided 24 October 2026** (branch `prompt4-shred`): plant pounds all from VCK, S3 + S5 +
unweighed shred boxes at 28.4 lb + unweighed bins by size = 3,330,582 lb; shred plant $0.1406/lb.
See DECISIONS.md "Shred plant pounds". 15/15 tests pass offline and against a local Postgres.

Next:

1. **On the PC:** `node scripts/prompt4_before_after.js` (read-only) prints each rate and the
   eight accounts' margins before and after. Exits 2 and says STOP if any margin changes sign.
2. If none does, apply `sql/model_schema.sql` on the PC and rerun `npm test` there. Open: Mike on
   shred-truck paper (DECISIONS.md, open questions).
3. Then replace the rate figures in CLAUDE.md, the logic pack and the margin spec, and commit "Prompt 4: model schema; rates derived from pools and database
   volumes".

## Next

Prompt 5 — fixtures, tokens, components, styleguide. Its step 1 (`npm run snapshot`) needs the
database, so it runs on the PC; the fixtures it writes are gitignored and will need to reach
the cloud another way (to be decided).
