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
