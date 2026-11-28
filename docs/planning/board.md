# Board

Source of truth for all work. Workflow: [README.md](README.md).

## In progress

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-041 | Code structure spec | 1.5 | `docs/architecture/code-structure.md` names each layer (HTTP routes and hooks, services, repositories, schema, shared packages, test helpers), what each may import, and how layers talk (calls, errors, dependencies passed in); says when a route may call a repository without a service; covers every app, package and tool, including the planned gateway and worker; an ADR records the layering and the lint tool; owner approved; each app, package and tool README states its layer, what it may import and what it must not; CLAUDE.md links the doc |

## Ready

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-042 | Enforce code boundaries in ESLint | 1.5 | Every rule in `code-structure.md` (GW-041) marked GW-042 is checked by `pnpm lint` in CI, including: apps never import other apps; `testing/` helpers and `@gw/db/testing` only in tests; no `drizzle-orm` or `pg` in app runtime code; `shared`'s main entry stays browser-safe; no import cycles; only entry-point files (`main.ts`, `*-cli.ts`) read `process.env`. One deliberately bad import per rule fails lint (tested); existing code passes or is fixed; a test checks every `PITFALLS.md: <heading>` pointer names a real heading; Prettier can't reformat Markdown from any folder |
| GW-045 | Opaque database handle for apps | 1.5 | `@gw/db` gives apps a `Database` type with no query methods, so `db.select(...)` or `db.query…` in app code is a TypeScript error; repository functions unwrap it inside `@gw/db`; tests unwrap it through `@gw/db/testing`; `@gw/auth` gets the real client through an export that lint bans in apps (GW-042); a type test proves app code can't query; no behaviour change; all tests pass |
| GW-024 | Move error shape types to `shared` | 1 | `ErrorBody` and `ErrorCode` (types only) live in `packages/shared`; admin-api imports them; usable by the dashboard |

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-007 | Fake provider server | 2 | Streaming + non-streaming; configurable delay, error, disconnect |
| GW-009 | Research Redis failure handling | 2 | Findings recorded in a new ADR superseding 0008 |
| GW-027 | Readiness route `GET /ready` | 1 | 200 when a DB query succeeds, 503 in our error shape when not; `routes/health-routes.ts` comment updated (it promises this "with the first DB-backed task") |
| GW-028 | Admin API behind a proxy: trust proxy setting | 1 | `ADMIN_API_TRUST_PROXY` config; `request.ip` is the real client IP behind Cloudflare Tunnel / ALB; a test shows two clients get separate auth rate-limit buckets |
| GW-029 | Shared auth rate-limit store (Redis) | 1 | Limits hold across two admin-api instances and a restart; uses Better Auth `secondaryStorage` or `customStorage` on our Redis |
| GW-030 | Password reset and email verification | 1 | Needs an email sender (dev: log or fake inbox); reset link expires; reset revokes other sessions; tests cover token reuse and expiry |
| GW-031 | Dashboard and admin API cookie setup | 1 | Dev: Vite proxies `/api` to admin-api; browser sign-in sets the cookie and `/api/me` works; production topology documented; no CORS unless chosen in an ADR |
| GW-032 | Sign-out reports failure when the session can't be deleted | 1 | With the DB down, sign-out returns 5xx in our error shape (or retries); the response never claims success while the session row survives; a test covers it |
| GW-033 | Clear the gateway key cache on revoke and project delete | 2 | Revoke and project delete remove the key's Redis cache entries in the same request; a test shows the gateway rejects a key right after revoke; behaviour when Redis is down follows the ADR 0008 successor |
| GW-034 | Rate limit admin API writes per user | 1 | **Required before first deployment** (a burst of creates from one user holds pooled connections while it waits for the cap lock, see PITFALLS.md: Lock waits share the database pool). POST/PUT/PATCH/DELETE under `/api/projects` limited per user (e.g. 60/min); over the limit: 429 `RATE_LIMITED` with `Retry-After`; a test covers it |
| GW-035 | Master key rotation | 2 | Config takes a current key plus older versioned keys; a command re-encrypts every provider key to the current version; the gateway decrypts both during rotation; runbook in the README |
| GW-036 | Check the provider key with the provider on save | 2 | PUT tests the key against the provider's models endpoint (fake provider in tests); a rejected key: 400 with a clear message; a provider timeout doesn't lose the save; never logs the key |
| GW-037 | Database pool size setting and pooler plan for deployment | 1 | `DATABASE_POOL_MAX` config (default 10, validated at startup) used by `createDb`; README gives the formula (app instances × pool size + other apps ≤ Postgres `max_connections`, with headroom); pool wait timeout (`connectionTimeoutMillis`) decided; PgBouncer (transaction mode) or the cloud equivalent chosen once ADR 0009's host is picked; confirm advisory *transaction* locks work under it |
| GW-038 | Post-deploy smoke test | 6 | A script runs the Phase 1 flow against a live URL over HTTPS, taking the API URL and the trusted origin as inputs: sign in a dedicated test account (credentials from the secret store, not a new sign-up each run) → create a project → set a provider key → issue, list and revoke a gateway key → delete the project; exits non-zero and names the failed step; cleans up even when a step fails; never prints the password, session token or full keys; runs after every deploy and by hand; the provider-key step still works once GW-036 checks keys with the provider; runbook in the README |
| GW-039 | Restore a deleted project within 30 days | 4 | `DELETE /api/projects/:projectId` sets `deleted_at` instead of removing the row, and revokes all the project's gateway keys at once (clearing their cache, GW-033); a deleted project is missing from the list and its routes answer 404, like "not yours"; `POST /api/projects/:projectId/restore` by the owner within 30 days brings back the project and its settings, never its gateway keys (the owner issues new ones), and the ownership test covers this route; after 30 days restore answers 404 and a daily worker job hard-deletes the project with today's cascade; a deleted project doesn't hold its name or count toward the 100-project cap, so restore takes the cap lock (ADR 0013) and answers 409 if the name is taken or the cap is full; whether the provider key is kept for the 30 days or deleted at once is decided and written in security.md; request logs keep pointing at the same project ID; data-model decision 4 and api.md updated |
| GW-043 | Protect session tokens at rest | 1 | **Required before first deployment.** Reading the database no longer gives usable sessions: the stored session token is a hash (or Better Auth's equivalent; find how it supports this); a test shows a stored value can't be used as a cookie; what happens to existing sessions is decided; PITFALLS "Session tokens in plain text" updated |
| GW-046 | Test that workspace dependencies match tsconfig references | 2 | A test fails when a `package.json` workspace dependency (`@gw/*`) has no matching `references` entry in that package's `tsconfig.build.json`, or the reverse (see PITFALLS.md: Workspace dependency needs a tsconfig reference); runs in CI |

## Done

| ID | Task | Phase | Completed |
|---|---|---|---|
| GW-001 | Repo skeleton and docs | 0 | 2026-10-22 |
| GW-002 | Decide ADRs 0002–0009 | 0 | 2026-10-22 |
| GW-008 | Protect `main`: repo made public, branch protection applied | 0 | 2026-10-21 |
| GW-003 | Install toolchain (Node 24, pnpm 12, OrbStack) | 0 | 2026-10-22 |
| GW-004 | Root tooling: TypeScript, ESLint, Prettier, Vitest | 0 | 2026-10-22 |
| GW-005 | Local infra running | 0 | 2026-10-22 |
| GW-011 | Board sync bot and review label gate | 0 | 2026-10-22 |
| GW-006 | CI workflow | 0 | 2026-10-22 |
| GW-010 | Finalise roadmap and Phase 1 tasks | 0 | 2026-10-22 |
| GW-022 | Close Sprint 01, start Sprint 02 | 0 | 2026-10-22 |
| GW-012 | Data model spec | 1 | 2026-10-31 |
| GW-013 | DB package: Drizzle + Testcontainers | 1 | 2026-10-31 |
| GW-015 | Crypto and key helpers in `shared` | 1 | 2026-10-31 |
| GW-016 | Admin API skeleton | 1 | 2026-10-31 |
| GW-026 | Board bot rebuilds its branch instead of merging main | 0 | 2026-10-31 |
| GW-014 | App schema and migrations | 1 | 2026-11-20 |
| GW-017 | Dashboard auth (Better Auth) | 1 | 2026-11-21 |
| GW-018 | Projects API | 1 | 2026-11-21 |
| GW-020 | Gateway key API | 1 | 2026-11-21 |
| GW-019 | Provider key API | 1 | 2026-11-21 |
| GW-021 | Phase 1 E2E test | 1 | 2026-11-21 |
| GW-040 | Close Sprint 02, start Sprint 03 | 1 | 2026-11-21 |
| GW-023 | Source maps in `start` and `dev` | 1 | 2026-11-28 |
| GW-025 | Fix board-bot PITFALLS reference | 0 | 2026-11-28 |
| GW-044 | Fix the flaky long-URL error test | 1.5 | 2026-11-28 |
