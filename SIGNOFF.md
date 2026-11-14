# Sign-off: hand-over to the next AI session

Written 2026-11-14 at the end of a long session. You are picking up a rebuild that is about 60% done.
**Read this file top to bottom, then `progress.md`, before touching code.**

---

## 1. What this project is

CCP is an architecture firm. This app tracks how long each employee works on each project, at the office or on site, with a note on what they were doing.
- Hours × hourly rate gives monthly pay.
- Average daily hours drive an estimate of how many days, and how much money, a project needs.
- The CEO sees everyone's data. Project managers (PMs) see only the people on the projects they lead. Employees see only their own data, and never any money.

The business rules come from `EMPLOYEE & PROJECT TIME MANAGEMENT SYSTEM.pdf` in the repo root. It is untracked and must never be committed. The § numbers in code comments refer to it.

| Folder | What it is | State |
|---|---|---|
| `server/` | Express 4 + Prisma 5 + PostgreSQL API | **Done and tested** (79 tests). Treat it as the contract. |
| `web/` | Next.js 16 app (the new UI) | Shell, auth and **Today** done; the other screens are placeholders |
| `client/` | Old Vite app | **Delete at the end of Phase 7.** Do not fix it. |
| `client/electron/`, `desktop-agent/` | Desktop wrapper and idle agent | Phase 9 |

---

## 2. Rules from the owner (non-negotiable)

1. **Every UI primitive comes from Arc** (uiarc.dev). That covers dialogs, drawers, inputs, selects, buttons, tables, badges, toasts, charts and pickers.
   - They are already installed in `web/components/arc/<name>/<name>.tsx`.
   - Never hand-build a modal, input, select, table or button. Only layout (CSS modules) is ours.
   - Before using a component, **read its props interface in the installed `.tsx`** (or `get_component` through the Arc MCP), and use only documented props.
2. **Font: Plus Jakarta Sans**, already wired. Use weights 400 and 500 only, and sentence-case copy. Never use em dashes in UI copy.
3. **Colours come from Arc tokens only**: `--background`, `--surface`, `--foreground`, `--text-secondary`, `--border`, `--accent`, `--success`, `--warning`, `--danger`. The accent is CCP maroon. Red (`--danger`) is reserved for errors and destructive actions.
4. **Commits:**
   - Small and logical, and every commit must typecheck. The owner wants a high commit count, so split work into several meaningful commits.
   - **Never add `Co-Authored-By`, "Generated with Claude", or any AI attribution.**
   - **Never push** unless the owner asks.
5. **Update `progress.md` in the same commit** as the work it describes.
6. **Ponytail style:** make the smallest change that fully works, with no speculative abstractions. A known shortcut gets a `// shortcut: <limit>, <when to upgrade>` comment. End each reply to the owner with one or two lines on what was skipped and any risks.
7. **Secrets:** never commit `desktop-agent/config.json` or `.env` files. Don't guess database passwords. Keep the owner's email out of everything.
8. **Timezone:** Africa/Lagos. The server decides the workday. The web formats times with `timeZone: "Africa/Lagos"`.

---

## 3. How to run

```bash
# Postgres is local: role ccp/ccp, DBs ccp_time (dev) and ccp_time_test (tests)
cd server && npm install && npx prisma migrate deploy && npx prisma db seed
cd .. && npm run dev        # API  :5000  (npx tsx src/server.ts, no watch: restart after server edits)
npm run dev:web             # web  :3000  (cd web && npm install first)
npm test                    # server tests: resets ccp_time_test, all must pass
cd web && npx tsc --noEmit && npm run lint   # web checks, must be clean
```

Seed logins all use `Password123!`:
- `ceo@example.com` (CEO)
- `manager@example.com` (PM, lead on all three projects)
- `john@`, `mary@` and `peter@example.com` (employees)

The seed includes the following, so screens have data:
- One missing clock-out (John).
- One pending correction (Mary).
- John's rate change on 2026-07-01.

"AuditLog rows are immutable" lines in the test output are expected: a test checks the database trigger.

---

## 4. Architecture you must follow

