# API

Base path `/api/v1`. Envelope: `{ success: true, data, meta? }`, errors `{ success: false, error: { code, message, details? } }`. Authenticate with the session cookie (web) or `Authorization: Bearer <token>`. Management routes require CEO or PM; object rules are enforced per record (403 otherwise).

## Auth
- `POST /auth/login` `{email, password}` → `{ user }` + session cookies
- `POST /auth/refresh` (cookie or `{refreshToken}`) → `{ message }` + rotated cookies
- `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` `{currentPassword, newPassword}` (min 10 chars, a letter, a number)

## Time (employee)
- `POST /time/start|project|location|activity|breaks/start|breaks/end|end`, `GET /time/today`
- `GET /me/time?page&limit&startDate&endDate&projectId&location` (paginated workdays with segments, breaks, activities)
- `GET /time/flagged` (missing clock-outs, management)

## Corrections
- `GET /corrections?status=&page&...` (own for employees; team-scoped for PMs)
- `POST /corrections` `{workDayId, reason, requestedChanges: {segmentId?|projectId, proposedClockIn, proposedClockOut}}` (ISO; Lagos wall time converted client-side)
- `PATCH /corrections/:id` (edit pending), `DELETE /corrections/:id` (withdraw)
- `PATCH /corrections/:id/review` `{status: APPROVED|REJECTED, reviewNotes?}` (management; 409 `ALREADY_REVIEWED` if taken)

## People and projects
- `GET/POST /employees`, `GET/PATCH/DELETE /employees/:id` (DELETE deactivates), `PATCH /employees/:id/password` (one-time temp password), `GET/PUT /employees/:id/compensation` (CEO)
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/members`, `DELETE /projects/:id/members/:employeeId`
- `GET/POST/PATCH /departments`
- `GET/POST/PATCH /positions` (same rules as departments; the employee form picks from this list)
- `GET /roles` (roles.manage or employees.manage), `GET /roles/catalog`, `POST /roles`, `PATCH /roles/:id`, `POST /roles/:id/reset`, `DELETE /roles/:id` (roles.manage); `PUT /roles/assign/:employeeId` (employees.manage, never beyond your own access). `/auth/me` returns `roleInfo` and `permissions`.

## Management reports
- `GET /management/dashboard?from&to` (cards + charts), `GET /management/status` (live board)
- `GET /management/employees/:id/report?from&to`, `GET /management/projects/:id/report?from&to` (labour cost CEO only)
- `GET /management/employees/:id/workdays?date=` (one day with segments, for evidence)
- `GET /management/estimate?projectId&employeeIds=a,b` (cost CEO only)
- `GET /me/report?from&to` (own hours, never money)

## Payroll (CEO), audit, devices, notifications
- `GET /payroll`, `POST /payroll/generate`, `POST /payroll/finalize` (409 `UNRESOLVED_DAYS`), `GET /payroll/export?periodStart&periodEnd` (CSV)
- `GET /audit/logs`, `GET /activity/devices` + `POST /activity/devices/:id/revoke` (CEO)
- `GET /activity/workdays/:id/evidence`, `POST /activity/agent-heartbeat` (`X-Device-Key`), `POST /activity/browser-heartbeat`
- `GET /me/notifications?unread=&limit=` (`meta.unread`), `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`
