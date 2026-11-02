# Hallmark audit, 2 November 2026

Report only: nothing in `public/` changed. Checked with Hallmark's `sloplint` (`--scope app`, modern-minimal), in app scope because these are screens people work in.

**Coverage.** 21 screens (the six tabs, their sub-views, customer page, Settings, How, the old routes and login), each as owner and admin at 390 and 1440: 84 saved pages. The browser checks ran on all 84, in Edge. Hallmark's checker can't sign in, so `scripts/hallmark_pages.js` saves each drawn page for it. A second run of the checker read `public/` directly, which is where most `file:line` references come from.

**Totals.** 2,509 FAIL, 519 REFLEX and 964 WARN lines. There are far fewer distinct problems: most are one CSS rule reported on 80 pages, because every page carries all the CSS. Findings at the wrong width were dropped (a page drawn at 390 judged at 1280, and the reverse), 146 lines in all.

**Baseline.** Two capture runs matched: 84 screens, 19,898 lines of text, 0 differences. `npm run footing` has no failures, with check 4 shown ($5,844) and labelled.

## The read
- **What it's for:** Trisha, Mike and Anne reading and acting on the route to $1.0M.
- **What works and stays:** the shared table on Opportunities and Accounts, the conclusion-led titles, and the restraint in colour. Figures are clear and tie out.
- **What reads as generated:** the capital green labels on Today (ACTIVITY, CUSTOMER, ANNE), the coloured left edge on the headline card, and `·` strings in sublines.
- **What is broken:** the Warehouse tab overflows on a phone, and the masthead doesn't stay on screen.

## 1. Real problems: Floor, must fix

Items marked ✓ were confirmed on the running app.

| Gate | What | Where |
|---|---|---|
| 34 ✓ | Warehouse on a phone: two cards run 74px past the screen at 390, cutting off titles and tables, and the page hides it | `public/views/storage.js:81`, and the clip at `public/app.css:50` |
| 34 ✓ | `overflow-x: hidden` on html and body. With it in place, the masthead scrolled off screen in the test despite being `position: sticky` | `public/app.css:50`, `public/components/home.css:4` |
| 40 | "est." at 2.21:1 on Slipping, Price gaps and Rate rounds. CLAUDE.md requires that word, so it must be readable | `public/components/customers.css:25` |
| 40 | Field borders at 1.68:1 against 3:1, on search boxes, filters and Settings inputs | `--rule-4` at `public/tokens.css:31`, `public/components/cust2.css:149` |
| 40 | Greyed Margin button at 4.43:1 against 4.5:1 on Money | `public/components/cust2.css:204` |
| 26a ✓ | No designed focus ring anywhere. Keyboard focus gets the browser's default 1px outline, so it is visible but not designed. The pages' checks only flagged login; the check of `public/` flags the whole app | `public/app.css:1`, `public/index.html:1` |
| 39a | Disabled day buttons shown by opacity alone | `public/components/routes.css:8` |
| 49a | "Sign out" wraps to two lines at 320px | `public/index.html:35` |
| 62 | Page sections hidden until a script reveals them; the intro word too | `public/components/home.css:32`, `:17` |
| 10a | The intro's scan line animates `left` | `public/components/home.css:14`, `:25` |
| 67 | Capital labels: ACTIVITY and the other Today headings, ANNE, the date eyebrow | `public/components/home2.css:192`, `:264`, `:270` |
| 48 | Literal `#fff` outside the tokens | `public/components/pricing.css:118`, `:178` |
| 34 | Widths built on `100vw` | `public/components/explain.css:4`, `public/components/home2.css:133` |
| 27 | Motion with no reduced-motion block in this file. `tokens.css` zeroes the timings, so this is low risk | `public/components/components.css:1` |
| 20 | No Hallmark stamp on the CSS. Bookkeeping, added in Step 4 | `public/app.css:1`, `public/components/components.css:1` |

## 2. Visible text: needs Theran's ruling

1,232 of the 2,509 FAIL lines. Clearing them changes characters on screen, which conflicts with "identical on screen", and they aren't CLAUDE.md clashes, so the agreed exception rule doesn't cover them.