### Server (`server/src`)
- **Layout:** each module has `*.routes.ts`, `*.controller.ts`, `*.service.ts` and `*.schema.ts` (zod).
- **Response envelope:** `{ success: true, data, meta? }` on success, `{ success: false, error: { code, message, details? } }` on failure. Throw `AppError` (`errors/AppError.ts`).
- **Access rules:**
  - Use `authenticate` and `authorize(Role...)` from `middleware/auth.middleware.ts`.
  - Object-level checks live in `utils/access.ts` (`assertCanViewEmployee`, `pmLeadsProject`, `pmLeadsEmployee`).
  - PM scoping is mandatory on every management read.
- **Time mutations:**
  - Always run inside `withEmployeeLock(employeeId, tx => ...)` (`modules/time/time.totals.ts`).
  - Recompute day totals from source records with `recomputeDayTotals`.
  - All timestamps are generated on the server.
- **Audit and notifications:**
  - Audit by writing `tx.auditLog.create` inside the same transaction as the change.
  - Notify with `notify(tx, userIds, {...})` from `modules/notifications/notification.service.ts`, also inside the transaction.
  - Notification `data` holds ids only, never money.
- **Money:** pay and rate fields are CEO-only.
  - Pay is priced per day at the rate in force that day: `rateOn()` in `modules/employees/compensation.ts`.
  - Reports and aggregates come from `modules/reports/aggregate.ts`; reuse it and never re-derive the maths.
- **Schema changes:**
  - Use `npx prisma migrate dev --name x`.
  - If Prisma refuses a data-loss migration non-interactively, hand-write the SQL in a new migration folder and verify it with `prisma migrate diff`.
- **Tests:** `server/tests/*.test.ts` (Vitest + Supertest, helpers in `tests/helpers.ts`). New server logic gets a test.

### Web (`web/`)
- **Next.js 16:**
  - Read `web/AGENTS.md`: this version has breaking changes.
  - Middleware is now **`proxy.ts`**, and it only redirects signed-out users.
  - **No Tailwind.** Page layout uses a CSS module next to the page, built on Arc tokens (`--space-1..24`, `--text-xs..5xl`, `--radius-control|panel|surface|pill`, `--font-display`).
- **Data:**
  - `lib/api.ts` provides `api.get/page/post/patch/put/delete` and handles the shared 401 refresh.
  - `/api/v1` is rewritten to Express, so cookies are first-party.
  - Use TanStack Query in client components, with `errorMessage(e)` for user-facing errors.
- **Pattern to copy:** `app/(app)/today/` together with `lib/time.ts`.
  - `page.tsx` is a server component holding the metadata, the `PageHeading` and one client component.
  - The client component (`"use client"`) uses query hooks from `lib/*.ts`.
  - Async buttons use Arc `ActionButton` (`onAction` returns a promise, `onActionError` sets an `Alert`).
  - Destructive or irreversible actions use `HoldToConfirm` or `ConfirmMorph`.
  - Side forms use `Drawer` + `DrawerContent`; interrupting confirmations use `Dialog`.
  - Loading uses `Skeleton`, errors use `Alert tone="danger"`, empty lists use `EmptyState`.
- **Import gotchas:** some Arc modules use a **default** export (`SegmentedControl`, `ActionButton`, `HoldToConfirm`, `Badge`). Check the file before importing.
- **Select:** Arc `Select` is a Radix Select. Keep it controlled with `value=""` (not `undefined`) for the empty state.
- **Shell:** role-aware nav lives in `components/shell/nav.ts`. Every route already exists; replace the `<ComingSoon/>` in each `page.tsx` as you build it.
- **Types:** shared types go in `lib/types.ts`, or a domain file like `lib/time.ts`. Mirror the server's enum values exactly.

---

## 5. Done this session (latest first)

