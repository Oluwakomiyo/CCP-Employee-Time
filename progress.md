# CCP Time Management: Progress

Single source of truth for where the rebuild stands. **Update this file in the same commit as the work it describes.**

- Spec: `EMPLOYEE & PROJECT TIME MANAGEMENT SYSTEM.pdf` (repo root, untracked). Section numbers below (§) refer to it.
- Full plan: `~/.claude/plans/pasted-content-id-0c4c-i-m-attaching-robust-toucan.md` (summarised here).
- **New session? Read `SIGNOFF.md` first**: rules, conventions, API map and the ordered to-do list.

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
npm run dev            # API on http://localhost:5000
npm run dev:web        # web app on http://localhost:3000 (cd web && npm install first)
npm test               # resets ccp_time_test, then runs every test
```
Seed logins (dev only, all `Password123!`): `ceo@example.com` (CEO), `manager@example.com` (PM, lead of all 3 projects), `john@example.com`, `mary@example.com`, `peter@example.com`.

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

### ✅ Phase 3: Data model completion
- [x] Compensation history: `effectiveFrom` / `effectiveTo`; one open row per employee (partial unique) and a CHECK on period order; `rateOn()` in `modules/employees/compensation.ts`; a change closes the old row and is audited as COMPENSATION_CHANGED; `GET /employees/:id/compensation` returns `{ current, history }`
- [x] Payroll and the project cost breakdown price each day at the rate in force that day; payroll includes people who left during the period
- [x] Members soft-removed (`removedAt`; partial unique "one active membership"); only the CEO appoints or removes leads
- [x] Projects can be deleted only if they have no recorded time (409 PROJECT_HAS_HISTORY); otherwise change the status
- [x] History tables use `onDelete: Restrict` instead of cascading (employees are never hard-deleted)
- [x] Project fields `clientName`, `location`, `estimatedHours`, `createdById`, `status` (PLANNED/ACTIVE/ON_HOLD/COMPLETED/CANCELLED); `isActive` is now a computed field (Prisma result extension)
- [x] Enums renamed to the spec: Day COMPLETED/MISSING_CLOCK_OUT/CORRECTED; Break LUNCH/SHORT_BREAK/OTHER (data migrated)
- [x] `Department` table; `Employee.department` is an FK to `Department.name` (responses stay a string; renaming cascades); `GET/POST/PATCH /departments`
- [x] `Notification` table + `NotificationType` enum (service in Phase 8)
- [x] Indexes tuned (status lookups added, duplicates of unique keys dropped)
- [x] Seed: spec §66 accounts, PRJ-001/002/003, rate history, 10 working days, one missing clock-out, one pending correction
- [x] Tests: `tests/compensation.unit.test.ts`, `tests/data-model.test.ts`

### ✅ Phase 4: Missing API surface
- [x] Shared aggregation from source records: `modules/reports/aggregate.ts` (net = segment − breaks inside it; activity time minus overlapping breaks; running time measured to now; unresolved missing clock-outs count 0)
- [x] `GET /management/dashboard?from&to`: cards (working, on break, not clocked in, finished, hours today, active projects, missing clock-outs, pending corrections) + charts (by project, department, employee, over time, location, activity, estimated vs actual)
- [x] `GET /management/status`: live board (WORKING / ON_BREAK / FINISHED / NOT_STARTED)
- [x] `GET /management/projects/:id/report`, `GET /management/employees/:id/report`, `GET /me/report` (no money for PMs or employees; labour cost CEO only, priced per day)
- [x] `GET /management/estimate?projectId&employeeIds=a,b`: remaining estimate (or completed-project average) ÷ team daily average (90 days; 8h assumed + flagged when no history); cost CEO only
- [x] PM scoping on every management endpoint (`visibleEmployeeIds`, `pmLeadsProject`)
- [x] Payroll: atomic DRAFT runs, `POST /payroll/finalize` (blocked by unresolved days; locks records), `GET /payroll/export` CSV (formula-injection safe), overlap guard, 3-month max period; list no longer loads every workday ever
- [x] Lists: shared `utils/listing.ts`; sort allow-lists on employees, projects, corrections; corrections date filter; `/me/time` paginated + project/location filters
- [x] Corrections that overlap another work period are rejected
- [x] Legacy cost breakdown derived from the project report (net of breaks)
- [x] Tests: `aggregate.unit`, `reports`, `payroll`, `listing` (76 total)

### ✅ Phase 5: Next.js app + design system (`web/`)
- [x] Next.js **16.4** App Router + TypeScript, **no Tailwind** (Arc uses CSS modules and tokens; page layout uses CSS modules with Arc tokens)
- [x] Next 16 renamed middleware to **`proxy.ts`**: it redirects signed-out visitors to `/login?next=` (UX only; the API authorizes)
- [x] `/api/v1/*` rewrites to Express (`API_ORIGIN`, default `http://localhost:5000`), so httpOnly cookies are first-party; the refresh cookie path is `/` so the proxy can see sessions
- [x] Arc: `components.json` (`@uiarc` registry), `components/arc/foundation.css`, full free primitive set installed under `components/arc/`
- [x] Plus Jakarta Sans (400/500) mapped to `--font-geist` and `--font-inter`; **CCP maroon accent** `data-accent="ccp"` defined in `app/globals.css` (red stays Arc's danger colour)
- [x] Light/dark/system theme (`lib/theme.tsx`, `useSyncExternalStore`), applied before first paint by a script in `app/layout.tsx`
- [x] `lib/api.ts`: fetch wrapper, envelope errors → `ApiError`, one shared refresh on 401; TanStack Query provider (no retries on 4xx)
- [x] `/login` and `/change-password` composed from Arc inputs (the Arc `sign-in` block is email-code/passkey only, so not used); the forced change works end to end
- [x] App shell (`components/shell/`): sidebar + bottom-sheet menu on phones, Arc `user-menu` (theme, profile, sign out), role-aware nav (`nav.ts`), access-denied state, `PageHeading`
- [x] Every route exists with a `ComingSoon` placeholder (delete each one as its screen lands)
- [x] Checked in a browser: employee/CEO nav, dark mode, 390px, the password change, the access-denied page

### ✅ Phase 6: Employee screens
- [x] Today punch clock (`web/app/(app)/today/`, hooks in `web/lib/time.ts`): start, break, change project/location/activity in a drawer, hold to end; polls every 15 s; browser-checked
- [x] `GET /projects?mine=true` (the caller's own projects, for pickers)
- [x] My time (`web/app/(app)/my-time/` + `web/lib/history.ts`): paginated workdays with date-range, project and location filters, day timeline detail, missing clock-out correction link; browser-checked (light/dark, 390px)
- [x] My projects (`web/app/(app)/my-projects/` + `web/lib/my-projects.ts`): card grid with team, lead, my hours in range and progress against estimate, summary stats; no money anywhere; browser-checked (390px)
- [x] My corrections (`web/app/(app)/my-corrections/` + `web/lib/corrections.ts`): status filter, table with review notes, dialog with workday/entry/time pickers and reason, edit pending, withdraw via confirm; deep link `?workDayId=` auto-opens; server messages shown; browser-checked as employee (create, overlap error, withdraw)
- [x] Profile (`web/app/(app)/profile/`): details card plus password change reusing the change-password rules; error path browser-checked; employee opening a management URL still gets no access
- [x] Phase 6 done: all four employee screens built, typecheck/lint clean, browser-checked
- [x] Skeleton audit and rebuild (`web/components/loading/`, colocated `*-skeleton.tsx`): every loading state mirrors its real UI; verified live, 390px, dark, reduced-motion; real UI untouched

### 🔄 Phase 7: Management screens ← **NEXT**
- [x] Dashboard (`web/app/(app)/dashboard/` + `web/lib/dashboard.ts`): metric cards, hours by project/over time/estimated-vs-actual bars, location/activity donuts, 7/30/90-day ranges; no money anywhere; browser-checked as CEO and PM, 390px, dark, loading skeleton, range switch
- [x] Live status (`web/app/(app)/live/` + `web/lib/live.ts`): avatar + badge table polled every 15 s with ticking elapsed; browser-checked as CEO, 390px
- [x] Review fixes: live board times a break from its start (`sinceSeconds` from the API) and sorts numerically; dashboard fills empty days, shows estimates as per-project progress (over-budget badge), adds Not clocked in / Finished cards, keeps the old range on screen while switching, fixes chart and card labels
- [ ] Employees (+ detail), Projects (+ detail/report/estimate), Corrections review, Payroll, Reports, Work evidence, Audit log, Settings
- [ ] Delete `client/`; drop the legacy time aliases and the body tokens in login

### 🔄 Phase 8: Notifications
- [x] Server: `notify()` inside the event's transaction; correction submitted (CEO + lead PMs), approved/rejected (employee), missing clock-out (employee), project assigned (employee); `GET /me/notifications`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`; tests (79 total)
- [ ] Web: Arc `notification-center` in the top bar (installed), 60 s polling, deep links
### ⏳ Phase 9: Electron + desktop agent fixes
### ⏳ Phase 10: Docker, CI, docs, backups

---

## Known gaps / follow-ups
- The legacy `client/` punch screen has no activity-type picker (its entries save as OTHER); its error toasts read the old error shape. It will be replaced, not fixed.
- Unknown department names are auto-created on employee create/edit (shortcut until the Settings screen exists; then reject them).
- Payroll: 8h/day overtime threshold is hard-coded (no policy yet). Days with no rate are skipped and returned as `daysWithoutRate`.
- Dashboard "hours today" counts the date's segments; employees with no visible projects show only themselves to a PM.
- Estimate uses current rates for cost (future rates are unknown by definition).
- Login returns tokens in the body as well as cookies, for the legacy client and Electron (remove in Phase 7).
- Failed logins are not audited.

## Session log
| Date | Work |
|---|---|
| 2026-11-14 | Phase 8 server (notifications), Today punch clock, `SIGNOFF.md` hand-over |
| 2026-11-14 | Spec and code audit; plan agreed; Phases 0–2 done (23 commits, 37 tests) |
| 2026-11-14 | Phase 5 done (Next.js 16 + Arc shell, auth screens, theme, maroon accent) |
| 2026-11-14 | Phase 4 done (reports, dashboard, live status, estimate, payroll finalize/CSV, lists; 76 tests) |
| 2026-11-14 | Phase 3 done (data model: rate history, soft membership, project status, departments, notifications table, new seed; 51 tests) |
| 2026-11-14 | Phase 6 done (my time, my projects, my corrections, profile); employee access-denied re-verified |
| 2026-11-14 | Skeleton audit and rebuild: every loading state mirrors its real UI (shared Block + TableSkeleton primitives, colocated skeletons reusing layout classes); verified live, 390px, dark, reduced-motion; real UI untouched |
