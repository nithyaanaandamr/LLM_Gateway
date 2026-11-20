# API *(draft)*

To be specified in Phase 1.

## Gateway (hot path)

Mirrors the provider's API so users only change base URL and key.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat/completions` | Streaming and non-streaming |

Errors: `401` bad key, `429` rate limit, `402`/`429` budget exceeded *(decide)*, `502` provider error, `503` Redis down and fail-closed.

## Admin API

| Area | Routes (draft) |
|---|---|
| Auth | Better Auth, mounted by us: see [Auth and session routes](#auth-and-session-routes) |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Provider key | `PUT/DELETE /api/projects/:id/provider-key` |
| Gateway keys | `GET/POST /api/projects/:id/keys`, `DELETE /api/keys/:id` |
| Usage | `GET /api/projects/:id/usage?from&to&groupBy` |

### Auth and session routes

Only these exist; every other `/api/auth/*` path is a 404. Session design: [security.md](security.md#dashboard-sessions).

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | none | `{ token, user }` + Set-Cookie |
| POST | `/api/auth/sign-in/email` | none | `{ token, user, redirect, url }` + Set-Cookie |
| POST | `/api/auth/sign-out` | cookie + trusted `Origin` | `{ success: true }` + clearing Set-Cookie |
| GET | `/api/auth/get-session` | cookie (optional) | `{ session, user }`, or `null` when logged out |
| GET | `/api/me` | cookie (protected scope) | `{ id, email, name }` |

- **Bodies:** sign-up `{ name, email, password }`, sign-in `{ email, password }`. Unknown keys are rejected with 400. Password length (8 to 128) is checked by Better Auth.
- **Origin:** unsafe methods (POST, PUT, PATCH, DELETE) need an `Origin` header from the trusted list (the dashboard origin and the API's own origin), else 403. Scripts must send it.
- **Errors:** every error uses our shape (see the admin-api README). A duplicate email is 409, a wrong password or unknown email is 401 with the same message, a missing or invalid session is 401.
- **Rate limit:** 3 tries per 10 s per IP on sign-in and sign-up. Over the limit: 429 `RATE_LIMITED` with a `Retry-After` header (seconds to wait).
- **Caching:** every response, errors included, carries `Cache-Control: no-store`, so per-user data and tokens never stay in browser, proxy or CDN caches.
- **Cookie routes under `/api`:** routes registered in `protected-api.ts` need a valid session and, for unsafe methods, a trusted `Origin`.
