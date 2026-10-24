# R4 Pulse — build it, then iterate it cheaply

Everything you need to go from nothing installed to a live, password-protected app on Render
that you can redesign twenty times a day for pennies.

Three files sit alongside this one. Put all four in the repo before you start:

- `CLAUDE.md` — standing instructions Claude Code reads first, every session
- `DECISIONS.md` — what is already settled, so nothing gets relitigated
- `PROMPTS.md` — the exact prompts to paste, in order

You will also want `R4_PULSE_BUILD_SPEC.md`, `docs/R4_GL_Allocation_Analysis.md` and
`r4_pulse_prototype.html` from earlier in the engagement.

---

# STAGE 0 — Install · 30 minutes, one-off

On your laptop, not the Remote Desktop.

**1. Node.js** — <https://nodejs.org>, take the LTS installer. Then check:

```bash
node -v     # want v20 or higher
npm -v
```

**2. Git** — <https://git-scm.com/downloads>. Then:

```bash
git config --global user.name "Theran Saran"
git config --global user.email "your@email.com"
```

**3. VS Code** — <https://code.visualstudio.com>. Optional but makes life easier.

**4. Claude Code**

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

**5. Accounts**
- GitHub — free, at <https://github.com>
- Render — free to sign up, at <https://render.com>. You'll add a $7/month service later

**6. Decide how you pay for Claude Code**

| | Cost | Best for |
|---|---|---|
| **Claude Max** | $100/month flat | Heavy daily iteration. No metering anxiety |
| **API credits** | pay per token | Occasional bursts |

For a month of active building, **Max is the right call** — you'll use it for PNL and Urban
Baristas work too. Start there; drop to API later if usage falls off.

---

# STAGE 1 — Scaffold · 45 minutes

```bash
mkdir r4-pulse && cd r4-pulse
git init
```

Copy in the four `.md` files and the prototype HTML. Then create `.env` — **never commit this**:

```
DATABASE_URL=postgres://doadmin:YOUR_PASSWORD@r4-analytics-do-user-42882271-0.m.db.ondigitalocean.com:25060/defaultdb?sslmode=require
SESSION_SECRET=paste-32-random-characters-here
AUTH_USERS=theran:CHANGEME:admin
PORT=3000
```

```bash
echo -e ".env\nnode_modules/\nfixtures/*.json" > .gitignore
claude
```

Then paste **Prompt 1** from `PROMPTS.md`.

**What you get:** an Express server, a Postgres pool, login, the snapshot script, empty view
files. No design yet.

**Check it worked:** `npm run dev`, open `localhost:3000`, see a login page.

> **Cost: ~$0.40.** One large prompt on Sonnet.

---

# STAGE 2 — The cost model · 30 minutes

This is the only part that runs on Opus, because every number in the app depends on it.

Paste **Prompt 2**. It builds `model/rates.js` and a test file from the spec and the GL analysis,
including the corrections we found — air travel out of the route day, temp labour in, Citadel's
$167k direct.

**Check it worked:**

```bash
npm test
```

You want to see storage at zero travel, delivery travel varying by postcode, bins carrying no box
handling, and Ingalls landing at roughly −94% margin.

> **Cost: ~$0.60.** Worth every cent — this is the file you never want to debug later.

---

# STAGE 3 — Data layer and snapshot · 30 minutes

Paste **Prompt 3**, then:

```bash
npm run snapshot
```

That hits Postgres once and writes `fixtures/*.json`. From here on, **design work never touches
the database.**

**Check it worked:** `ls fixtures/` shows JSON files with real numbers in them.

> **Cost: ~$0.50.**

---

# STAGE 4 — Design system and style guide · 1 hour

Paste **Prompt 4**. This builds `tokens.css` and `styleguide.html`.

**This is the stage that makes everything afterwards cheap.** The style guide shows every
component in every state on one page — loading, empty, negative numbers, very long customer
names, mobile width. You iterate here, not in the app.

**Check it worked:** open `localhost:3000/styleguide.html` and see components rendering with
real numbers.

**Then play.** Open `public/tokens.css`, change eight variables, reload:

```css
--kraft:#B8895A;    /* try #A6714A, or #7D6B55 for something quieter */
--green:#2D6A4F;
--ink:#111318;      /* try #1A1F2B for a cooler, more financial feel */
--radius:2px;       /* 0 = severe, 6px = friendlier */
--font-display:'Archivo';
```

