# PROMPTS.md

Paste these into Claude Code one at a time, in order. Check the result before moving on. Do not
batch them. Every prompt starts the same way: *Read CLAUDE.md and DECISIONS.md first.*

Use a cheaper model for scaffolding and SQL; the strongest one for the cost model (Prompt 2) and
the first screen (Prompt 6), because those set the pattern everything else copies.

---

## Prompt 1 — Scaffold · DONE 7 Oct 2026

```
Read CLAUDE.md and DECISIONS.md first.

Scaffold this repo. No views and no design yet — the skeleton only.

- package.json: express, pg, bcryptjs, express-session, dotenv. Scripts: dev, dev:live, start,
  snapshot, test.
- server/db.js — Postgres pool from DATABASE_URL, sslmode require, plus cached(key, fn) with a
  15-minute in-memory cache.
- server/auth.js — AUTH_USERS (name:bcryptHash:role, comma separated), a login page, a session
  cookie, middleware protecting everything except /login and /health.
- server/queries.js — empty named exports, one per screen: pulse, activity, pricing, calls, margin.
- server/snapshot.js — runs every query and writes fixtures/<name>.json.
- server/api.js — one JSON endpoint per screen; USE_FIXTURES=1 reads fixtures/ instead.
- server/index.js — wires it together, serves /public statically.
- public/index.html — masthead (R4 Pulse · the four Rs · data-through date), nav for the four
  screens, empty main. Load public/tokens.css and the one Google Fonts link named in CLAUDE.md.
- .env.example, README.md.

Vanilla. No framework, no bundler, no TypeScript. Tell me exactly what to run to check it.
```

**Check:** `npm run dev` → `localhost:3000` shows a login page; after login, the masthead.

---

## Prompt 2 — The cost model · DONE 7 Oct 2026 · `npm test` passes 10/10

```
Read CLAUDE.md and DECISIONS.md first, then docs/R4_PULSE_LOGIC_PACK.md section 4.

Write model/rates.js and model/rates.test.js.

RATES: one object, every rate with value, unit, derivation and confidence (measured · observed ·
partial · estimate · assumed), using the GL-corrected values in CLAUDE.md. SPLIT is a mutable
setting with a default of 0.40.

costToServe(family, units, opts) returns { lines:[[name, amount, derivation]], total, visits }
for the six families, with the rules in the CLAUDE.md table. Visits come from opts.visits when
given, else units ÷ 6.5 (bins, movement) or ÷ 4,000 (itad). Storage, handling and labour carry no
route time.

Tests must assert: Ingalls, bin, 6886 units, 62 visits, 11.4 miles → total 63,997 ± 5 and per-unit
9.29 ± 0.01. Storage 227,915 boxes → 339,138 ± 5. Delivery 840 units, visits modelled → per-unit
25.62 ± 0.05. A handling line never includes travel. Changing SPLIT changes bin cost and not
storage cost.

Nothing else in the repo may contain a cost number.
```

**Check:** `npm test` passes. Open the file and read the derivations — they are shown to users.

---

## Prompt 3 — SQL views and the kpi schema

```
Read CLAUDE.md data rules first. Then docs/R4_PULSE_DATA_ADDENDUM.md.

Connect with DATABASE_URL and inspect the tables: invoices, invoices_current, priced_lines,
priced_lines_current, storage_rates, storage_rate_hist, storage_retention, storage_summary, and
the Veri-Shred service-order tables. Print each table's columns before writing anything.

Write sql/views/*.sql, one view each:
- v_monthly_storage_service — month, storage, service, citadel, core (= storage + service −
  citadel), 36 months, on COALESCE(invdate, billdate). The first 24 months must reproduce
  the series in the addendum exactly; if they do not, stop and tell me which month differs.
- v_customer_monthly — month, customer, revenue, trailing-six mean, deviation %, flag_down_2m.
- v_rate_by_customer_service — modal invoiced rate per customer per service per month, and
  the month it last changed.
- v_route_day — date, route, driver, services, customers, distinct postcodes, from Veri-Shred;
  all columns cast from text.
- v_kpi_industry — the Iron Mountain set from DECISIONS.md, one row per month, with NULL where
  the data does not yet exist (retention rate, sq ft, utilisation) — never a placeholder.

Then sql/kpi_rebuild.sql creating kpi.monthly and kpi.customer_monthly from those views, and a
npm script `kpi:rebuild` that runs it.

Report the Citadel-vs-total-service discrepancy for September 2026 with the actual figures from
both sources. Do not resolve it; describe it.
```

**Check:** `v_monthly_storage_service` for Jul 2025 shows storage 383,486. The Citadel note
comes back with real numbers.

---

## Prompt 4 — The model schema

```
Read DECISIONS.md "Architecture" and docs/R4_GL_Allocation_Analysis.md.

Write sql/model_schema.sql: schema model with tables gl_pool (pool, gl_accounts[], amount,
period_from, period_to), pool_split (pool, family, share), driver_volume (driver, value, period,
source), rate_override (rate, value, reason, set_by, set_at), change_log (table, row_id, old,
new, who, when). Seed gl_pool and driver_volume with the twelve-month figures in CLAUDE.md.

Then make model/rates.js read RATES from model.* at startup when DATABASE_URL is set, falling
back to the hard-coded values otherwise, and keep every test passing.
```

