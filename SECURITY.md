# Security

- **Secrets** live in `server/.env` (never committed; see `.env.example`). The server refuses to boot without JWT secrets; JWT is pinned to HS256.
- **Sessions** are httpOnly, SameSite=Lax cookies (`ccp_at` 15 min, `ccp_rt` 7 days, rotated on refresh with reuse detection). Bearer tokens are accepted for Electron, tests and scripts. No token ever appears in a response body.
- **Passwords**: bcrypt hashes only; temp passwords shown once; reset revokes the session; login requires 10+ chars with a letter and a number; login attempts are rate-limited; failed logins are not yet audited.
- **Scoping**: routes check roles (`authenticate` + `authorize`); reads check records (`assertCanViewEmployee`, `pmLeadsProject`, `pmLeadsEmployee`). PMs see only people on projects they lead. Employees see only themselves and never money (labour cost and rates are CEO-only).
- **Audit**: every mutation writes an `AuditLog` row in the same transaction; snapshots are scrubbed of hashes; the table is append-only.
- **Transport**: strict CORS allow-list, Helmet headers; the desktop agent refuses plain HTTP except to localhost.
