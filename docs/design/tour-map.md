# Welcome and tour: mock-up against the app

Phase 1, 3 November 2026, on branch `design/iterate-in-code` at `5090ab1`. Walked in a real browser at 1440 and 390 wide, as an admin (Theran) and as a non-admin (Anne), on fixtures. Nothing built yet.

## What matters most

1. **Margins are admin only today.** `seesCosts` (`server/settings.js:98`) is admin, or everyone once Settings says costs are final. Trisha, Mike and Anne see no margin pill, no band key, no margin tiles on Quote, no costly-to-serve dollars. The mock-up's margin steps and "what each one really earns" are false for three of the four users. Steps need a per-audience version, and the test must render both.
2. **There are five tabs, not six.** Money came out on 3 November. "Six places" and the Money line are wrong. The phone brief's "six tabs" and "Money" are out of date in the same way.
3. **No user record exists.** Logins live in `AUTH_USERS` in the environment (`server/auth.js:1`), so `welcome_seen_version` has nowhere to go. It needs a small new table, `app.user_state` (login, welcome_seen_version, at). That's a second live schema change for you to run, like `next_step`.
4. **"?" doesn't exist yet.** It would be new, in `.mast-right` (`public/index.html:36`).
5. **Today only has two light colours.** Green and red (`public/components/home2.css:27-29`). Amber appears on Accounts, Operations, Opportunities and the pop-outs. The lights step must point somewhere that shows all three, or say so.

## The mock-up's steps

### Full tour

| # | Mock-up step | Tab | Real element | Exists? | Wording matches? | Change needed |
|---|---|---|---|---|---|---|
| 1 | Six places, one question each | All | `#nav`, `public/index.html:29` | Yes. Bottom bar on a phone (`public/app.css:47`) | No. Five tabs; Money is gone | Five places; Warehouse lives under Operations |
| 2 | How up to date the numbers are | Today | `#stamp`, `public/index.html:38` | Yes, 1440 and 390 | Mostly. Amber only when late (`public/app.css:61`), and the words are "Data to Fri, 30 Oct · late: …" | Keep. Say "It says late, in amber, when a feed has not arrived" |
| 3 | The answer comes first | Today | `.h2-sum`, `public/views/home2.js:60` | Yes | Yes. Green priced, striped to check, gap to $1.0M (`home2.js:176`) | Keep |
| 4 | The lights tell you where to look | Today | `#h2-bul`, `home2.js:62` | Yes | No. No amber on Today. Tap opens are true (`#h2-lines`, `#customer/…`, `#opportunities?f_kind=cross`) | Say green and red here; amber on the next step, on Accounts |
| 5 | Tap any figure for more. "Nothing in Pulse is a dead end" | Today | `.h2-kpis.bills`, `home2.js:53` | Yes | No. The first tile is a plain `div` (`home2.js:54`). The other two open Month grid and Opportunities | Drop the claim, or fold into step 3 |
| 6 | Margin at a glance | Accounts | `button.rag`, `public/components/accttable.js:41` | **Admin only.** Absent for Anne. 19px high and at y=2383 on a phone | Band names right (35%, 15%, from `marginBand`). "Every account" is false for non-admins | Admins: as written, opens the new drawer. Others: point at Who moved instead |
| 7 | Price where the customer is | Quote | `#pq-where`, `public/views/pricing.js:109` | Yes | Yes. "Tap the map or type a postcode". Until then it's "costed at the book's average stop" | Keep; "shows the margin" for admins only |
| 8 | Where the trucks went. "Last week's routes … by driver. Pick a day or a driver" | Operations | `.rt-mapcard`, `public/views/activity.js:82` | Yes, but different | No. Operations opens on 3 months of corridors, by route, with a period switch. Day and driver chips are on **Today's** map (`#hm-days`, `public/components/homemap.js:187`) | Rewrite for corridors, periods and compare; "route", not "driver" |
| 9 | Ask in plain words | Any | `#mast-ask`, `public/index.html:36` | Yes | Yes. Answers come from the same figures (`server/ask.js`) | Keep. "Who should we call this week?" needs checking once a key is set; Ask is untested live here |
| 10 | Replay from ? | Any | None | **Not built** | n/a | Build `?` (Phase 2) |

### Price a new customer

