# Security

## Bring Your Own Key (BYOK)

- Users paste their own provider key. No money passes through us.
- Provider keys are encrypted at rest with **AES-GCM**. Stored as `nonce + ciphertext + tag`.
- The master key lives in a secret store (later KMS with envelope encryption), never in code or the DB.
- `MASTER_KEY` is checked at startup (exact 32-byte base64 format); a bad key stops the process instead of failing a user's request later.
- AAD (additional authenticated data) = the project ID: a ciphertext copied into another project's row won't decrypt.
- The admin API returns only `lastFour` and never decrypts: it stores the last 4 characters when the key is saved and selects only summary columns.

## Gateway keys

- Format: `gw_live_<random>` (32 random bytes).
- Shown **once** at creation. Only the SHA-256 hash is stored.
- Revocable. Revocation must also clear the Redis key cache.
- Revoke is `DELETE /api/projects/:projectId/gateway-keys/:keyId`, inside the project scope. It finds the key through its project (`id` and `project_id`), so a key ID under another project is a 404. It keeps the row, sets `revoked_at`, and is idempotent (204 again, first time kept).
- The list shows the 12-character prefix only. The full key is in the one 201 response (`no-store`), never stored, logged or returned again.

## Two kinds of auth

| Surface | Credential | Never accepts |
|---|---|---|
| Gateway | Gateway key (Bearer) | Session cookies |
| Admin API | Session cookie | Gateway keys |

## Dashboard sessions

How the dashboard stays logged in (Better Auth, [ADR 0005](../decisions/0005-dashboard-auth.md)). Terms: a **session** is a row in `auth.sessions` saying "this random token belongs to user X until time T". The **session cookie** is what the browser sends back on every request.

**The cookie**
- Name `better-auth.session_token` (`__Secure-` prefix on https). Value `<token>.<signature>`. The signature is an HMAC of the token made with `BETTER_AUTH_SECRET`, so a changed token is detected.
- Flags: `HttpOnly` (page JavaScript can't read it, so XSS can't steal it), `SameSite=Lax` (not sent on cross-site `fetch` or form posts), `Path=/`, 7-day `Max-Age`, `Secure` on https.
- The signature only proves we issued the cookie. Every request also checks the database row.

```
 Browser                     admin-api (Fastify)                    Postgres
 POST /api/auth/sign-in/email
 {email, password}  ───────▶ Zod checks the body, then Better Auth:
                              origin check, rate limit,
                              scrypt hash check ───────────────────▶ auth.accounts
                              new session ─────────────────────────▶ auth.sessions
 ◀── 200 + Set-Cookie (HttpOnly, SameSite=Lax)

 GET /api/me
 Cookie: …          ───────▶ protected scope:
                              1 requireTrustedOrigin (unsafe methods)
                              2 requireSession: check signature, ─▶ find token, check expiry
                                copy any Set-Cookie
 ◀── 200 {id, email, name}    or 401 in our error shape
```

**What each step does**
- **Sign up:** the email is lower-cased, the password hashed with scrypt (random salt), a user and a credential row are created, then a session. The user is logged in at once.
- **Log in:** the hash is checked; every login makes a **new** token, so an attacker can't plant a token before login. Wrong password and unknown email give the same 401, and an unknown email still hashes once, so timing doesn't reveal accounts.
- **Each request:** a bad signature, a missing row or an expired session all mean 401.
- **Sliding expiry:** a session lasts 7 days; once it is over 1 day old, the next request extends it and sends a fresh cookie. An active user stays in; 7 idle days log out.
- **Log out:** the row is deleted and the cookie cleared. The old cookie keeps a valid signature but its row is gone, so it stops working. The cookie cache is off for this reason.
- **CSRF** (another site making the browser send our cookie): `SameSite=Lax`, plus an `Origin` check. Better Auth does it on `/api/auth/*`; `requireTrustedOrigin` does it for POST, PUT, PATCH and DELETE in the protected scope. We send no CORS headers.
- **Rate limit:** 3 tries per 10 s per IP on sign-in and sign-up, in memory per process, keyed on the real connection IP.
- **Caching:** every response carries `Cache-Control: no-store`, so user data and tokens stay out of browser, proxy and CDN caches.
- **Secret rotation:** changing `BETTER_AUTH_SECRET` logs everyone out.
- **Known limits (v1):** session tokens are stored unhashed (see PITFALLS.md: Session tokens in plain text); a duplicate sign-up returns 409, which reveals that an email has an account.

