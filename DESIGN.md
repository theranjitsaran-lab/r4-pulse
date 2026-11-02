# Design: R4 Pulse

The locked system, written on 2 November 2026 from `public/tokens.css` and the Design section of `CLAUDE.md`. It records the look R4 Pulse has today and adds nothing new. Every Hallmark run reads this first. Where a Hallmark gate and `CLAUDE.md` disagree, `CLAUDE.md` wins and the failure is listed as an exception.

## System
- Genre: modern-minimal
- Shape: app screens; the shell is the project's own, a top bar on a desk and a tab bar on a phone
- Theme: R4 Services' own brand, not from Hallmark's catalog (r4services.com, 26 October 2026)
- Posture: restrained, one theme on white; dark mode was dropped on 30 October 2026
- Stack: vanilla JS and inline SVG; no framework, no chart library, nothing fetched from Google at run time

## Tokens
`public/tokens.css` is the source of truth, and components read its variables only. The roles:
```css
:root {
  --ground: #ffffff;  --surface: #ffffff;  --well: #f6f8f6;  --well-2: #ececf0;  --tint-brand: #e3f2e5;
  --ink: #1d1d1f;  --ink-2: #3a3a3c;  --ink-3: #58585d;  --ink-4: #6c6c71;  --ink-5: #aeaeb2;
  --rule: #ececf0;  --rule-2: #e3e3e8;  --rule-3: #d8d8de;  --rule-4: #c7c7cc;  --field-edge: #8e8e93;
  --brand: #0e5116;  --brand-2: #1a6b24;  --on-brand: #ffffff;  --r4-bright: #38b449;
  --s-storage: #2a78d6;  --s-service: #eb6834;  --s-citadel: #b4b2aa;
  --good: #1a5a8a;  --warn: #9a5c00;  --bad: #c62f2f;  --flag-dn: #a8231c;  --flag-up: #1a5a8a;
  --f-sans: system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  --f-brand: "Average Sans", var(--f-sans);
  --f-num: ui-monospace, "SF Mono", SFMono-Regular, Consolas, Menlo, monospace;
  --r-xs: 3px;  --r-sm: 6px;  --r: 10px;  --r-lg: 16px;  --r-pill: 999px;  --hair: 1px;
  --dt-row: 30px;  --row-h: 44px;  --u: 4px;
}
```
Type sizes run from `--fs-tiny` (12px, the floor: nothing on screen is smaller) through `--fs-sm` (13px, table cells and buttons) to `--fs-mega` (40px, Home's one hero figure). Spacing is a 4px unit, `--sp-1` to `--sp-12`.

## Colour rules
- Home's page is `--canvas` #ecf0ec with white cards: 1px `--card-ring` #dde3dd and `--shadow-card`. The top bar stays white. The lead tile is white with a `--lead-ring` #b9d3bb outline.
- `--brand` is for links, buttons and the top bar. `--r4-bright` is for fills and lines only, never text (2.7:1 on white).
- The R4 logo's bars are black, so it always sits on white.
- Green is the brand and never on a number. Home's points each carry a small light: green and steady, red and pulsing when the point needs attention. Status marks exceptions only and always comes with a word: red below cost and down, amber below median, blue for a delta that is up. Sound is ink.
- A delta wears colour only at a fifth or more (±20%). There is no arrow under 1%, and past 300% it reads "new" or "stopped".
- A month-table cell is coloured only when more than 25% and $5K from its row's own 12-month average: red below, blue above.
- Series colour follows the entity: storage blue, service orange, Citadel a neutral. Text never wears a series colour.

## States
Every control shows a 2px `--brand` focus ring, instantly. A field's edge is `--field-edge`, 3:1 on white. Labels are sentence case, never capitals, and a line of prose stops at `--measure`.

## Data states
`docs/states.html` lists every data block; it marks what is built and what is only specified.
- Loading: grey shapes where the page will be, once per screen, no spinner.
- Empty: a dashed border and one line saying what belongs here, never a zero or an invented figure. A filtered table with no rows says "Nothing matches these filters."
- Error: what broke and what to do, never the raw error. Blocks sharing a data call fail together.
- Stale: one amber bar under the masthead, for the whole app, with figures kept as of that date. No block has its own.

## Type
- Average Sans (`--f-brand`, one weight, at 400 with `font-synthesis: none`) is for the "Pulse" wordmark and the intro only.
- Everything else is the system sans. Table figures use the system monospace, `--f-num`.
- Figures use tabular numerals.

## Tables and charts
- Every list is `components/datatable.js`: 13px figures in `--f-num`, 30px rows, months with YTD and 12 months, 50 rows then Show all.
- Charts use one axis, 2px lines over a 12% area wash, bars no wider than about 24px with 4px rounded ends, hairline grids, and a legend for two or more series. Each is titled by its conclusion and carries a source line.
- Sparklines are ink, with only the latest point coloured.
- Never on screen: a dual axis, a pie chart, a gauge or dial, count-ups, invented figures.

## Copy
Plain English, British spelling in prose, US dollar figures. One idea per row. Every number carries its comparison. Estimated figures carry "est." with the assumption named once nearby, and charts hatch them. A figure that can't be calculated yet is a dashed empty state with a one-line reason.

## Motion
Other screens: entrances only, quick (`--t-slow` 260ms, `--t-draw` 480ms, `--rise` 8px).

Home, by Theran's decision on 2 November 2026:
- **Entrance, once a session** (sessionStorage), later visits show the end state: the hero fades up, the $1.0M bar fills, figures count up in step, summary lines and tiles stagger. On scroll, once: the 13 weeks and the line bars grow.
- **State lights:** green breathes; red pings, only on a line over its threshold.
- **Live route map:** district shading appears lightest to darkest, routes draw out from the yard, dashes march, a marker loops out and back and each stop pulses as it's reached. It pauses off screen or when the tab is hidden.
- **Rules:** animate only transform, opacity and stroke-dashoffset; never `transition: all`; the real figures are in the HTML first; reduced motion shows end states and no loops.

## Map
Home's map is always open and defaults to last week, Monday to Friday. Postcode districts are shaded darker the busier, from the Census's postcode areas (`public/data/zones.json`), with a hover or tap showing what's going on there. Routes are one per driver, from the yard and back in recorded stop order, joined along the main roads, and say they are not GPS.

## Exports
`public/tokens.css` in this project.