That is a 30-second iteration with no AI cost at all.

> **Cost: ~$0.70.**

---

# STAGE 5 — The four views · 2 to 3 hours

Paste **Prompts 5a to 5d**, one at a time, checking each in the browser before moving on.

- **5a Brief** — the front door
- **5b Customers** — the table and the six-tab drawer
- **5c Pricing** — the ladder and position track
- **5d Month** — September-led, with the waterfalls

**Check each one** before the next prompt. If something's wrong, fix it then — errors compound.

> **Cost: ~$0.30 each, ~$1.20 total.**

---

# STAGE 6 — Deploy · 45 minutes

```bash
git add -A
git commit -m "R4 Pulse initial build"
gh repo create r4-pulse --private --source=. --push
```

If `gh` isn't installed, create the repo on github.com and follow its instructions.

**On Render:**
1. New → Web Service → connect the GitHub repo
2. Build `npm install`, start `npm start`
3. Instance type **Starter, $7/month** — not Free, which sleeps and takes 40 seconds to wake
4. Environment → paste your `.env` values
5. Settings → enable **static outbound IPs**, copy the addresses

**On DigitalOcean:** Databases → your cluster → Settings → Trusted Sources → add those IPs.

**Check it worked:** open the Render URL, log in, see real data.

> **Cost: $7/month. Deploys after this are automatic on `git push`.**

---

# STAGE 7 — Users · 30 minutes

Paste **Prompt 7**. Generate hashes:

```bash
node -e "console.log(require('bcryptjs').hashSync('their-password',10))"
```

Then set in Render's environment:

```
AUTH_USERS=trisha:$2a$10$xxx:admin,mike:$2a$10$yyy:ops,anne:$2a$10$zzz:finance
```

Roles gate views: Mike sees Today and Geography, Anne sees Margin and Pricing, Trisha sees
everything.

> **Cost: ~$0.30.**

---

# Total to a live app

| | Time | Cost |
|---|---|---|
| Stages 0–7 | **6 to 8 hours** spread over two or three evenings | **~$4 of AI** plus $7/month hosting |

---

# THEN: how to iterate cheaply, forever

## The three-tier rule

**Tier 1 — free, instant.** Colours, spacing, type, corner radius, shadows, motion speed.
Edit `tokens.css`, reload. No AI. Do this first, always — most "it doesn't feel right" is tokens.

**Tier 2 — ~$0.03, one minute.** One component, one file.

> "In `public/components/waterfall.js`, make the connector lines solid instead of dashed and add
> the percentage of revenue under each cost bar. Don't touch anything else."

**Tier 3 — ~$0.10, five minutes.** A whole view, as a variant so the original survives.

> "Create `public/views/brief.b.js` — same data contract as `brief.js`, but lead with the
> customer movers instead of the trend chart. Don't modify `brief.js`."

Then `localhost:3000/?v=b` to compare live. Keep the winner, delete the loser.

## Rules that keep it cheap

1. **Name the file in every prompt.** "Improve the design" reads everything. "In `views/brief.js`, …" reads one file.
2. **Sonnet for design, Opus only for `model/`.** Set it with `/model sonnet` in Claude Code.
3. **Commit before every change.** `git commit -am "wip"` — then a bad direction costs `git checkout .`, not a re-explanation.
4. **Never iterate on live data.** Fixtures are instant and identical every time.
5. **Variants, never iterations, for anything contested.** Three versions at once beats ten attempts at one.
6. **Use `/clear` between unrelated tasks.** A long context costs more per prompt.

## Realistic monthly cost, iterating actively

| | |
|---|---|
| Render | $7 |
| Claude Max (or ~$10 of API if lighter) | $100 |
| DigitalOcean Postgres | already paying |

**200 component iterations in a month is about $8 of API.** The structure is what makes that
true, not the model.

---

# What to do first, tonight

1. Stage 0 — install everything, 30 minutes
2. Stage 1 — scaffold, 45 minutes
3. Stop. Look at the login page. That's a good first evening.

Stages 2 and 3 the next evening, and you'll have real data flowing. Stages 4 and 5 over a
weekend, and you'll have something to show Trisha.

**Do not start design work before Stage 4.** The style guide is what makes everything after it
cheap, and skipping it is how you end up back with a 140KB file that costs a pound to edit.