| # | Mock-up step | Real element | Exists? | Wording matches? | Change needed |
|---|---|---|---|---|---|
| 1 | Start on Quote: service, bins, how often, price slider | `#pq-what`, `pricing.js:84`; `#p-slide`, `pricing.js:102` | Yes | Yes. It's a drop-down and a slider | Point at the section, not the tab bar |
| 2 | Tell Pulse where it is | `#pq-where`, `pricing.js:109` | Yes | Yes for admins. "Costs far less" is admin-only wording | Two versions |
| 3 | Read the answer: price, revenue, margin $, margin % | `.pq-kpis`, `pricing.js:74` | Yes. Two tiles for non-admins | "Green means Healthy" is true, but the opening state reads "−3%, Thin, losing money" | Explain the bands rather than green alone; non-admins see price and revenue only |
| 4 | Try a better way | `#pq-opt`, `pricing.js:127` | Yes | Yes. "Tap one to try it" | Keep. Check its non-admin version in Phase 2 |

### Check an account

| # | Mock-up step | Real element | Exists? | Wording matches? | Change needed |
|---|---|---|---|---|---|
| 1 | Largest, rising and slipping at the top; every account below | `.mv-grid`, `public/views/custoverview.js:59`; `.c2-tablecard`, `custoverview.js:69` | Yes. Who moved sits below the summary, tiles and lines | Yes, but it's not "at the top" | "Who moved, then every account" |
| 2 | Read the margin band; tap for the breakdown | `button.rag`, `accttable.js:41` | Admin only | Names right; opens the new drawer | Admin step; others skip |
| 3 | Tap a name: three key points, who they are, what they buy, what would improve it | Row link, then `#cp-lit`, `#cp-who`, `public/views/customer.js:111-112` | Yes | Mostly. "Who they are" is only filled for 3 accounts offline; "What would improve it" is admin only | Say "three points, what it buys, its twelve months" |

## The welcome text

| Claim | True? | Change |
|---|---|---|
| "Reads every VCK invoice and every Veri-Shred service" | Yes: `invoices`, `priced_lines`, `vs_service_orders` | Keep. Say "finished service", since it counts done work only |
| "Works out what each one earns" | Modelled, and admin only until costs are final | "Works out what each one bills"; add earns for admins |
| "Refreshes every working day" | Scheduled tasks run VCK 06:00 and Veri-Shred 06:30 (`docs/DEPLOY.md:83-84`), on the PC, outside this repo | Keep, but **it is late now**: the stamp says data to 30 October on 3 November. Worth checking those tasks before telling people this |
| See the month: billed, still to bill, gap to $1.0M | Yes | Keep |
| Know each account: growing, slipping, "what each one really earns" | Yes for the first two; earnings admin only | Two versions |
| Act on it: price a quote, find the next sale, "see which jobs to check" | Quote and Opportunities yes. Jobs to check are a figure on Today (`home2.js:43`), not a list you can work | "Price a quote, find the next sale, and give it an owner" |
| Lights: green on track, amber worth a look, red act on this | Yes, `public/components/lit.js:9`: "On track", "Worth a look", "Needs attention" | Use the app's words |
| Bands: Healthy, Normal, Thin | Yes, one definition, 35% and 15%, from Settings. Also "Thin, losing money" under zero | Keep |

## Flags

**Pointing at things not built:** `?` (step 10), and `welcome_seen_version` storage. Nothing else depends on unmerged work, as everything is on this branch.

**On a tab the tour skips, that a new user needs:**
- **Opportunities**: it's the list people will work in, and the mock-up gives it no step. It needs one.
- **Cross-sell** and the **Warehouse** tab: name them in passing, no step of their own.
- **Settings** (gear): admin only in practice, so leave it out.

**Would break or read badly on a phone:**
- `button.rag` is at y=2383 on Accounts, 19px high, and inside a table that scrolls. It needs scrolling into view, and it's a small target.
- `.op-own` on Opportunities sits off to the right of a scrolling table on a phone, so point at the table, not the control.
- `#nav` is at the bottom on a phone, so the card must go above it, not over it. The mock-up's bottom sheet would cover it.
- Operations' map card is 840px high on a phone, taller than the screen, so a cut-out around it leaves no room. Point at the heading and period switch.
- `#pq-where` needs the map below it to load, and Today's map controls (`#hm-days`) are empty for the first moments.

