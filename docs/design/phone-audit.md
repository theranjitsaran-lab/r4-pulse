# Phone audit

Phase 1, 3 November 2026, on branch `design/iterate-in-code` at `5090ab1`. Every view and pop-out at 390×844, 375×667 and 430×932, signed in as an admin, in a real browser with touch on. No page errors. Nothing changed.

- **Screenshots:** `docs/design/phone-audit/<view>-<width>.png`, 54 in all. Full pages have the top and tab bars hidden so they don't cover content; drawers are as seen.
- **Figures:** `docs/design/phone-audit/measures.json`, from `scripts/phone_audit.cjs`, which can be re-run for the after.
- **Data:** local fixtures, not the design site. The design site reads live data; the layout is the same.
- **Not audited:** the welcome tour isn't built. Money is gone, so Warehouse is audited in its place.

## Rules

| Rule | Result | Where |
|---|---|---|
| Body 16px, nothing read under 13px | **Fails everywhere.** Body is 14px, and the app's floor is 12px by design | `public/tokens.css:89-91,109`, `public/tokens.css:102`, `public/app.css:60` |
| Tile figures at least 22px | **Fails on Accounts, Operations, Warehouse, Opportunities, Settings, the drill-down: 16px.** Passes on Today (28/22), the customer page (28), Quote (22) | `public/components/accounts.css:29` and its phone override |
| Tap targets 44×44, 8px apart | **Fails everywhere.** See below | |
| No sideways page scroll | **Passes** on every view at all three sizes | |
| Wide tables pinned or stacked | **Passes as scroll-in-box with the first column pinned** on all of them, though some would work far better as cards | See tables |
| Answer fits the first screen | Passes at 390 and 430 on most. **Fails at 375×667 on every screen but Quote**, and on the customer page at 390 | The 97px top bar and 68px tab bar take 165px of 667 |
| 16px margins, 12px between cards | Margins pass. **Gaps of 8px on Today, Operations, Warehouse** | `public/components/home2.css:380` |
| Tiles 2×2, labels not cut | **Passes**, except Today's lead tile is deliberately full width | |
| Charts readable, tap for values | Labels mostly clear, **2 collisions on Quote**. **Fails on tap:** chart values are in `<title>`, which needs a hover. Labels 11-12px | `public/components/lit.js:60` |
| Drawers full width, sticky header and footer, safe area | Width passes, and nothing hides under the tab bar. **Close 32×32. Margin drawer's footer is 113px, leaving 386px of 574px on a small phone** | `public/components/accounts.css`, `.pop-f`, `public/components/cust2.css:54` |
| Maps usable with one thumb, at least 60% of width tall | **Passes on height: 85-94%.** Controls fail on size. No zoom exists on any map | `public/components/components.css:32` |
| Tab bar fits, active clear, no duplication | **Passes.** Five tabs, 52-99px wide, icons and labels, none cut off. Labels 12px. Top bar doesn't repeat them | `public/app.css:47-49` |
| Pages over 4 screens | **Operations 4.3-5.5, Day 5.4-7, Warehouse 4.2-5, Opportunities 4-5.1, Settings 7-9.1**; Accounts 4.8, Quote 4.8, Today 4.1 at 375 | |

### Small tap targets, by what they are