| Gate | Lines | What | Where |
|---|---|---|---|
| 63 | 912 | `›` glued to link text | Mostly `public/views/custoverview.js`, `customer.js`, `pulse.js`, `opps.js`, `numbers.js:89`, `public/components/datatable.js:162` |
| 63 | 214 | `·` joining facts | Mostly `public/views/customer.js`, `pricing.js:88`, `customers.js:69`, `pulse.js:107`, `numbers.js:33` |
| 19 | 52 | `—` in an empty cell | `public/components/datatable.js:27`, `public/views/opps.js:51` and others |
| 67 | 48 | "Typed in capitals": customer names as VCK holds them (BSPS LLC., THE ART INSTITUTE OF CHICAGO), route names (MARK MRS), ITAD, box-condition codes | Data, not code |
| 63 | 6 | "WORD - fragment": a customer's real name, "NRC - American Renal Associates" | Data, not code |

**Decided (Theran, 2 November 2026): these are listed as exceptions, and the characters stay.** "0 FAIL" means 0 apart from this section and any CLAUDE.md clash, each named in the final report.

Customer and route names stay exactly as VCK and Veri-Shred hold them. The uppercase labels in section 1 also change what the text comparison reads, ACTIVITY becoming Activity, so Step 4 lists those as expected differences.

## 3. Likely false alarms: recorded, not waived

| Gate | Why | Where |
|---|---|---|
| 56 | "Two sticky top:0 elements": the table heads stick inside their own scrolling box (`.dt-scroll`), not against the masthead | `public/components/cust2.css:29`, `:166`, `public/app.css:9` |
| 73 | "Text painted under another element", 17 lines: seems to come from scrolling boxes in saved pages and folded panels. The Customer page's postcode list scrolls inside its box. Not all were opened individually, so recheck after Step 4 | Customer, Warehouse, Operations, Month grid, Cross-sell, Quote |
| 72 | Text "crowds" a card by −92px: the same scrolling list | Customer page |
| 67 | "ITAD $47K +$31K" counted as typed capitals | `public/views/custoverview.js` |

## 4. Reflex: fix or waive with a reason

| Gate | What | Where |
|---|---|---|
| 39b | Controls below 32px: segments and Download CSV at 25 to 27px, chips at 17 to 21px. The dense table round chose these sizes, so some may be waived | `public/components/cust2.css`, `components.css:29`, `pricing.css:178` |
| 26b | No `:active` styles anywhere; no `:disabled` on login | `public/app.css:1`, `public/index.html:1` |
| 24b | Spacing off the 4px scale | `public/tokens.css:192`, `:196`, `:202`, `public/views/storage.js:13`, `:20`, `:21`, `:32` |
| 25 | Ledes up to 109 characters a line | `public/components/customers.css:37`, `:49`, `:55`, `:102`, `customer.css:6` |
| 75 | `<small>` at 10.8px on Customer and Settings, below the app's own 12px floor | `public/views/settings.js:33`, `:34`, `public/views/customer.js:130` |
| 49b | Links wrapping at 320px | Conversations, Customer, old routes |

## 5. Finish: craft detail, doesn't block

WARN lines, by gate: F7 repeated container styles (400) · F3 no `text-wrap: balance` (84) · F23 no meta description (84) · F6 inputs without tabular figures (80) · 41 a dark bar with no text colour (80) · F1 straight quotes (76) · F19 (26) · F21 heading levels skip (18) · F25 (8) · F26 (8) · 3 equal columns (10) · F2 three-dot ellipsis (6) · 69 repeated facts on Quote (4).

80 more WARN lines say the R4 font failed to load. This comes from the saved pages, not the app: the font is embedded in them, but a leftover preload link to it fails from a local file.

`public/styleguide.html` also has `·` strings and no focus styles. It isn't one of the app's screens, so it stays out of scope unless asked.

## Lightest depth that settles this
Polish settles sections 1 and 4. The left edge on the headline card and the 3-column blocks are composition, so only a restyle or full redesign would change them; polish reports them and leaves them.

## Limits of this audit
- The checker saw saved pages without scripts, so it didn't test states people reach by clicking. The footing checks, the sweep and interaction checks cover those in the real app.
- It ran in Edge, because Chrome isn't installed and the checker couldn't start Playwright's Chromium.
- Judged gates: only Today, Accounts, Opportunities, Customer and Warehouse were read by eye, at desk or phone size. The other screens rest on the checker alone.
