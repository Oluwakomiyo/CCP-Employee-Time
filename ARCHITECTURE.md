# Architecture

## Server (`server/src`)

One module per domain, each with `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (zod). Cross-cutting code lives in `config/`, `middleware/`, `errors/`, `utils/`, `jobs/`.

- `auth` — login, refresh rotation, logout, change password. Sessions are httpOnly cookies (`ccp_at`, `ccp_rt`); Bearer tokens are accepted too (tests, scripts). Electron uses the cookies like any browser. JWT is pinned to HS256; the user row is re-checked on every request; `mustChangePassword` gates everything except `/me`, password change and logout.
- `time` — the punch clock. Every mutation runs inside `withEmployeeLock` (per-employee advisory lock), generates its own timestamps, and recomputes day totals from source records. Partial unique indexes enforce one active segment per day, one open break per segment, one open activity per segment.
- `employees` (+ `compensation.ts`) — rate history as `effectiveFrom`/`effectiveTo` rows, one open row per employee; `rateOn()` prices any day at the rate in force that day.
- `projects` — members are soft-removed (`removedAt`); only the CEO appoints/removes leads; projects with recorded time can't be deleted.
- `corrections` — employees fix their own days (one pending request per day, no overlaps, no other people's segments); PMs review only their teams; the CEO reviews anything. Approval rewrites the segment and recomputes totals.
- `reports`/`aggregate.ts` — every number derives from source records (net = segment − breaks inside it; running time measured to now; unresolved missing clock-outs count 0). Reuse it; never re-derive the maths.
- `payroll` — atomic draft runs, finalize blocked by unresolved days, CSV export.
- `notifications` — `notify()` inside the event's transaction; inbox endpoints for the top bar.
- `activity-monitoring` — browser/agent heartbeats, device registry, work evidence. Telemetry is de-duplicated per device per minute; the agent source wins when it reported.
- `audit`, `departments` — append-only audit log (DB trigger), department registry.
- `jobs/staleSessionWorker.ts` — flags missing clock-outs; runs in-process in the API and standalone via `npm run worker`.

All responses use the envelope `{ success: true, data, meta? }` / `{ success: false, error: { code, message } }`. Object-level access goes through `utils/access.ts` (`assertCanViewEmployee`, `pmLeadsProject`, `pmLeadsEmployee`); PM scoping is mandatory on every management read.

## Web (`web/`)

Next.js 16 App Router. `/api/v1/*` rewrites to Express so cookies stay first-party. Route groups: `(app)` for the signed-in shell, `login`, `change-password`. Data flows through `lib/api.ts` (envelope errors → `ApiError`, one shared 401 refresh) into TanStack Query hooks in `lib/*.ts`; pages are thin server components over client views. Every primitive comes from Arc (`components/arc/`); only page layout (CSS modules on Arc tokens) is ours. Management screens share `app/(app)/manage.module.css`; loading states reuse the same layout classes via `components/loading/`.
