# Deploying R4 Pulse on Render

The app is one Node web service. It reads the DigitalOcean Postgres database through its own
login, `r4_pulse_app`, which can read and can write the calls log, and nothing else. Secrets live
in the Render dashboard only. `render.yaml` holds everything that isn't a secret.

## What has to be true first

1. **Render can reach the database.** The database admits only the addresses on its Trusted
   Sources list. The web service connects from Render's outbound addresses for its region (Ohio,
   in `render.yaml`). They are listed under the service's **Connect → Outbound** tab once it exists.
   Those specific addresses have to be on the list, and that is Theran's call. Nothing else
   changes. Without them the service fails at boot ("cost model did not load"), and Render
   keeps the previous version running.
2. **`app.calls_log` exists:** `sql/app_schema.sql`.
3. **The nightly rebuild runs after the daily push:** `npm run kpi:rebuild` with the admin
   login, on the machine that already runs the push. It stays off Render, so the admin login
   never leaves that machine. See "Scheduled tasks on the R4 machine" below.

## Steps (Theran, on the PC, in the repo folder)

PowerShell: one command per line.

```
git pull origin main
node scripts/apply_sql.js sql/app_schema.sql
node scripts/app_role.js
node scripts/app_users.js
```

- `app_role.js` creates `r4_pulse_app` (or gives it a new password if it already exists) and
  writes its connection string to `.env.render`. It then runs every screen as that login and
  prints `ok` or `FAIL` per line. The last three lines must say "permission denied, as intended".
  It also lists any tables owned by a different login, such as the one the daily push uses. If
  that login recreates those tables, the read grant on them is lost. Re-run `app_role.js` after
  that happens, or paste the list to Claude.
- `app_users.js` writes `AUTH_USERS` into `.env.render` and the four passwords into
  `render_logins.txt`. Both files are gitignored, and neither script prints a secret.

Then, in the Render dashboard:

1. **New → Blueprint**, pick `theranjitsaran-lab/r4-pulse`. Render reads `render.yaml`.
2. It asks for the `sync: false` values. Paste `DATABASE_URL` and `AUTH_USERS` from
   `.env.render`. `SESSION_SECRET` is generated. `ANTHROPIC_API_KEY` is optional: with it, Home's opening paragraph is written by Claude from the page's own figures (every number checked against them, `server/summary.js`); without it, the template sentence is shown. Put the key in Render's environment only, never in the repo.
3. Once the service exists, copy its outbound addresses (**Connect → Outbound**) to the
   database's Trusted Sources (see "What has to be true first", item 1). Then **Manual Deploy →
   Deploy latest commit**.
4. Open `https://<service>.onrender.com/health`, which should return `{"ok":true,"fixtures":false}`.
   Sign in as `theran`.
5. Hand each person their line from `render_logins.txt`. Then delete `render_logins.txt` and
   `.env.render`.

## After that

- Every push to `main` deploys.
- A login change means re-running `app_users.js`, pasting `AUTH_USERS`, and the service restarts.
- Sessions are held in memory: a deploy or restart signs everyone out. That's acceptable for four
  users. A Postgres session store needs a write grant, so it's left out on purpose.
- Each screen caches its query for 15 minutes. The cost model (`model.*`) loads at boot, so a
  change to the rates needs a restart (**Manual Deploy**).

## Design preview

A second service, `r4-pulse-design` in `render.yaml`, on the free plan. It reads the live database
through the same `r4_pulse_app` login and redeploys on every push to `design/iterate-in-code`. It
shows "Design preview" in the header.

1. In the Render dashboard, open the Blueprint and **Sync** it. Render offers the new service.
   Paste `DATABASE_URL` (the same string as `r4-pulse`) and an `AUTH_USERS` holding Theran's
   entry only.
2. Check its **Connect → Outbound** addresses. They should match `r4-pulse`'s (same region). If
   they differ, add them to Trusted Sources or move the service to Starter.
3. The loop: ask Claude for a change on `design/iterate-in-code` → it commits and pushes → about 2
   minutes later, open `https://r4-pulse-design.onrender.com` on a desktop or phone. When it's right,
   merge the branch into `main` and the team's service follows.

It sleeps after 15 idle minutes, so the first load takes about 30 seconds.

## Scheduled tasks on the R4 machine

