# @gw/auth

Better Auth config (ADR 0005). It has no HTTP framework code; `apps/admin-api` mounts it.

- `tableOptions(db)`: options that shape the `auth` tables in `packages/db`. The Better Auth CLI reads only these, so `pnpm auth:generate` needs no secret.
- `createAuth({ db, secret, baseURL, trustedOrigins, log })`: the runtime config. Adds on top of `tableOptions`:
  - email and password login (8 to 128 characters),
  - sessions that last 7 days and refresh after 1 day,
  - the built-in login rate limit (in memory),
  - the origin check, switched on explicitly (also in tests),
  - Better Auth logs sent to `log` (warn and above).
- `CLIENT_IP_HEADER`: the header the rate limit reads the client IP from. The caller sets it from the real connection IP.
- `AuthSession`: the type of `{ user, session }`. `fromNodeHeaders` is re-exported for turning Node headers into web `Headers`.

Regenerate the auth tables: `pnpm auth:generate`, then `pnpm db:generate --name <what_changed>`.