- Today punch clock (`web/app/(app)/today/`), checked in a browser: start → break → end break → change location → hold to end.
- `GET /projects?mine=true` lists the caller's own projects; the project picker on Today uses it.
- **Phase 8 server side:**
  - Notifications are sent for: correction submitted (to the CEO and the employee's lead PMs, excluding the requester), correction approved or rejected (to the employee), missing clock-out flagged (to the employee), and project assignment (to the employee).
  - Inbox endpoints: `GET /me/notifications?unread=true&limit=`, which returns `meta.unread`; `POST /me/notifications/:id/read`; `POST /me/notifications/read-all`.
  - Tests are in `server/tests/notifications.test.ts`.
- Earlier: Phases 0–5. See `progress.md`.

---

## 6. Remaining work, in this order

Tick items in `progress.md` as you go.

### Phase 6: Employee screens (Today is done)

| Route | API | Arc parts | Notes |
|---|---|---|---|
| `/my-time` | `GET /me/time?page&limit&startDate&endDate&projectId&location` (paginated workdays with segments and breaks) | `date-range-picker`, `filter-toolbar`, `sortable-data-table`, `pagination`, `timeline` (expanded day), `badge` for day status | Show net hours = work − breaks. Days marked MISSING_CLOCK_OUT get a "Request correction" action that links to `/my-corrections?workDayId=` |
| `/my-projects` | `GET /projects?mine=true`, plus `GET /me/report?from&to` for my hours by project | `card` grid, `progress` | **No money anywhere.** |
| `/my-corrections` | `GET /corrections` (own), `POST /corrections` `{workDayId, reason, requestedChanges:{segmentId? or projectId, proposedClockIn, proposedClockOut}}`, `PATCH /corrections/:id` (edit pending), `DELETE /corrections/:id` (cancel) | `sortable-data-table`, `badge`, `dialog` with `date-picker` + `time-picker` + `textarea`, `confirm-morph` for cancel | Times are Lagos local and must be converted to ISO. The server rejects overlaps, other people's segments and non-member projects; show its message. |
| `/profile` | `GET /auth/me`, `POST /auth/change-password` | `card`, `password-field`, `password-strength` | Reuse the RULES from `app/change-password/change-password-form.tsx` |

### Phase 7: Management screens (CEO and PM)

API map:
- `GET /management/dashboard?from&to` returns `cards` and `charts`.
- `GET /management/status` is the live board.
- `GET /management/employees/:id/report?from&to` and `GET /management/projects/:id/report?from&to`.
- `GET /management/estimate?projectId&employeeIds=a,b`.
- Employees: `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id` (DELETE deactivates), `PATCH /employees/:id/password` (returns the temporary password once), `GET/PUT /employees/:id/compensation` (CEO only).
- Projects: `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:employeeId`.
- Corrections: `GET /corrections?status=`, `PATCH /corrections/:id/review` `{status:'APPROVED'|'REJECTED', reviewNotes}`.
- Payroll (CEO only): `GET /payroll`, `POST /payroll/generate` `{periodStart, periodEnd}`, `POST /payroll/finalize`, `GET /payroll/export?periodStart&periodEnd` (CSV).
- Audit: `GET /audit/logs`.
- Evidence: `GET /activity/workdays/:id/evidence`.
- Departments: `GET/POST/PATCH /departments`.
- Flagged days: `GET /time/flagged`.

Read each service file for the exact response shape before building the screen.

Screens (the Arc component list for each is in the plan file, section "Phase 7"):
1. **Dashboard:** `metric-card` row, plus `bar-chart` (by project), `donut-chart` (location and activity), `line-chart` (over time) and an estimated-vs-actual bar. Load the `dataviz` skill first.
2. **Live status:** table with `avatar` + `badge`, polled every 15 s.
3. **Employees list and detail:**
   - Detail page uses `tabs`: Profile, Projects, Time, Corrections, Report, and Compensation (CEO only).
   - Create and edit happen in a `drawer`.
   - Rate changes use `money-input` + `date-picker`.
   - Reset password shows the temporary password **once**, with a `copy-button`.
   - Deactivate uses `confirm-morph`.
4. **Projects list and detail:**
   - Tabs: Overview (`progress` estimated vs actual), Members (add with `combobox`, remove with `confirm-morph`), Report, Labour cost (CEO only), Estimate (`multi-select` team → days and cost).
5. **Corrections review:** `segmented-control` (Pending/Approved/Rejected), table, and a `drawer` showing the original record next to the requested change, with notes and Approve/Reject. A 409 `ALREADY_REVIEWED` means someone else reviewed it first: refetch.
6. **Payroll (CEO):**
   - `date-range-picker`, then Generate.
   - Show `daysWithoutRate` warnings.
   - Finalize uses `hold-to-confirm`. A 409 `UNRESOLVED_DAYS` lists the days that block it; show them.
   - CSV download: `window.location.href = '/api/v1/payroll/export?...'`.
7. **Reports:** employee and project pickers that reuse the report components from 3 and 4.
8. **Work evidence:** employee + date picker → `timeline`, official vs device numbers in `metric-card`s.
9. **Audit log:** `filter-toolbar`, `pagination`, and `json-viewer` for before/after.
10. **Settings (CEO):**
    - Departments.
    - Devices (list and revoke; a revoke endpoint may need adding).
    - When this lands, change employee create/edit to **reject** unknown departments instead of auto-creating them (`ensureDepartment` in `employee.service.ts`).
11. **Then:**
    - Delete `client/` (move `client/electron` to `/electron` first; it is needed in Phase 9).
    - Remove the legacy time aliases in `server/src/modules/time/time.routes.ts`: `/status`, `/clock-in`, `/clock-out`, `/switch`, `/activities`.
    - Stop returning tokens in the login response body. Electron and the agent use Bearer; check `client/electron` before removing.

### Phase 8: Notifications UI (server is done)
- `web/components/arc/notification-center` is installed. Put it in the top bar (`components/shell/app-shell.tsx`), and poll `GET /me/notifications` every 60 s with `meta.unread` as the badge count.
- Clicking an item marks it read and deep-links from `data`:
  - `workDayId` → `/my-corrections`
  - `correctionId` → `/corrections` for reviewers
  - `projectId` → `/my-projects`
- Not wired yet (optional): ACCOUNT_CREATED and PASSWORD_RESET notifications. The enum values exist.

### Phase 9: Desktop
- **Electron:**
  - Load the hosted web URL instead of `file://`.
  - Fix the duplicate tray icon and quit handling.
  - Send heartbeats only while clocked in.
- **Agent (`desktop-agent/`):**
  - Make idle checks non-blocking.
  - Add macOS (`ioreg`) and Linux (`xprintidle`) support; report `UNKNOWN` when idle time can't be read, never "active".
  - Use HTTPS.
- **Server:** de-duplicate heartbeats per device per minute, and count only the agent source when one exists (`modules/activity-monitoring/activity.service.ts`). Add a test.
- **Owner action:** revoke the leaked device key `HW-SARAH-CAD-01` in whichever DB issued it.

### Phase 10: Ship
- Dockerfiles for `server` and `web`.
- Compose services: web, api, a worker for the stale-session job (`src/jobs/staleSessionWorker.ts`) and postgres. Run `prisma migrate deploy` on start.
- CI: lint, typecheck and tests on each PR.
- Docs: README, ARCHITECTURE, API, DATABASE, SECURITY, DEPLOYMENT (short).
- A nightly `pg_dump` backup.

---

## 7. Definition of done for every screen

1. Typecheck and lint pass in `web/` (and `npm test` passes if you touched `server/`).
2. Checked in a browser (Playwright MCP) as the right role. Screenshots go in `.playwright-mcp/`, which is gitignored.
3. Checked at 390px width and in dark mode.
4. Loading, empty and error states all render (Skeleton, EmptyState, Alert).
5. Signing in as an employee and opening a management URL shows "no access", and the API returns 403.
6. No money is visible to PMs or employees.
7. `progress.md` is updated, and the work is committed in small commits with no AI attribution.

---

## 8. Known gaps (also listed in `progress.md`)

- The 8h/day overtime threshold is hard-coded; there is no policy yet.
- Failed logins are not audited.
- The estimate prices cost at current rates.
- Notifications have no email delivery (future).
- There are no automated web tests, only browser checks. Add Playwright e2e in Phase 10 if time allows.
- The dev test user `ngozi@example.com` exists in the dev DB until the next re-seed.
