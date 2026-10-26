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
   never leaves that machine.

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