| Target | Size at 390 | Count on a screen | File |
|---|---|---|---|
| Table rows | 30px high | 50 | `public/components/cust2.css:163` onward |
| Margin pill | 60×19 | 50 | `public/components/accounts.css:39` |
| Account link in a table | 89×17 | 50 | same table |
| Owner, Status, Next step | 68×22, 86×22, 121×23 | 150 | `public/components/accounts.css:290` |
| Segmented controls | 46×25 | 3-13 | `public/components/components.css:32` |
| Filter selects | 162×28 | 3 | `public/components/cust2.css:149` |
| Today's lines of business | 332×25 | 8 | `public/components/home2.css:337` |
| Who moved rows | 332×43 | 15 | `public/components/accounts.css:78` |
| Lines in the book | 332×36 | 8 | `public/components/accounts.css:63` |
| Margin drawer lines | 358×25 | 6 | `public/components/accounts.css:347` |
| Ask, gear, logo | 64×25, 18×18, 94×32 | each screen | `public/app.css:62` and `public/index.html:36` |
| Close on a drawer | 32×32 | each drawer | `.ask-x`, `public/components/cust2.css` |
| Compare checkbox | 13×13 | 1 | `public/components/routes.css:110` |
| Settings inputs and Save | 88×30, 51×27 | 60 | `public/components/pricing.css:178` |

### Tables

| Table | Box against table | Today | Recommend |
|---|---|---|---|
| All accounts | 330 / 514, 7 columns | Scroll, pinned | Keep. Taller rows |
| Month grid | 330 / 514, 7 columns | Scroll, pinned | Keep: comparing months is the point |
| Cross-sell | 330 / 730, 8 columns | Scroll, pinned | Keep, with the Not bought column pinned beside the name |
| Opportunities | 330 / 800, 8 columns | Scroll, pinned | **Cards.** Owner, Status and Next step are the job, and they're off screen |
| Routes | 330 / 455, 5 columns | Scroll, pinned | Cards: route and services a day first |
| Costly to serve | 330 / 734, 9 columns | Scroll, pinned | **Cards.** Band and best move are off screen |
| Warehouse, both | 330 / 393 and 330 / 330 | Scroll, pinned | Keep |
| Quote's accounts | 330 / 330 | Fits | Keep |
| Jobs in the drawer | Fits or scrolls | Scroll, pinned | Keep |

## The ten worst

1. **Opportunities: the working controls are off screen and tiny.** The table is 800 wide in a 330 box. Owner, Status and Next step need sideways scrolling and are 22px high, and the list starts over two screens down.
2. **Text across the app.** 14px body and a 12px floor everywhere. It's one token change at phone width, but it will lengthen every page, so it comes first and the rest is judged after it.
3. **Tap targets across the app.** Rows at 30px and pills at 19px, on every list. Two shared components fix most of it.
4. **Costly to serve and Routes tables.** The band and best move are out of sight until you scroll.
5. **Operations, Day above all.** 5.4 to 7 screens. The map, table, week, booked ahead, density, costly and distance all come in one run.
6. **Cross-sell drill-down.** 5.6 to 7.2 screens as a page, with its summary and tiles ending at 1468px.
7. **Tile figures at 16px** on Accounts, Operations, Warehouse, Opportunities: the number is the point, and it's smaller here than on Today.
8. **Small phones.** At 375×667 the answer falls below the fold on all but Quote, because the bars take 165px, and the late-data line alone is 44px.
9. **Drawers.** 32px close, and the margin drawer's two-line footer takes a fifth of a small screen.
10. **Settings.** 7 to 9 screens of 60 small controls. Admins only, so last among these, but the worst page for length.

## Proposed phone layout, screen by screen

**Today.** Keep the order: headline, bar, three lines, tiles. Fold the lines of business and Last week behind "Show", moving Three things to act on above them. Map stays, with its 5-row list folded. Late-data line to one line at small sizes.

**All accounts.** Summary and 2×2 tiles lead, at 22px. Fold "The book by line" and "Who moved" behind Show, so the table starts on the second screen. Table stays pinned, with 44px rows and a bigger pill.

**Month grid.** Short already. Bigger rows and pills; filters stay behind More; 3 months is already the phone's default.

**Cross-sell.** Summary, then the table. Pin Not bought next to the name so the answer is always visible. The grid's own key folds behind a "What the colours mean".

**Cross-sell drill-down.** Leads with Room to grow and the three points. Tiles 2×2. Chart stays. "How each gap is sized" and "Compared with" fold. Actions stay at the end, full width.