| Task | When | What |
|---|---|---|
| `R4_Daily_Push` | 06:00 | VCK → DigitalOcean; logs to `push_log.txt` |
| `R4_Verishred_Push` | 06:30 | Veri-Shred → DigitalOcean; logs to `vs_push_log.txt` |
| `R4_KPI_Rebuild` | 07:00 | `npm run kpi:rebuild`; logs to `logs\kpi_rebuild.txt` in this repo there |

- All three run as `tsaran`, LogonType Interactive, so they fire only while that session exists.
  **Close the Remote Desktop with the X (disconnect). Never sign out.** A reboot stops them until
  someone signs in again. The fix is R4's IT: "Please set tasks R4_Daily_Push, R4_Verishred_Push and
  R4_KPI_Rebuild to run whether the user is logged on or not."
- Install the rebuild task once, signed in as `tsaran`, in a checkout with the admin `.env`:
  `powershell -ExecutionPolicy Bypass -File scripts\install_rebuild_task.ps1` (add `-DryRun` first to see it).
- Check on the machine: `node scripts/freshness.js --logs <push folder>` lists any `DDL FAILED`.
  A blocked table keeps its old rows and only looks stale.
- Check from anywhere: `https://<service>.onrender.com/health/data` (dates only, no login) and the
  **Data freshness** GitHub Action (`.github/workflows/freshness.yml`), which fails, and emails Theran,
  when done work is more than five days old or the rebuild missed the month. Set the repository
  variable `PULSE_URL` to the service address to turn it on.

## Morning emails (R4_Morning_Brief)

Trisha, Anne and Mike each get an email on weekdays at 07:15, built from the same lists as Home
(`server/brief.mjs`, `scripts/send_brief.js`). It is sent from the R4 machine, after the push and the
KPI rebuild. On a morning with no new data, each email says only that.

1. **The mailbox (Theran, Microsoft 365):** create a mailbox such as `pulse@r4services.com` and an app
   password for it. If Microsoft 365 refuses the login ("SMTP AUTH is disabled for the tenant"), R4's
   IT has to allow SMTP AUTH for that one mailbox (Microsoft 365 admin centre → Users → the mailbox →
   Mail → Manage email apps → Authenticated SMTP).
2. **The R4 machine's `.env`**, in this checkout, beside the admin `DATABASE_URL`:
   ```
   BRIEF_TO=trisha:<her email>,anne:<her email>,mike:<his email>
   BRIEF_FROM=pulse@r4services.com
   BRIEF_SMTP_USER=pulse@r4services.com
   BRIEF_SMTP_PASS=<the app password>
   PULSE_URL=https://<service>.onrender.com
   FEEDBACK_SECRET=<a long random string, the same on Render>
   ANTHROPIC_API_KEY=<optional: Trisha's opening written by Claude, every number checked>
   ```
   The names before each colon must match the app logins in `AUTH_USERS`, so a "Knew" tapped in the
   email and one tapped in the app hold the same line back.
3. **Preview without sending:** `node scripts\send_brief.js --dry-run` writes `logs\brief\*.html`.
   Open them in a browser.
4. **Install the task**, signed in as `tsaran`:
   `powershell -ExecutionPolicy Bypass -File scripts\install_brief_task.ps1 -DryRun`, then without
   `-DryRun`. Run it once by hand with `Start-ScheduledTask R4_Morning_Brief` and read `logs\brief.txt`.
5. **Apply the schema once** on the PC (`app.feedback`): `node scripts/apply_sql.js sql/app_schema.sql`,
   then `node scripts/app_role.js` so the app login can write it.

The taps in the emails land on Render (`/f/<token>`, signed with `FEEDBACK_SECRET`, no sign-in), so
the emails need Render live; until then they still send, and the taps say the page cannot be reached.

## Go live on Render (agreed 26 October 2026)

1. Render dashboard → the Blueprint → **Sync**. Fill the `sync: false` values: `DATABASE_URL` and
   `AUTH_USERS` from `.env.render`, `FEEDBACK_SECRET` (the same as the R4 machine), and
   `ANTHROPIC_API_KEY` if wanted.
2. Copy the service's **Connect → Outbound** addresses into the database's **Trusted Sources** in
   DigitalOcean. Only those addresses; nothing else changes on the allow-list.
3. **Manual Deploy → Deploy latest commit.** Check `https://<service>.onrender.com/health/data`: dates,
   and `"stale": false` once the push and rebuild have run that morning.
4. Sign in as each of Trisha, Anne and Mike once to confirm their logins.
