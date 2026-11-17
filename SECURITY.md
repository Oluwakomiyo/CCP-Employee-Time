# Security

- **Secrets** live in `server/.env` (never committed; see `.env.example`). The server refuses to boot without JWT secrets; JWT is pinned to HS256.
- **Sessions** are httpOnly, SameSite=Lax cookies (`ccp_at` 15 min, `ccp_rt` 7 days, rotated on refresh with reuse detection). Bearer tokens are accepted for tests and scripts. Electron is a browser window and uses the same cookies; the desktop agent authenticates with its own device key (`X-Device-Key`), never a user token. No token ever appears in a response body.
- **Passwords**: bcrypt hashes only; temp passwords shown once; reset revokes the session; login requires 10+ chars with a letter and a number; login attempts are rate-limited; failed logins are not yet audited.
- **Permissions**: every route checks a permission (`authenticate` + `requirePermission` from `src/auth/can.ts`); the catalog and the three built-in presets live in `src/auth/permissions.ts`. Roles are data (`AppRole`, `RolePermission`), edited in Roles & permissions; a user's permissions are read from the database on every request, so a change applies on the next call.
- **Scoping**: scoped permissions carry OWN / TEAM / ALL; reads check records with `assertCanSee`, `visibleEmployeeIds` and `assertProjectInScope` (`src/utils/access.ts`). TEAM means people on projects the user leads. Money (rates, labour cost) needs `compensation.view`.
- **Role safety**: the CEO / Admin role always keeps `roles.manage`; at least one active user must hold it (`LAST_ROLE_ADMIN`); without `roles.manage` nobody can assign a role with more access than their own.
- **Audit**: every mutation writes an `AuditLog` row in the same transaction; snapshots are scrubbed of hashes; the table is append-only.
- **Transport**: strict CORS allow-list, Helmet headers; the desktop agent refuses plain HTTP except to localhost.

## Desktop app and device keys
- The desktop app enrolls its computer for the signed-in person (`POST /activity/devices/enroll`, needs `time.track`). It sends a SHA-256 of the OS machine id, never the raw id.
- Each device key is shown once and stored by the app encrypted with the OS keychain (`safeStorage`); the server keeps only its SHA-256 and compares in constant time.
- A computer registered to someone else is refused (`DEVICE_OWNED`); a revoked one stays off until an admin reinstates it (`DEVICE_REVOKED`). Enroll, register, revoke and reinstate are all audited.
- Reported data: active/idle state, idle seconds and timestamps. No screenshots, keystrokes, window titles or files.
