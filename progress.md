# CCP Time Management: Progress

Single source of truth for where the rebuild stands. **Update this file in the same commit as the work it describes.**

- Spec: `EMPLOYEE & PROJECT TIME MANAGEMENT SYSTEM.pdf` (repo root, untracked). Section numbers below (§) refer to it.
- Full plan: `~/.claude/plans/pasted-content-id-0c4c-i-m-attaching-robust-toucan.md` (summarised here).

## Decisions (agreed with the owner)
| Topic | Decision |
|---|---|
| Architecture | Keep and fix the **Express + Prisma + Postgres API** in `server/`. Build a **new Next.js (App Router) frontend** in `web/` that calls it. The old Vite app in `client/` is deleted after Phase 7. |
| Order | Backend correctness and security first, then the UI is built once. |
| Timezone | `COMPANY_TZ=Africa/Lagos`. Timestamps are stored in UTC; a workday is the Lagos date at clock-in (`server/src/utils/time.ts`). |
| UI kit | **Arc** (uiarc.dev, via the Arc MCP and the shadcn CLI) for **every** primitive: dialogs, drawers, inputs, selects, pickers, buttons, tables, badges, toasts, charts. Hand-build only what Arc lacks (the sidebar shell), and compose that from Arc parts. Font: **Plus Jakarta Sans** (mapped onto Arc's font tokens). |
| Desktop | Keep Electron (it will become a thin wrapper that loads the hosted web URL) and `desktop-agent/`. Both are fixed in Phase 9. |
| Commits | Small, logical commits (one real change each, every commit typechecks). Never add Claude or AI attribution. Don't push unless asked. |

## Assumptions in force (confirm with the owner if they change)
- **Payable day:** a day is payable once it is CLOSED or APPROVED (corrected) with no PENDING correction. Formal timesheet approval is a future feature.
- **Breaks:** unpaid in V1; the client can't mark a break as paid. **Overtime:** hours above 8/day are stored separately and paid at the base rate until a policy is set.
- **Corrections:** a PM reviews only employees on projects they lead; the CEO reviews anything. Requesters edit or withdraw; reviewers approve or reject.
- **Missing clock-out:** the job flags the day and leaves the end time **blank**. It does **not** create a correction (that would require guessing a time); the employee submits one.
- **Changes during a break:** project, location and activity changes are refused while on a break, so a break always belongs to one segment.

## How to run
```bash
# One-time: Postgres role (already done on the dev machine)
#   sudo -u postgres psql -c "CREATE ROLE ccp LOGIN PASSWORD 'ccp' CREATEDB;"
cp server/.env.example server/.env   # then fill in the JWT secrets (command in the file)
cd server && npm install && npx prisma migrate deploy && npx prisma db seed
npm run dev            # API on http://localhost:5000 (from repo root or server/)
npm test               # resets ccp_time_test, then runs every test
```
Seed logins (dev only): `admin@company.com / Admin123!`, `pm@company.com / Manager123!`, `employee@company.com / Employee123!`.

---

## Phase checklist

### ✅ Phase 0: Foundations
- [x] Device key file `desktop-agent/config.json` untracked; `config.example.json` added
- [x] `.env.example` with `COMPANY_TZ`, test DB, cookie domain, and empty JWT secrets
- [x] `docker-compose.yml` (dev Postgres; Docker not installed on the dev machine yet)
- [x] Root `package.json` with `dev` and `test` scripts
- [x] Vitest + Supertest; `npm test` resets the test DB through `tests/global-setup.ts`
- [ ] Revoke the leaked device key `HW-SARAH-CAD-01` in whichever DB issued it (not this one)

### ✅ Phase 1: Backend security
- [x] Boot fails without secrets; JWT pinned to HS256 (`config/env.ts`, `utils/token.ts`)
- [x] httpOnly cookie sessions (`ccp_at`, `ccp_rt`); Bearer still accepted for Electron and the agent
- [x] Auth re-checks the user in the DB on every request; `mustChangePassword` blocks everything except `/auth/me`, `/auth/change-password` and `/auth/logout`
- [x] Reversible passwords removed (`managedPassword` column + `utils/crypto.ts` gone); server-generated temp password shown once; reset revokes the session
- [x] Audit snapshots scrubbed of hashes (Prisma extension in `config/prisma.ts`); the `AuditLog` table is append-only (DB trigger)
- [x] Access leaks closed: `/payroll/my-slips` removed; cost breakdown is management only (PMs for projects they lead); devices are CEO only; evidence is scoped; corrections are validated (no IDOR) and PM-scoped
- [x] "Delete employee" deactivates instead; reactivation works
- [x] Error envelope `{success:false, error:{code,message}}`; Prisma errors → 409/404/400; bad JSON → 400; unknown route → 404; strict CORS; login rate limit
- [x] Tests: `server/tests/security.test.ts`

### ✅ Phase 2: Time engine
- [x] Per-employee advisory lock for every time action (`modules/time/time.totals.ts`)
- [x] Partial unique indexes: one ACTIVE segment per day, one open break per segment, one open activity per segment
- [x] Spec endpoints: `POST /time/start|project|location|activity|breaks/start|breaks/end|end`, `GET /time/today`, `GET /me/time` (legacy aliases kept for `client/`)
- [x] `ActivityType` enum; `LocationType.OTHER`; all timestamps generated on the server
- [x] Missing clock-out flagged without guessing; idempotent job (`stale-session.service.ts`)
- [x] Correction approval closes open breaks and activities at the approved time; totals recomputed from source records
- [x] Lagos workday; overnight shifts stay on the start day
- [x] Tests: `server/tests/time-engine.test.ts` (§62 cases 1–10, §31 example day, timezone)

### 🔄 Phase 3: Data model completion ← **NEXT**
- [ ] Compensation history: `effective_from` / `effective_to`, with a rate-at-time lookup; changes close the old row and are audited (§20)
- [ ] Soft deletes: projects archived (no hard delete), members get `removed_at`, no cascades from time or payroll tables
- [ ] Project fields: `clientName`, `location`, `estimatedHours`, status enum PLANNED/ACTIVE/ON_HOLD/COMPLETED/CANCELLED (§21)
- [ ] Enums aligned with the spec: Break LUNCH/SHORT_BREAK/OTHER; Day OPEN/COMPLETED/MISSING_CLOCK_OUT/CORRECTION_PENDING/CORRECTED
- [ ] `Department` lookup table; `Notification` table (user, type, payload, readAt)
- [ ] Indexes: `WorkDay(status)`, `WorkSegment(workDayId,status)`, `TimeCorrectionRequest(workDayId,status)`; drop redundant ones
- [ ] Seed: CEO, PM, 3 employees, PRJ-001/002/003, two weeks of realistic shifts
- [ ] Tests for rate lookup and soft removal

### ⏳ Phase 4: Missing API surface
- [ ] `GET /management/dashboard` (KPI counts) and `GET /management/status` (live board)
- [ ] `GET /management/projects/:id/report`, `GET /management/employees/:id/report`, `GET /me/report`
- [ ] `GET /management/estimate` (duration and cost estimate, cost CEO only)
- [ ] Payroll: period-aware rates, finalize/lock, CSV export; fix paid-break deduction
- [ ] Pagination, sort and filters on every list
- [ ] Reject corrections that overlap other segments
- [ ] Tests: report math (§31), payroll finalize

### ⏳ Phase 5: Next.js app + design system (`web/`)
- [ ] App Router + TS + Tailwind (layout only) + TanStack Query + zod; rewrite `/api/v1/*` to Express (same origin, so cookies work)
- [ ] Plus Jakarta Sans via `next/font`, mapped onto Arc's `--font-geist` / `--font-inter`
- [ ] Arc set up (`components.json` registry `@uiarc`, `foundation.css`), install the full primitive set (see the plan's table)
- [ ] App shell (sidebar + bottom-sheet on mobile, `user-menu`, `theme-switch`, `notification-center`, `breadcrumb`), sign-in, forced password change

### ⏳ Phase 6: Employee screens
- [ ] Today (punch clock), My time, My projects, My corrections, Profile

### ⏳ Phase 7: Management screens
- [ ] Dashboard, Live status, Employees (+ detail), Projects (+ detail/report/estimate), Corrections review, Payroll, Reports, Work evidence, Audit log, Settings
- [ ] Delete `client/`; drop the legacy time aliases and the body tokens in login

### ⏳ Phase 8: Notifications
### ⏳ Phase 9: Electron + desktop agent fixes
### ⏳ Phase 10: Docker, CI, docs, backups

---

## Known gaps / follow-ups
- The legacy `client/` punch screen has no activity-type picker (its entries save as OTHER); its error toasts read the old error shape. It will be replaced, not fixed.
- Payroll still uses the current rate for past periods and deducts paid breaks (Phase 3/4).
- `GET /me/time` is capped at 366 days instead of paginated (Phase 4).
- Login returns tokens in the body as well as cookies, for the legacy client and Electron (remove in Phase 7).
- Failed logins are not audited.

## Session log
| Date | Work |
|---|---|
| 2026-11-14 | Spec and code audit; plan agreed; Phases 0–2 done (23 commits, 37 tests) |
