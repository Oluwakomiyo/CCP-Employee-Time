# Sign-off: hand-over to the next AI session

Written 2026-11-14, updated at the end of the same day. You are picking up a rebuild that is about 85% done: the API is complete, and every web screen except **Reports** and **Work evidence** is built and browser-checked. A separate review of your work will follow, so keep commits small and claims verifiable.
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
- **Pattern to copy:** for a management screen, copy `app/(app)/employees/` (list + `[id]` detail with tabs) and `lib/employees.ts`. Share layout through `app/(app)/manage.module.css`; don't create a new CSS module unless the screen needs something it lacks.
  - `page.tsx` is a server component holding the metadata, the `PageHeading` and one client component.
  - The client component (`"use client"`) uses query hooks from `lib/*.ts`.
  - Async buttons use Arc `ActionButton` (`onAction` returns a promise, `onActionError` sets an `Alert`).
  - Destructive or irreversible actions use `HoldToConfirm` or `ConfirmMorph`.
  - Side forms use `Drawer` + `DrawerContent`; interrupting confirmations use `Dialog`.
  - Loading uses `Skeleton`, errors use `Alert tone="danger"`, empty lists use `EmptyState`.
- **Import gotchas:** some Arc modules use a **default** export (`SegmentedControl`, `ActionButton`, `HoldToConfirm`, `Badge`). Check the file before importing.
- **ConfirmMorph defaults say "Delete / Deleting / Deleted".** Always pass `confirmLabel`, `pendingLabel` and `doneLabel` that match the action (Withdraw, Deactivate, Remove...).
- **Never put a ConfirmMorph in the last column of a table.** It expands to the right when confirming, gets clipped, and the confirm click lands outside it, which Arc treats as Cancel. That was a real bug on Settings → devices. Use a Button that opens a `Dialog` instead (see `settings-view.tsx`). **Check `/my-corrections` (its Withdraw is a ConfirmMorph in the table's last column) at 1280px and 390px, and fix it the same way if it clips.**
- **Arc `Alert` renders its children inside a `<p>`.** Never put a list or block elements in it; render them in a card below the alert (see `payroll-view.tsx`).
- **Alerts other than `tone="danger"` have `role="status"`, not `role="alert"`.** Account for this when testing.
- **`MoneyInput`:** pass `currencies={["NGN"]}` and `quickAdd={[]}`; its defaults are USD and "+$10" chips.
- **HoldToConfirm / ConfirmMorph:** always pass `confirmed={state}`. Set it to true in `onConfirm` and back to false when the request settles. Left uncontrolled, the button sticks on its done label after a refused request: a real bug found on Today.
- **Select:** Arc `Select` is a Radix Select. Keep it controlled with `value=""` (not `undefined`) for the empty state.
- **Shell:** role-aware nav lives in `components/shell/nav.ts`. Every route already exists; replace the `<ComingSoon/>` in each `page.tsx` as you build it.
- **Types:** shared types go in `lib/types.ts`, or a domain file like `lib/time.ts`. Mirror the server's enum values exactly.

---

## 5. Done this session (latest first)

- **Review of phases 7–10 (2026-11-14, evening):**
  - **Fixed: rates were saved 100× too high.** Arc `MoneyInput` reports **kobo**; forms now convert with `koboToNaira` (`lib/employees.ts`). Any rate entered through the UI before this fix is wrong: re-seed, or correct it on the Compensation tab.
  - **Fixed:** in compose, the missing clock-out job ran in both the api and the worker (`RUN_STALE_WORKER=false` on the api).
  - **Improved Employees and Projects:**
    - Avatar header with status and role badges.
    - Last-30-day numbers on the employee overview.
    - The projects list shows hours against each estimate (the API now sends `hoursWorked` for management only, tested).
    - A project details card.
    - Readable dates and sentence-case statuses.
    - Metric cards sit two per row on phones.
  - 89 server tests pass.

- **Phase 7 (most of it):**
  - Corrections review.
  - Employees list and detail.
  - Projects list and detail (team, report, estimate).
  - Payroll.
  - Audit log.
  - Settings.

  Every screen was checked in a browser as the CEO, and where relevant as the PM. `progress.md` lists the details.
- **API additions:**
  - The correction list now includes the day's recorded entries (segments).
  - `GET /activity/devices` and `POST /activity/devices/:id/revoke` (CEO only, tested).
  - Live status now sends `sinceSeconds`.
  - Employee create/edit rejects unknown departments (`UNKNOWN_DEPARTMENT`).
  - 81 server tests pass.
- **Dashboard and live status fixes from the review:** see `progress.md`.
- **The dev database has test data from browser checks:**
  - Employee Tola Ade (CCP-090).
  - The "Interior Design" department.
  - A revoked device `HW-PETER-LT-01`.
  - A draft payroll for 1–14 Nov.
  - Mary's seed correction, now approved.

  Run `cd server && npx prisma db seed` to restore the clean demo data (it also removes `ngozi@example.com`). Ask the owner before re-seeding if they have entered real data.

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

### Phase 6: Employee screens: done

### Phase 7: what is left
1. **Reports** (`/reports`, CEO and PM):
   - Pick an employee (`combobox` fed by `useEmployees`) or a project (fed by `useProjects`).
   - Show the same blocks as the Report tab on the employee or project detail page.
   - Move the `Report`/`HoursList` pieces out of `employees/[id]/employee-detail.tsx` and `projects/[id]/project-detail.tsx` into a shared component rather than copying them.
   - The API is `GET /management/employees/:id/report?from&to` and `GET /management/projects/:id/report?from&to` (the project report accepts a range too).
   - Add a `date-range-picker`.
2. **Work evidence** (`/evidence`, CEO and PM):
   - Pick an employee and a date. `GET /me/time` only returns your own days, so it can't find someone else's workday id.
   - Add a small management endpoint, for example `GET /management/employees/:id/workdays?date=`, scoped with `assertCanViewEmployee`. Or extend the employee report.
   - Then call `GET /activity/workdays/:id/evidence` and read `activity.service.ts getWorkEvidenceSummary` for the shape.
   - Show official time vs device activity in `metric-card`s, plus a `timeline`. Use neutral wording: evidence, not accusation.
3. **Then:**
   - Delete `client/`, but move `client/electron` to `/electron` first; Phase 9 needs it.
   - Remove the legacy time aliases in `server/src/modules/time/time.routes.ts`: `/status`, `/clock-in`, `/clock-out`, `/switch`, `/activities`. Also remove the `isActive` legacy toggle in `project.schema.ts`.
   - Stop returning tokens in the login response body. Electron and the agent use Bearer; check `client/electron` before removing.
   - Run the tests after each removal.

API reference for these:
- Reports: `GET /management/employees/:id/report?from&to`, `GET /management/projects/:id/report?from&to`, `GET /management/estimate?projectId&employeeIds=a,b`.
- Evidence: `GET /activity/workdays/:id/evidence`.
- Flagged days: `GET /time/flagged`.

Read each service file for the exact response shape before building.

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

- **Electron (decided 2026-11-14): no activity tracking.** It is a window onto the web app with a tray icon, locked to the CCP origin (other links open in the browser). Device activity comes only from `desktop-agent/`, installed beside it with a key issued in Settings → Desktop devices. Do not add a token bridge or self-registration to Electron.
- **Notification bell:** "Mark unread" and "Dismiss" are local only (no server counterpart) and revert on the next poll. "Mark all read" and the unread count are fixed.

- PMs can list and open **any** employee's profile (`GET /employees`, `GET /employees/:id`): name, email, department, no money. It's needed to add people to projects. Ask the owner whether PMs should see only their team.
- The payroll **successful finalize** was never clicked through in the browser (dev data always has an open day); the server tests cover it.
- There is no idle-threshold setting yet; Settings has departments and devices only.

- The 8h/day overtime threshold is hard-coded; there is no policy yet.
- Failed logins are not audited.
- The estimate prices cost at current rates.
- Notifications have no email delivery (future).
- There are no automated web tests, only browser checks. Add Playwright e2e in Phase 10 if time allows.
- The dev test user `ngozi@example.com` exists in the dev DB until the next re-seed.
