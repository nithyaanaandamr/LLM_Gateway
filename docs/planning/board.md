# Board

Source of truth for all work. Workflow: [README.md](README.md).

## In progress

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## Ready

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-021 | Phase 1 E2E test | 1 | Test: sign up → create project → add provider key → get gateway key |
| GW-007 | Fake provider server | 2 | Streaming + non-streaming; configurable delay, error, disconnect |
| GW-009 | Research Redis failure handling | 2 | Findings recorded in a new ADR superseding 0008 |
| GW-023 | Source maps in `start` and `dev` | 1 | Apps run Node with `--enable-source-maps`; a 5xx stack trace in the logs points at `.ts` lines; ADR 0012 recipe updated |
| GW-024 | Move error shape types to `shared` | 1 | `ErrorBody` and `ErrorCode` (types only) live in `packages/shared`; admin-api imports them; usable by the dashboard |
| GW-025 | Fix board-bot PITFALLS reference | 0 | `tools/board-bot/tsconfig.json` comment cites the real heading "Node runs TypeScript directly" |
| GW-027 | Readiness route `GET /ready` | 1 | 200 when a DB query succeeds, 503 in our error shape when not; `routes/health.ts` comment updated (it promises this "with the first DB-backed task") |
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