**Check:** `npm test` still passes with and without DATABASE_URL.

---

## Prompt 5 — Fixtures, tokens, components, styleguide

```
Read CLAUDE.md "Design" and public/tokens.css. Look at docs/design/*.png.

1. Fill server/queries.js with the real queries behind each screen (read from the views) and run
   npm run snapshot. Commit fixtures/.
2. Write public/components/: strip.js (the pricing distribution strip — ported from the logic
   in docs/r4_pricing.html, with the four fixes listed in CLAUDE.md), table.js (Ledger register
   table: 28px rows, hairline rules, tabular figures, expand-in-place rows), chart.js (one-axis
   line and bar charts at a 900-wide viewBox, conclusion title, source line, crosshair
   tooltip), meter.js (the straight core bar with a dashed range), drill.js (the seven-level
   drill container: breadcrumb, expand in place, back to where you were).
3. Write public/styleguide.html showing every component in every state: measured, modelled ◇,
   pending (dashed), below-cost red, below-median amber, ink. Section labels using .sec.

Components read tokens.css variables only. No colour literals in component files.
```

**Check:** open `/styleguide.html`. Every state visible. Nothing green except the masthead.

---

## Prompt 6 — Pulse (Trisha)

```
Read CLAUDE.md, then docs/design/pulse-desktop.png and pulse-phone.png, then
docs/R4_PULSE_LOGIC_PACK.md sections 1–3 and docs/R4_PULSE_DATA_ADDENDUM.md.

Write public/views/pulse.js in the Briefing register, reading fixtures/pulse.json.

Top to bottom: date · Newsreader headline carrying the gap, three lines on a phone · the core
bar with October as a dashed range · "Needs a decision", four rows from kpi.customer_monthly and
the rules in the logic pack, each with an Open link into the drill · storage and service side by
side, each with growth, gross margin and lead indicator and Iron Mountain's figure, with
retention rate and service gross margin as pending states · the 24-month chart titled by its
conclusion, Citadel as a lighter band within service, November 2025 below zero, July 2025 step
annotated · finding of the week.

Phone first: build at 390 and check above the fold before widening. Desktop is the same content
with room, not more content.
```

**Check:** on a phone, headline + core bar + one chart above the fold. Nothing is invented.

---

## Prompt 7 — Pricing (Anne)

```
Read docs/design/pricing.png and docs/r4_pricing.html (keep its logic; replace its surface).

Write public/views/pricing.js in the Ledger register using strip.js, table.js and
model/rates.js. Input rail left; verdict sentence in Newsreader with red / amber / ink states;
the strip; cost to serve with every derivation; what the decision is worth at your price, the
comparison and break-even. The SPLIT slider recomputes everything live.

Opening state: Ingalls Memorial, 95-gallon bins, $3.26. It must read −$41,549 and $9.29.
```

---

## Prompt 8 — Margin (drill-down)

```
Read docs/R4_PULSE_MARGIN_SPEC.md and docs/design/margin.png.

Write public/views/margin.js: every customer ranked worst-first with revenue, cost to serve,
gross margin, %, family-mix bar, one line on what is going on, the fix. Opened from Pulse and
Pricing, not from the nav. Click a customer → its lines → a line's cost build → the visits →
the boxes (units = barcode on retrieval, return and destruction lines). Same model/rates.js as
Pricing; the two must agree to the cent for Ingalls.
```

---

## Prompt 9 — Activity (Mike)

```
Read docs/R4_PULSE_DATA_ADDENDUM.md section 2.

Write public/views/activity.js in the Ledger register from v_route_day. Yesterday: one row per
route-day — driver, services, customers, postcodes, one sentence on what happened. The week: a
grid of route-days, Mon–Fri across, routes down, each cell sized by services; click a cell for
its stops in order with the invoiced value at each. Booked ahead: the same grid for the rest of
the week. Thursday 17 September 2026 must reproduce the addendum exactly. Route-day margin is a
pending state until pay rates are loaded.
```

---

## Prompt 10 — Calls (Anne)

```
Read docs/R4_PULSE_LOGIC_PACK.md section 7.

Write public/views/calls.js: ten accounts a week from the seven signals, ranked. Each card:
signal, two lines of evidence with numbers, a suggested opening line, three actions — call,
email, not this week. Logging the outcome is the only input; store it in a calls_log table.
```

---

## Prompt 11 — Deploy

```
Render web service from this repo. Static outbound IPs allowlisted at DigitalOcean. Env:
DATABASE_URL, SESSION_SECRET, AUTH_USERS. Health check on /health. Nightly cron: npm run
kpi:rebuild then npm run snapshot. Tell me the three things to set in the Render dashboard.
```

---

## After each prompt

Add one line to `DECISIONS.md` for anything decided on the way. Rotate any secret that has
ever appeared in a chat.
