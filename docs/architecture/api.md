# API *(draft)*

To be specified in Phase 1.

## Gateway (hot path)

Mirrors the provider's API so users only change base URL and key.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat/completions` | Streaming and non-streaming |

Errors: `401` bad key, `429` rate limit, `402`/`429` budget exceeded *(decide)*, `502` provider error, `503` Redis down and fail-closed.

## Admin API

| Area | Routes |
|---|---|
| Auth | Better Auth, mounted by us: see [Auth and session routes](#auth-and-session-routes) |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:projectId`: see [Projects](#projects) |
| Provider key | `GET/PUT/DELETE /api/projects/:projectId/provider-key`: see [Provider key](#provider-key) |
| Gateway keys | `GET/POST /api/projects/:projectId/gateway-keys`, `DELETE /api/projects/:projectId/gateway-keys/:keyId`: see [Gateway keys](#gateway-keys) *(planned)* |
| Usage | `GET /api/projects/:projectId/usage?from&to&groupBy` *(draft)* |

All routes except the auth routes need a session cookie (protected scope). Routes with `:projectId` also sit in the **project scope**: the user must own the project, else 404 (see [security.md](security.md#authorization)). Revoking a gateway key lives under its project (not `/api/keys/:id`), so the project scope covers it.

### Auth and session routes

Only these exist; every other `/api/auth/*` path is a 404. Session design: [security.md](security.md#dashboard-sessions).

| Method | Path | Auth | Returns |
|---|---|---|---|
| POST | `/api/auth/sign-up/email` | none | `{ token, user }` + Set-Cookie |
| POST | `/api/auth/sign-in/email` | none | `{ redirect, token, user }` + Set-Cookie |
| POST | `/api/auth/sign-out` | trusted `Origin` (cookie to end a session) | `{ success: true }` + clearing Set-Cookie; with no cookie it still answers 200 |
| GET | `/api/auth/get-session` | cookie (optional) | `{ session, user }`, or `null` when logged out |
| GET | `/api/me` | cookie (protected scope) | `{ id, email, name }` |

- **Bodies:** sign-up `{ name, email, password }`, sign-in `{ email, password }`. Unknown keys are rejected with 400. Password length (8 to 128) is checked by Better Auth.
- **Origin:** unsafe methods (POST, PUT, PATCH, DELETE) need an `Origin` header from the trusted list (the dashboard origin and the API's own origin), else 403. Scripts must send it.
- **Errors:** every error uses our shape (see the admin-api README). A duplicate email is 409, a wrong password or unknown email is 401 with the same message, a missing or invalid session is 401.
- **Rate limit:** 3 tries per 10 s per IP on sign-in and sign-up. Over the limit: 429 `RATE_LIMITED` with a `Retry-After` header (seconds to wait).
- **Caching:** every response, errors included, carries `Cache-Control: no-store`, so per-user data and tokens never stay in browser, proxy or CDN caches.
- **Cookie routes under `/api`:** routes registered in `protected-api.ts` need a valid session and, for unsafe methods, a trusted `Origin`.

### Projects

**Status: Built (GW-018).**

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/projects` | none | 200 `{ projects: Project[] }`, sorted by name (byte order: `A`, `B`, `a`, `b`) | 401 |
| POST | `/api/projects` | `{ name }` | 201 `Project` | 400, 401, 403, 409 |
| GET | `/api/projects/:projectId` | none | 200 `Project` | 401, 404 |
| PATCH | `/api/projects/:projectId` | `{ name }` | 200 `Project` | 400, 401, 403, 404, 409 |
| DELETE | `/api/projects/:projectId` | none | 204 | 401, 403, 404 |

```ts
Project = { id: string, name: string, createdAt: string, updatedAt: string }  // dates: ISO 8601, UTC
```

- **Body:** strict. Unknown keys (`ownerId`, `id`, ...) are a 400, so a client can't set fields it shouldn't. The owner is always the logged-in user.
- **Name:** trimmed, normalized to Unicode NFC, 1 to 100 characters (code points). No control characters (NUL, newlines, tabs) and no bidi override or isolate characters; ZWJ emoji and Persian ZWNJ are fine. Case-sensitive: `Prod` and `prod` can both exist.
- **409** `CONFLICT`: "A project with this name already exists" (names are unique per user), or "Project limit reached (100)". The limit is exact, also under parallel requests (see [ADR 0013](../decisions/0013-atomic-limits.md)).
- **404** `NOT_FOUND` "Project not found": someone else's project, a missing one and an ID that isn't a UUID all answer the same. The check runs before the body is read, so a wrong body on someone else's project is still 404.
- **403:** a POST, PATCH or DELETE without a trusted `Origin`.
- **DELETE** removes the project and, by cascade, its provider key and all its gateway keys (revoked ones too). Request logs keep their copied IDs.
- **`:projectId`** may be written in upper case; the response always carries the lowercase `id`.
- A path parameter over 100 characters is 414 "URL too long" before any other check.

### Provider key

**Status: Built (GW-019).**

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/projects/:projectId/provider-key` | none | 200 `ProviderKey` | 401, 404 (project, or no key set) |
| PUT | `/api/projects/:projectId/provider-key` | `{ provider, key }` | 200 `ProviderKey` (set or replace) | 400, 401, 403, 404 |
| DELETE | `/api/projects/:projectId/provider-key` | none | 204 | 401, 403, 404 (project, or no key set) |

```ts
ProviderKey = { provider: "openai", lastFour: string, createdAt: string, updatedAt: string }
```

- **One key per project.** A second PUT replaces it in place (same row, same `createdAt`; the encrypted bytes and `lastFour` change).
- **Never returned in full:** the API returns only the provider and the last 4 characters (`lastFour`, taken when the key is saved). It stores the key encrypted (AES-256-GCM, bound to the project ID) and never decrypts it.
- **Body:** strict. `provider` is one of the supported providers (today only `openai`). `key` is trimmed (the trimmed value is what is stored), then must be 20 to 512 characters, must not contain control characters (a key travels in an HTTP header, which can't carry them), and must not start with `gw_live_` (that is one of our own gateway keys, a common paste mistake; the message says so). The minimum of 20 keeps `lastFour` from showing most of a short key. Spaces inside the key are accepted. There is **no provider-specific format check**: formats change and differ per provider. A real check against the provider on save is a separate task (GW-036).
- **404** `NOT_FOUND`: "Project not found" (someone else's project or a missing one), or "No provider key set" (GET and DELETE on a project with no key).
- Error bodies never contain the submitted key.

### Gateway keys

**Status: Built (GW-020).**

| Method | Path | Body | Success | Errors |
|---|---|---|---|---|
| GET | `/api/projects/:projectId/gateway-keys` | none | 200 `{ gatewayKeys: GatewayKey[] }`, newest first, revoked included | 401, 404 |
| POST | `/api/projects/:projectId/gateway-keys` | `{ name }` | 201 `{ key, gatewayKey }` | 400, 401, 403, 404, 409 |
| DELETE | `/api/projects/:projectId/gateway-keys/:keyId` | none | 204, also when already revoked | 400 (`keyId` not a UUID), 401, 403, 404 |

```ts
GatewayKey = { id, name, keyPrefix: "gw_live_a1b2", createdAt, revokedAt: string | null }
IssueGatewayKeyResponse = { key: "gw_live_<64 hex>", gatewayKey: GatewayKey }
```

- **Shown once:** the full `key` appears only in the 201 response. Only its SHA-256 hash and a 12-character display prefix are stored; a lost key is replaced, never recovered.
- **Revoke** keeps the row and sets `revokedAt`; repeating it changes nothing (the first time is kept). The key is found through its project, so a key id under another project is 404.
- **Name:** the same rule as project names.
- **409** `CONFLICT` "Active gateway key limit reached (20)": exact, counted under a lock; revoked keys don't count.
