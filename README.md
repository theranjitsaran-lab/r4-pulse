# R4 Pulse

Management tool for R4 Services. Four screens — Pulse, Activity, Pricing, Calls — and a Margin
drill-down, on one cost model, reading a Postgres warehouse refreshed daily from VCK and Veri-Shred.

Read `CLAUDE.md`, then `DECISIONS.md`, then `PROMPTS.md` for the build order.

## Run it

```
npm install
copy .env.example .env        # then fill in DATABASE_URL, SESSION_SECRET, AUTH_USERS
npm run dev                   # fixtures mode — no database needed
```

Make a password hash for `AUTH_USERS`:

```
node -e "console.log(require('bcryptjs').hashSync('your password', 10))"
```

Then open http://localhost:3000 and sign in.

## Scripts

| | |
|---|---|
| `npm run dev` | fixtures mode, auto-reload |
| `npm run dev:live` | against the database |
| `npm run snapshot` | run every query, write `fixtures/*.json` |
| `npm run kpi:rebuild` | rebuild the `kpi` schema (nightly) |
| `npm test` | the cost model; uses the database when `DATABASE_URL` is set |
| `npm run test:offline` | the cost model on the seed in `rates.js`, no database |

## Working in a Claude Code cloud session

The live database only accepts connections from the allow-listed machines, not from cloud
sessions. In the cloud: write code, tests and commits, push to a branch, and run
`npm run test:offline` or a local Postgres. Anything that needs real data (applying SQL,
checking figures, schema questions) is written out as exact commands and run in Claude Code on
Theran's PC, which can connect. `docs/schema.md` is the structure of every table and view.

## Status

- [x] Prompt 1 — scaffold: server, auth, API, shell page
- [x] Prompt 2 — cost model with tests
- [x] Prompt 3 — SQL views and `kpi` schema
- [ ] Prompt 4 — `model` schema (in progress: S5 pounds decision open, see `STATUS.md`)
- [ ] Prompt 5 — components and styleguide
- [ ] Prompt 6 — Pulse
- [ ] Prompt 7 — Pricing
- [ ] Prompt 8 — Margin
- [ ] Prompt 9 — Activity
- [ ] Prompt 10 — Calls
- [ ] Prompt 11 — deploy
