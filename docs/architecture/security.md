# Security

## Bring Your Own Key (BYOK)

- Users paste their own provider key. No money passes through us.
- Provider keys are encrypted at rest with **AES-GCM**. Stored as `nonce + ciphertext + tag`.
- The master key lives in a secret store (later KMS with envelope encryption), never in code or the DB.

## Gateway keys

- Format: `gw_live_<random>` (32 random bytes).
- Shown **once** at creation. Only the SHA-256 hash is stored.
- Revocable. Revocation must also clear the Redis key cache.

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
- **Secret rotation:** changing `BETTER_AUTH_SECRET` logs everyone out.
- **Known limits (v1):** session tokens are stored unhashed (see PITFALLS.md: Session tokens in plain text); a duplicate sign-up returns 409, which reveals that an email has an account.

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
