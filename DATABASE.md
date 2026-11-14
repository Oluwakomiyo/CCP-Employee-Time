# Database

Postgres 16, Prisma 5. Two databases on the same server:
- `ccp_time` — dev (and production, via `DATABASE_URL`)
- `ccp_time_test` — wiped and re-migrated by `npm test` (`tests/global-setup.ts`)

## Migrations

```bash
cd server
npx prisma migrate dev --name <change>   # dev loop
npx prisma migrate deploy                # start-up (also in the Docker entrypoint)
npx prisma db seed                        # demo data (spec §66 accounts, 3 projects, rate history)
```

If Prisma refuses a data-loss migration non-interactively, hand-write the SQL in a new migration folder and verify with `prisma migrate diff`.

## Constraints that matter

- One ACTIVE segment per workday, one open break per segment, one open activity per segment (partial unique indexes) — the lock + indexes make double-submits safe.
- Compensation: one open (`effectiveTo IS NULL`) row per employee, CHECK on period order.
- One active project membership per employee (`removedAt` partial unique); employees are never hard-deleted (`onDelete: Restrict`).
- `AuditLog` is append-only (database trigger; TRUNCATE in tests bypasses it, which is why the "immutable rows" log line appears).
- `WorkDay.date` is a calendar date: the Lagos date at clock-in, stored as UTC midnight.

## Backup

Nightly `pg_dump` via `server/scripts/backup.sh` (custom format, 14-day retention). Restore with `pg_restore --clean --dbname=<target> <file>`.