**Also found, unrelated to the tour:** Today's map source line says "in recorded stop order" (`public/views/home2.js:89`, `public/components/homemap.js:3`). We established the driven order is not recorded. It should say "the likely order", as Operations does. One line to fix.

## Proposed steps

Two audiences. **All** is everyone; **Admin** and **Others** differ only where shown. The test renders both.

### Welcome

*How R4 is doing, and what to do next.* Pulse reads every VCK invoice and every finished Veri-Shred service, and tells you in plain words where to look. It refreshes every working day.

- **See the month:** what we've billed, what's still to bill, and the gap to $1.0M.
- **Know each account:** who's growing, who's slipping. *Admin adds:* and what each one earns, est.
- **Act on it:** price a quote, find the next sale, and give it an owner.

Choices: **Take the tour** (10 steps), **Price a new customer** (4), **Check an account** (3).

### Full tour, 10 steps

| # | Tab | Target | Title | Words |
|---|---|---|---|---|
| 1 | Today | `#nav` | Five places, one question each | Today: how is the month going? Accounts: who is growing or slipping? Quote: what should we charge? Operations: where did the trucks go? Opportunities: what do we do next? |
| 2 | Today | `#stamp` | How up to date the numbers are | Check this line first. It says late, in amber, when a feed has not arrived. |
| 3 | Today | `.h2-sum` | The answer comes first | One sentence on how the month is going. The bar shows what's priced, what's still to check and the gap to $1.0M. |
| 4 | Today | `#h2-bul` | Tap a line to see behind it | Green is on track. Red, pulsing, needs attention. |
| 5 | Accounts | `#ac-lit` | Amber means worth a look | The same lights on every screen. Who moved and every account are below. |
| 6 | Accounts | **Admin:** `button.rag`. **Others:** `.mv-grid` | **Admin:** Every margin is a button. **Others:** Who moved | **Admin:** Healthy, 35% or more. Normal, 15% or more. Thin, under 15%. Tap for where the money goes and what would improve it. **Others:** The largest, rising and slipping accounts, each against its own run. |
| 7 | Quote | `#pq-where` | Price where the customer is | Tap the map or type a postcode. **Admin adds:** A route that already stops nearby costs far less, and Pulse says so. |
| 8 | Operations | `#op-period` | Where the trucks went | Pick a period and compare it with the one before. Thicker lines are the corridors driven most. Warehouse is the tab beside it. |
| 9 | Opportunities | `#op-pipe` | What to do next | One row per account, its best move first. Give it an owner and a status, and everyone sees where it's got to. |
| 10 | Any | `#mast-ask` | Ask in plain words | "Why is City of Chicago down?" Answers come from the same figures you see. Replay this tour from ? at any time. |

### Price a new customer, 4 steps

| # | Target | Title | Words |
|---|---|---|---|
| 1 | `#pq-what` | What are we quoting? | Pick the service, how many and how often. The slider shows the price against what other accounts pay. |
| 2 | `#pq-where` | Where is it? | Tap the map or type a postcode. Until then it's costed at the book's average stop. |
| 3 | `.pq-kpis` | Read the answer | **Admin:** Price, revenue, margin a year and margin %, Healthy, Normal or Thin. **Others:** Price and revenue a year. |
| 4 | `#pq-opt` | Try a better way | Tap one to try it, and everything above updates. |

### Check an account, 3 steps

| # | Target | Title | Words |
|---|---|---|---|
| 1 | `.mv-grid` | Who moved | Largest, rising and slipping, each against its own run. Every account is in the table below. |
| 2 | **Admin:** `button.rag`. **Others:** `.c2-tablecard` | **Admin:** Read the margin. **Others:** Find an account | **Admin:** Tap it for where the margin is made and lost, and the fixes ranked by how realistic they are. **Others:** Search, filter, or tap a month for its invoices. |
| 3 | Row link, then `#cp-lit` | Open the account | Tap a name: three points, what it buys and its twelve months. |

## Decisions for you

1. New table `app.user_state` for `welcome_seen_version`, which you'd run, as with `next_step`.
2. Two audiences as above, rather than hiding the tour's margin steps from everyone.
3. Opportunities gets a step, in place of the mock-up's "Tap any figure".