**Customer page.** Margin tile and three points fit the first screen once "Who they are" moves below the tiles. Lines become stacked rows. The folds below already exist.

**Quote.** Four figures stay on top, 2×2. Steps 1 and 2 lead; map stays large. "Where the price goes" keeps its bar, rows folded. Fix the two colliding chart labels. The quote builder and "every account" stay folded.

**Operations.** Period switch scrolls in one line rather than wrapping. Summary and tiles, then the map, side list below it, folded to the top three. Routes becomes cards. Density and distance fold. Costly becomes cards, showing the top three then Show all.

**Operations, Day.** The same, with by-route rows leading after the map, and the week and booked ahead folded.

**Warehouse.** Summary, tiles, the building. Both tables fold behind their titles, with the conclusion as the fold's label.

**Opportunities.** Summary, tiles, pipeline as a one-line scrolling strip rather than 2×3. Kind bar stays, key folded. Table becomes cards: name and value first, kind and reason, then Owner, Status and Next step at full width and 44px. Tapping opens the moves, as now.

**Settings.** Group under folds by subject, with the questions at 16px and inputs full width.

**How it's calculated.** Only the text size.

**Line of business, margin and costly drawers.** Sheet opens to the top under the status bar, close at 44px, footer one line: on the margin drawer, Owner folds into the Send step. Rows at 44px.

**Ask.** Suggestions at 44px, with the input above the keyboard, which needs checking on a real iPhone: this browser can't show it.

## Shared parts this needs

1. **`dataTable` gets a `phone: 'cards'` option** using its existing `cols`, so the same data and footing, with name and value first.
2. **One "Show" fold,** a phone-only `<details>` with a clear label, open on desktop.
3. **Phone tokens:** `--fs-body` 16px and the floor 13px inside `@media (max-width: 700px)` only. Desktop doesn't change. `public/tokens.css` and `scripts/contrast.js` both stay right, since colour doesn't change.

## Limits

- **The 16px body rule costs length.** Pages will grow about 15% before folding, so some will stay over 4 screens even folded, and I'd list those rather than fold further.
- **Map zoom isn't built.** Your rule asks for it to be reachable. Pinch on an SVG needs real code, not CSS; I'd treat it as its own step. Say if it's wanted now.
- **Real devices:** this is a browser emulating phones. Safe-area insets and the keyboard can only be confirmed on an actual iPhone.
- **Sloplint:** rules 56, 67 and 73 from earlier pages will still show after this work.

## Result, 3 November 2026

Built on `design/iterate-in-code`; the desk was compared with the commit before it, screen by screen: same boxes and same words, apart from the changes asked for. `node scripts/phone_audit.cjs --tag=after` writes `after-measures.json`; `before-after.png` shows the ten worst, side by side.

Text sizes changed from the rule above, by Theran's call: not all text bigger. At phone width only: tile figures at least 22px; names and values people scan 15 to 16px; controls 14px; longer text 13px at line-height 1.5; sources and chart labels stay 12px; card gaps at least 12px.

Nothing scrolls sideways or runs past the edge at 375, 390 or 430, and the audit now fails if anything does. Controls under 44px across every view fell from over 1,000 to under 20.

Left, on purpose:
- The Compare tick is 20px; its whole label is the tap target.
- A link inside a sentence, such as the source on "Who they are", keeps its text height.
- Quote's save and copy row and the Ask send button are within 8px of 44, and the Margin drawer's Ask is 40px, to keep its footer on one line.
- Long pages: Opportunities is longer as cards (4 to about 6 screens) because every owner, status and next step stays on the card; it shows 10 and then Show all. Map zoom is a separate step.
- Table rows are 34px, not 44px, and their text a point smaller (Theran, 3 November 2026: the grids were too big). The whole row is the tap target; a margin pill and a name fill the row's height, so neighbours never overlap. On Accounts the filters sit behind More.
