# @gw/admin-api

Backend for the dashboard.

**Does:** sign-up/login (sessions), projects, provider key storage (encrypt), gateway key issuance (show once, store hash), revocation, limits and budget settings, spend reports.

**Auth:** user sessions (cookie). Never accepts gateway keys.

## Run

- `pnpm --filter @gw/admin-api dev`: compiles to `dist/`, then rebuilds and restarts on file changes (including changes in packages it uses); loads the root `.env`.
- `pnpm --filter @gw/admin-api start`: runs the compiled `dist/main.js` (run `pnpm --filter @gw/admin-api build` first); real environment variables only (never reads `.env`).
- `pnpm --filter @gw/admin-api build`: compiles `src/` to `dist/`.

If a required variable is missing or invalid, the process prints which one and exits with code 1.

## Config

Each task adds its vars here.

| Variable             | Required / default | Meaning                                                                                                                                      |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_API_PORT`     | required           | Port to listen on (0 to 65535; 0 = any free port)                                                                                            |
| `ADMIN_API_HOST`     | `127.0.0.1`        | Address to listen on. Containers set `0.0.0.0`                                                                                               |
| `LOG_LEVEL`          | `info`             | Log detail, see the levels below                                                                                                             |
| `DATABASE_URL`       | required           | Postgres URL (`postgres://` or `postgresql://`, with a host, no whitespace)                                                                  |
| `BETTER_AUTH_SECRET` | required           | Signs session cookies; at least 32 characters, no leading or trailing whitespace. Changing it logs everyone out                              |
| `BETTER_AUTH_URL`    | required           | Public origin of this API: lowercase `scheme://host[:port]`, no default port, no path. `https` unless the host is `localhost` or `127.0.0.1` |
| `DASHBOARD_ORIGIN`   | required           | Origin the dashboard runs on. Same rules as `BETTER_AUTH_URL`. Trusted for cookie requests                                                   |

`LOG_LEVEL` values: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.

## Routes

| Method | Path | Needs | Returns |
|---|---|---|---|
| GET | `/health` | nothing | `{ "status": "ok" }` while the process is up (liveness) |
| POST | `/api/auth/sign-up/email` | nothing | `{ token, user }` and a session cookie |
| POST | `/api/auth/sign-in/email` | nothing | `{ token, user, redirect, url }` and a session cookie |
| POST | `/api/auth/sign-out` | cookie and trusted `Origin` | `{ success: true }` and a clearing cookie |
| GET | `/api/auth/get-session` | cookie (optional) | `{ session, user }`, or `null` |
| GET | `/api/me` | cookie | `{ id, email, name }` |

Unsafe methods (POST, PUT, PATCH, DELETE) need an `Origin` header from the trusted list: the dashboard origin and the API's own origin. Rate limit on sign-in and sign-up: 3 per 10 s per IP, then 429 with `Retry-After`. Details: [api.md](../../docs/architecture/api.md#auth-and-session-routes), [security.md](../../docs/architecture/security.md#dashboard-sessions).

### Adding a protected route

1. Register the route inside `src/protected-api.ts` (a `register(...)` next to `meRoutes`). That scope already requires a trusted `Origin` on unsafe methods and a valid session, so a new route cannot be left open by mistake.
2. In the handler, call `getAuthUser(request)` to get the logged-in user.
3. Never register a route that needs login outside that scope: `getAuthUser` throws there (a logged 500).

### Testing with auth

Helpers are in `src/testing/auth-requests.ts` (test-only, not built):
- `signUp`, `signIn`, `signOut`, `getSession`: send the request with `app.inject`, the dashboard `Origin` and a **unique** client IP. Pass `origin: null` to send no `Origin`.
- `cookieFrom(response)`: the session cookie as `name=value` for the next request. It finds the cookie by name pattern, because https adds a `__Secure-` prefix.
- `uniqueIp()`: the rate limit is per IP and its memory is shared by every app in a test file, so each request needs its own IP.
- `testConfig()` gives a fresh migrated database and a random secret. Tests must send `Origin` (even for DELETE and POST on protected routes).
- To test database failures in a real process (`src/server-process.test.ts`), point `DATABASE_URL` at a closed port and send a made-up token **signed with the secret** (`signedCookie`). An unsigned cookie is rejected before the database is touched.


## Errors

Every error uses one JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request is invalid",
    "requestId": "0b7e2c3a-6d1f-4a39-9a55-3f1c8e2d7b10",
    "details": [{ "path": "body.name", "message": "Too small: expected string to have >=1 characters" }]
  }
}
```

Codes: `BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `INTERNAL`.

Better Auth's own errors (`{ message, code }`) are translated into this shape (`src/auth/auth-error.ts`):

| Better Auth answer | Ours |
|---|---|
| duplicate email (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) | 409 `CONFLICT` |
| bad input (`VALIDATION_ERROR`, password too short or long, invalid email) | 400 `VALIDATION_FAILED` |
| other 4xx | the same status, mapped to a code (401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 429 `RATE_LIMITED`, ...) with Better Auth's message |
| 5xx | 500 `INTERNAL`, generic; the cause is logged |

`details` appears only for validation errors. 5xx errors never include details. Quote the `requestId` when reporting a problem.
