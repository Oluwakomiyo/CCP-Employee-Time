# CCP Time Management

Architecture firm time tracking: employees clock in on projects (office or site) with a note on the work. Hours × hourly rate gives monthly pay; average daily hours drive project estimates. CEO sees everything, project managers see their teams, employees see only themselves (never money).

**Using the app?** Read the [user guide](USER_GUIDE.md): how employees, project managers and the CEO use it day to day.

## Stack

- `server/` — Express 4 + Prisma 5 + PostgreSQL API (the contract; 89 tests)
- `web/` — Next.js 16 App Router frontend (Arc primitives, no Tailwind)
- `electron/` — thin desktop wrapper around the hosted web app (no activity tracking; install `desktop-agent/` beside it for that)
- `desktop-agent/` — idle-time agent reporting per-device heartbeats

## Run it

```bash
cp server/.env.example server/.env   # fill in the JWT secrets (command is in the file)
cd server && npm install && npx prisma migrate deploy && npx prisma db seed
npm run dev            # API on http://localhost:5000 (from the repo root)
npm run dev:web        # web on http://localhost:3000
npm test               # resets ccp_time_test, then runs every test
```

Seed logins (dev only, all `Password123!`): `ceo@example.com`, `manager@example.com` (PM), `john@`, `mary@`, `peter@example.com`.

## Checks

```bash
cd web && npx tsc --noEmit && npm run lint   # web must be clean
```

## Docs

- `ARCHITECTURE.md` — modules, auth flow, time engine, reporting
- `API.md` — endpoints and shapes
- `DATABASE.md` — databases, migrations, key constraints
- `SECURITY.md` — secrets, sessions, scoping, audit
- `DEPLOYMENT.md` — compose, CI, backups
