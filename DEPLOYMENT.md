# Deployment

## Compose (production)

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export JWT_SECRET JWT_REFRESH_SECRET
docker compose up -d --build
```

Services: `db` (postgres 16, healthchecked volume `ccp_pgdata`), `api` (`:5000`, runs `prisma migrate deploy` on start), `worker` (stale-session job, same image), `web` (`:3000`, standalone build, proxies `/api/v1` to `api:5000`). The web needs no secrets; `ALLOWED_ORIGINS` must list the public web origin.

## CI

`.github/workflows/ci.yml`: web typecheck + lint, server tests on a postgres service (both DBs created, `npm test` resets the test one).

## Backup

Nightly cron on a host that can reach postgres:

```cron
0 2 * * * /srv/ccp/server/scripts/backup.sh >> /var/log/ccp-backup.log 2>&1
```

14-day retention; restore with `pg_restore --clean --dbname=<target> <file>`.

## Notes

- Docker is not installed on the dev machine, so the images and compose file are untested here — build them once where Docker exists before relying on them.
- The stale-session job also runs inside the API; run either the `worker` service or the in-process job, not both (overlap is idempotent but wasteful).

## Guides website (Vercel)

`docs/` is a static site: `index.html`, `user-guide.html`, `developer-setup.html` and the screenshots in `docs/guide/`. It has no build step.

- **Update it:** edit `USER_GUIDE.md` or `DEVELOPER_SETUP.md`, then run `python3 scripts/build-guides.py` (needs `pip install markdown`) and commit the regenerated `docs/*.html`.
- **Vercel from GitHub:** New Project → import the repository → **Root Directory** `docs` → Framework Preset **Other** → leave the Build Command and Output Directory empty → Deploy. Every push to `main` redeploys.
- **Vercel CLI:** `cd docs && npx vercel` (first run asks you to log in and link a project), then `npx vercel --prod`.
- The site is public by default. The developer guide names the GitHub repository and the dev-only demo passwords, so turn on Vercel's Deployment Protection if it should stay internal.

## Going live (managed hosting)

Deploy in this order: each step needs an address from the one before it.

| Order | Part | Suggested host | Why this order |
|---|---|---|---|
| 1 | PostgreSQL database | Railway, Neon or Supabase | The API needs its `DATABASE_URL` |
| 2 | API (`server/`) | Railway or Render (from `server/Dockerfile`) | The web app needs the API's address |
| 3 | First CEO account | Run once on the API host | Nobody can sign in until it exists |
| 4 | Web app (`web/`) | Vercel | Points at the API |
| 5 | Final link-up | API settings | The API must allow the web app's address |

**1. Database.** Create a PostgreSQL 16+ database and copy its connection string (`postgresql://...`).

**2. API.** New service from the repository, with the root directory set to `server` (it builds from `server/Dockerfile`; the container applies migrations every time it starts). Set these variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the string from step 1 |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | two different random values (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `COMPANY_TZ` | `Africa/Lagos` |
| `ALLOWED_ORIGINS` | the web app's address once you have it (step 5); use a placeholder until then |
| `TRUST_PROXY_HOPS` | `2` (Vercel's proxy plus the host's load balancer) |
| `RUN_STALE_WORKER` | `true` (the API runs the missing clock-out job itself; no separate worker needed) |
| `COOKIE_DOMAIN` | leave empty |

Check it at `https://<api-address>/health`.

**3. First CEO.** Open a shell on the API service and run:
```
node dist/scripts/create-admin.js --email ceo@yourcompany.ng --first Ada --last Okafor
```
It prints a temporary password once. **Never run `prisma db seed` in production**: it wipes every table, and it now refuses when `NODE_ENV=production`.

**4. Web app.** Vercel → New Project → the repository → **Root Directory `web`** (Next.js is detected). Add the environment variable `API_ORIGIN` = `https://<api-address>` (no trailing slash, no `/api/v1`), then Deploy. The browser only ever talks to the web app's own address; Vercel forwards `/api/v1/*` to the API, so sign-in cookies just work.

**5. Link-up.** Set the API's `ALLOWED_ORIGINS` to the web app's address (for example `https://ccp-time.vercel.app`, plus your own domain if you add one) and redeploy the API. Sign in as the CEO, choose a password, add departments in Settings, then add staff and projects.

**After go-live:**
- **Check the rate limit sees real visitors.** Sign in from two different networks; neither should be blocked by the other's attempts. If logins start failing with "too many requests" for everyone at once, `TRUST_PROXY_HOPS` is too low.
- **Back up the database nightly:** `server/scripts/backup.sh`, or your host's built-in backups.
- **Desktop agents** point `apiUrl` at `https://<api-address>/api/v1`.
