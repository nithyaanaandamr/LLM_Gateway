# Sprint 02

- **Dates:** 2026-10-23 to 2026-11-21
- **Goal:** Phase 1 data and admin core: a user can sign up, add a provider key and get a gateway key (via API)

## Scope

| ID | Task | Status |
|---|---|---|
| GW-012 | Data model spec | Done |
| GW-013 | DB package: Drizzle + Testcontainers | Done |
| GW-014 | App schema and migrations | Done |
| GW-015 | Crypto and key helpers in `shared` | Done |
| GW-016 | Admin API skeleton | Done |
| GW-017 | Dashboard auth (Better Auth) | Done |
| GW-018 | Projects API | Done |
| GW-019 | Provider key API | Done |
| GW-020 | Gateway key API | Done |
| GW-021 | Phase 1 E2E test | Done |
| GW-040 | Close Sprint 02, start Sprint 03 | Done |

Status is `Open` or `Done`. The board bot sets `Done` after merge.

## Open topics

| Topic | State | Link |
|---|---|---|
| Phase 1 task list | Decided | [board.md](../board.md) |
| One provider key per project | Decided | [board.md](../board.md): GW-019 |
| Config from env vars; secret store at deploy | Decided | [board.md](../board.md): GW-016 |
| CI required; bot PRs need workflow approval | Decided | [PITFALLS.md](../../../PITFALLS.md): Board bot |
| Data model and its 7 open questions | Decided | [data-model.md](../../architecture/data-model.md): GW-012 |
| Project ownership: owner now, teams later | Decided | [ADR 0011](../../decisions/0011-project-ownership.md): GW-012 |
| Logs schema and its 7 open questions | Decided | [data-model.md](../../architecture/data-model.md): GW-012 |
| Auth tables: minimal Better Auth config comes in with the schema | Decided | [board.md](../board.md): GW-014, GW-017 |
| Packages and apps compile to dist (tsc -b) | Decided | [ADR 0012](../../decisions/0012-packages-compile-to-dist.md): GW-013 |
| Board bot sync failed when PRs merged while its PR was open | Decided | [PITFALLS.md](../../../PITFALLS.md): Board bot (GW-026) |
| Auth tables use timestamp without time zone (Better Auth generator) | Decided | [PITFALLS.md](../../../PITFALLS.md): Better Auth tables have no time zone |
| Auth error shape: translate Better Auth errors | Decided | [admin-api README](../../../apps/admin-api/README.md#errors): GW-017 |
| Auth endpoints: expose only the four we use | Decided | [api.md](../../architecture/api.md#admin-api): GW-017 |
| Duplicate sign-up returns 409 (email enumeration accepted) | Decided | [security.md](../../architecture/security.md#dashboard-sessions): GW-017 |
| Login rate limit: built-in, in memory, all environments | Decided | [PITFALLS.md](../../../PITFALLS.md): Auth rate limit needs the real client IP |
| CSRF on our cookie routes: Origin check on unsafe methods | Decided | [PITFALLS.md](../../../PITFALLS.md): Better Auth's origin check covers only its own routes |
| DASHBOARD_ORIGIN must be https unless local | Decided | [admin-api README](../../../apps/admin-api/README.md#config): GW-017 |
| Session tokens stored in plain text: accepted for v1, protected before first deployment | Decided | [board.md](../board.md): GW-043 |
| Database queries live in `packages/db/src/repositories/`; admin-api never imports Drizzle at runtime | Decided | [packages/db README](../../../packages/db/README.md#repositories): GW-018 (decision 1A) |
| Gateway key revoke path: `DELETE /api/projects/:projectId/gateway-keys/:keyId`, inside the project scope | Decided | [api.md](../../architecture/api.md#gateway-keys): GW-020 (decision 2A) |
| Limits are exact: counted and inserted under a Postgres advisory lock (100 projects per user, 20 active gateway keys per project) | Decided | [PITFALLS.md](../../../PITFALLS.md): Limits are counted under a lock (decision 3, revised) |
| Provider key accepted with a light check: trim, 20 to 512 characters, no `gw_live_` prefix, no control characters, no provider format check (minimum 20 added 2026-11-21 so `lastFour` can't show most of a key; control characters refused 2026-11-21, owner confirmed: a NUL gave a 500, and a header can't carry them) | Decided | [api.md](../../architecture/api.md#provider-key): GW-019, GW-036 (decision 4, variant) |
| Phase 1 end-to-end test runs the real server process over HTTP | Decided | [board.md](../board.md): GW-021 (decision 5A) |
| Repository writes check access too (defence in depth) | Decided | [security.md](../../architecture/security.md#authorization): GW-018 |
| Audit log of admin actions is post-v1, built with budget alert emails (same events) | Decided | [roadmap.md](../roadmap.md): Later (post-v1) |
| Post-deploy smoke test against the live URL | Decided | [board.md](../board.md): GW-038 |
| Project delete stays permanent in v1; a 30-day restore window comes later | Decided | [board.md](../board.md): GW-039 |
| Keep the blocking lock; GW-034 (rate limit admin writes) ships before first deployment | Decided | [PITFALLS.md](../../../PITFALLS.md): Lock waits share the database pool |
| Every limit is one atomic check-and-count | Decided | [ADR 0013](../../decisions/0013-atomic-limits.md): GW-018 |
| Not your project answers 404, not 403 | Decided | [security.md](../../architecture/security.md#authorization) |
| Project scope checks access before the body is read | Decided | [PITFALLS.md](../../../PITFALLS.md): Project scope runs before the body is read |
| One MASTER_KEY, version fixed at 1, rotation later | Decided | [board.md](../board.md): GW-035 |
| Project names: NFC, no control or bidi characters; list sorted by bytes | Decided | [PITFALLS.md](../../../PITFALLS.md): Names refuse control and bidi characters |

States and rules: [README.md](../README.md#open-topics).

## Retro

- **Went well:**
  - Phase 1's goal is met and proven by a test: a real server process runs sign up → project → provider key → gateway key, then the gateway's read path (GW-021).
  - Safety checks cover new code automatically: the route inventory and project ownership tests check every route, and real-process tests prove secrets stay out of the logs.
  - Owner decisions were written down (brief, Open topics, ADR 0013) before code, so work paused across sessions resumed cleanly.
  - QA's deliberate breaks (mutation checks) found real gaps before merge, e.g. a NUL in a provider key gave a 500 (GW-019).
- **To improve:**
  - A QA round with no time limit took about 95 minutes; the owner thought work was stuck.
  - The first GW-017 brief was kept in a scratchpad and was lost.
  - Several owner decisions came after the GW-018–021 brief was written (exact caps, provider key rule, minimum length). It grew past 750 lines, and later "build notes" overrode earlier sections.
  - A Junior ran Prettier from a package folder, where the root `.prettierignore` doesn't apply, and reformatted unrelated README tables (caught before QA).
- **Action:**
  - QA gets a 15–30 minute budget and a short checklist; start a fresh agent once its context grows large.
  - Briefs are kept in a durable folder, never a scratchpad.
  - One brief per task, written after the owner's decisions; a later decision edits the section it changes instead of adding an override block.
  - Run Prettier only from the repo root (PITFALLS.md: Prettier reads .prettierignore from the current folder); GW-042 makes Markdown safe from any folder.