## Authorization

**Terms.** *Authentication* answers "who are you?" (the session cookie, see above). *Authorization* answers "may you touch this thing?". Here "this thing" is always a project, or something inside one. An **IDOR** (insecure direct object reference) is changing an ID in the URL to reach someone else's data; it is the main bug class this section prevents.

Every request passes up to four checks. Each has a test that covers every route automatically.

```
 request ──▶ 1 trusted Origin? (unsafe methods)   ─┐ protected scope
            2 valid session cookie?   else 401    ─┘ test: route-inventory.test.ts
            3 project accessible?     else 404    ── project scope
                                                     test: project-ownership.test.ts
            4 child row in THIS project? else 404 ── query includes project_id
 handler ◀──                                         test: per route
```

**The project scope.** Every route under `/api/projects/:projectId` is registered inside one plugin (`projectScopedApi`). Its `onRequest` hook looks the project up once, for the logged-in user, before the body is read. If the user can't access it, the answer is 404; otherwise the project is attached to the request and handlers read it with `getProject(request)`. A route registered in the scope without `:projectId` in its path stops `app.ready()` with an error, so a misplaced route can't ship.

**One access condition.** `accessibleProjects(userId)` (`packages/db/src/repositories/project-access.ts`) is the only code that reads `owner_id` to decide access ([ADR 0011](../decisions/0011-project-ownership.md)). It is a SQL condition, so one query both checks access and loads the row, with nothing to change between check and use. When teams arrive, only this condition changes. A test fails if any other file in `packages/db/src` or `apps/admin-api/src` names the owner column.

**404, not 403.** 403 says "it exists, but it isn't yours", which tells an attacker which IDs are real (an *existence oracle*). With 404, "someone else's project" and "no such project" look identical: same status, code and message, and the same single query. The owner never sees this 404. `project-ownership.test.ts` calls every `:projectId` route as another user and expects the same answer as for a random UUID, with the owner's data unchanged afterwards.

**Child rows are found through their project.** A key, for example, is looked up with its own ID **and** `project.id` (`WHERE id = :keyId AND project_id = :project.id`). Without the project part, a user could act on another user's key by putting that key's ID under their own project. Handlers use `getProject(request).id` from the database, never the URL's value.

**Defence in depth.** The scope is the primary check, but the repository writes `renameProject` and `deleteProject` also apply the access condition themselves. They are the only functions that touch a project by its bare ID, so a handler that skipped the scope still can't change someone else's project.

**Also checked:** request bodies are strict (unknown keys such as `ownerId` are a 400, which blocks *mass assignment*); caps (100 projects per user) are exact under parallel requests ([ADR 0013](../decisions/0013-atomic-limits.md)); a malformed ID never reaches the database, so it can't cause a Postgres error. See PITFALLS.md: Not your project is 404, not 403; Project scope runs before the body is read.

## Log safety

- Fastify does not log bodies; `authorization`, `cookie` and `set-cookie` are redacted.
- A database error is logged as its type and code only (`DrizzleQueryError`, `ECONNREFUSED`), never the query or its params, which hold emails and session tokens. See PITFALLS.md: Database errors carry query params.
- A real-process test checks stdout and stderr for passwords, tokens, cookies and the secret.

## Privacy

- Default logs are metadata only: tokens, cost, latency, model, status.
- Prompt and response logging is opt-in per project.

## Abuse protection

Rate limits, input length limits, budget caps, keys kept server-side only.

## Before going public

Read each provider's usage policy.
