# Code structure

How the code is split into layers, who may import whom, and where new code goes. Read this before adding code. Decision record: [ADR 0014](../decisions/0014-code-layers-and-boundary-lint.md). Task: GW-041.

## 1. Purpose and terms

The rules are simple: each file has one job, and it may only use the layers below it. This page writes them down so a newcomer (or an agent) does not have to guess. Code is cited by file and symbol name, never by line number, because line numbers drift.

- **Layer:** a group of files with one job, which may only use layers below it.
- **Boundary:** the line between two layers, or between two packages.
- **Import cycle:** file A imports B, and B (directly or through others) imports A.
- **Entry point (`exports`):** the paths a package lets others import (`@gw/db`, `@gw/db/testing`). Node and TypeScript refuse any other path.
- **Runtime code:** code that runs in production: `src/` minus `*.test.ts`, `*.fixture.ts` and `src/testing/`.
- **Repository:** a plain function in `@gw/db` that runs one query or one transaction.
- **Service:** a function in an app that uses another package besides `@gw/db`, or needs 2+ repository calls (for example crypto plus a store).
- **Scope:** a Fastify plugin scope: a group of routes that share hooks. A hook added in a scope covers only the routes registered inside it.
- **Plugin options:** the object passed as `app.register(plugin, options)`; this is how `db`, `auth` and `masterKey` reach routes.
- **Result union:** a return type that lists every expected outcome, such as `{ status: "limit_reached" }` or a created row.
- **LogStore:** the planned `@gw/db` module that is the only way to read and write request logs (ADR 0007).
- **Hot path:** the code that runs on every gateway request; any slowness here reaches every user.

## 2. Repo map

Who imports whom today (workspace packages only):

```
apps/admin-api ──► @gw/auth ──► @gw/db ──► (drizzle-orm, pg)
      │                          ▲
      ├──────────────────────────┘   main entry; tests also use @gw/db/testing
      └──► @gw/shared/crypto              (node:crypto)

apps/gateway, apps/worker, apps/dashboard   empty: src/index.ts is `export {}`
tools/board-bot, tools/fake-provider,
tools/repo-checks                           no workspace imports (fake-provider is empty)
@gw/shared main entry                        empty `export {}` (`packages/shared/src/index.ts`)
```

Target direction, including the planned apps (arrow means "may import"):

```
 apps/admin-api ──► @gw/auth, @gw/db, @gw/shared, @gw/shared/crypto
 apps/gateway   ──►           @gw/db, @gw/shared, @gw/shared/crypto  (+ queue package, Phase 2)
 apps/worker    ──►           @gw/db, @gw/shared                     (+ queue package, Phase 2)
 apps/dashboard ──►                   @gw/shared (main entry only)
 packages:  @gw/auth ──► @gw/db ──► @gw/shared
 tools/*:   stand alone; tests may import tools/fake-provider
 never: app → app, package → app, package → tool, runtime code → testing helpers
```

| Unit | Job | May import | Must not import |
|---|---|---|---|
| `@gw/shared` main | browser-safe types and pure helpers (API contracts, error body types) | nothing in the workspace; no Node built-ins | `./crypto`, `node:*`, any `@gw/*` |
| `@gw/shared/crypto` | Node-only crypto helpers | `node:crypto`, shared main | any `@gw/*` package |
| `@gw/db` | schema, migrations, client, repositories; later the LogStore (ADR 0007) | `drizzle-orm`, `pg`, `@gw/shared` (nothing yet) | `@gw/auth`, apps, HTTP frameworks |
| `@gw/auth` | Better Auth config, no HTTP | `@gw/db`, `better-auth`, `drizzle-orm` | apps, `fastify` |
| `apps/admin-api` | dashboard backend | `@gw/auth`, `@gw/db`, `@gw/shared` (+crypto) | other apps, `drizzle-orm`/`pg` at runtime, testing helpers at runtime |
| `apps/gateway` (planned) | hot path: key lookup, limits, forward, stream | `@gw/db` (read functions), `@gw/shared` (+crypto), Redis/queue client | `@gw/auth` (no sessions), other apps, `drizzle-orm` |
| `apps/worker` (planned) | jobs: log writes, rollups | `@gw/db` (LogStore, repositories), `@gw/shared`, queue client | other apps, `@gw/auth`, `fastify` (no HTTP endpoint) |
| `apps/dashboard` (planned) | React UI; talks to admin-api over HTTP only | `@gw/shared` main | `@gw/db`, `@gw/auth`, `@gw/shared/crypto`, `node:*`, other apps |
| `tools/board-bot` | CI board sync | Node only | any `@gw/*` |
| `tools/fake-provider` (planned) | fake LLM API for tests | Node only | any `@gw/*` |
| `tools/repo-checks` | guardrail tests: boundary lint cases, `PITFALLS.md` pointers | Node, `eslint`, `vitest` | any `@gw/*` |

Package entry points today:

| Package | `exports` | What the main entry gives |
|---|---|---|
| `@gw/db` | `.`, `./drizzle`, `./testing` | `createDb`, `Database` type, `runMigrations`, `readDatabaseUrl`, `isUniqueViolation`, the repository functions, all app and auth tables, and a `schema` namespace (`packages/db/src/index.ts`). Not exported: `logs.ts` (`schema/index.ts` leaves it out), `lockForLimit` and `accessibleProjects` (internal files). |
| `@gw/auth` | `.` | `createAuth`, `tableOptions`, `CLIENT_IP_HEADER`, `fromNodeHeaders`, types (packages/auth/src/index.ts). Imports the `Database` type from `@gw/db` and `toDrizzle` from `@gw/db/drizzle`; no HTTP code. |
| `@gw/shared` | `.`, `./crypto` | Main: nothing yet. `./crypto`: master key, provider key encrypt/decrypt, gateway key helpers. |

No app imports another app, and no package imports an app. `tsc -b` refuses circular project references, so a package-to-package cycle already fails the build.

## 3. Inside a backend app

`admin-api` is the model; the gateway and worker reuse it (the worker has job handlers instead of HTTP).

```
 Startup        main.ts, app.ts, config.ts      reads env once, builds db/auth, parses keys
    │ passes dependencies as plugin options
    ▼
 HTTP           scopes → hooks → routes (+ schemas, helpers, errors)
    │ function calls                 (worker: job handlers instead of HTTP)
    ├──────────► Service  <verb>-<noun>.ts   another package, or 2+ repo calls
    ▼                │
 Repository     @gw/db functions (never Drizzle in the app)
    ▼
 Schema         @gw/db tables (internal to repositories, migrations, tests)
```

| Layer | Job | May import | Must not import | Talks to neighbours by |
|---|---|---|---|---|
| Startup | read config once, build dependencies, register plugins, shut down | everything in its app; `@gw/*` main entries | testing helpers | passes `db`, `auth`, `masterKey` as plugin options (`app.ts` `buildApp`) |
| HTTP: scopes, hooks | access checks for a group of routes | HTTP helpers, repositories, `@gw/auth` | services of other features | throw `AppError`; set `request.project` / `request.auth` |
| HTTP: routes, schemas | parse input (Zod), call a repository or service, shape the response | own feature's schemas, limits and service, HTTP helpers, repositories, `@gw/shared` | `drizzle-orm`, tables, `process.env`, another app | call functions; throw `AppError` with a safe message |
| Service | logic that uses another package besides `@gw/db`, or needs 2+ repository calls | repositories, `@gw/shared` (+crypto), own feature's limits file, `errors.ts` | `fastify`, request/reply objects, `drizzle-orm`, schemas files (Zod types) | plain arguments in, plain value out; may throw `AppError` |
| Repository (`@gw/db`) | one query or one transaction | schema, `drizzle-orm`, `pg` | apps, crypto | returns rows, `undefined`/`false`, or a result union; throws on unexpected DB errors |
| Schema (`@gw/db`) | table definitions | `drizzle-orm` | repositories, apps | n/a |

How `admin-api` files map to layers:

| Files | Layer |
|---|---|
| `main.ts`, `app.ts`, `config.ts`, `logger.ts`, `shutdown.ts` | Startup |
| `protected-api.ts`, `projects/project-scoped-api.ts`, `projects/project-scope.ts` | HTTP: scopes |
| `auth/require-session.ts`, `auth/require-trusted-origin.ts`, `projects/require-project.ts` | HTTP: hooks |
| `*/*-routes.ts` (except `auth/auth-routes.ts`, listed under the bridge), `routes/health-routes.ts`, `routes/me-routes.ts` | HTTP: routes |
| `*/*-schemas.ts` | HTTP: schemas (Zod shapes, `toXResponse` mappers, input bounds such as `MAX_KEY_LENGTH`) |
| `*/*-limits.ts` | Count caps (plain constants: how many things a user may have); routes and services import them |
| `auth/get-auth-user.ts`, `projects/get-project.ts`, `projects/project-not-found.ts`, `projects/name-conflict.ts` | HTTP: helpers |
| `errors.ts`, `error-handler.ts`, `log-error.ts` | HTTP: errors |
| `auth/create-app-auth.ts`, `auth/auth-routes.ts`, `auth/to-web-request.ts`, `auth/send-web-response.ts`, `auth/auth-error.ts`, `auth/trusted-origins.ts` | HTTP: bridge to Better Auth |
| `gateway-keys/issue-gateway-key.ts`, `provider-keys/store-provider-key.ts` | Service |

## 4. How errors cross layers

1. Package code throws its own named errors (`InvalidMasterKeyError`); the app maps them where it calls (`config.ts` `masterKeySchema`).
2. Repositories return expected outcomes as values, never exceptions (`{ status: "limit_reached" }`, `false` for "nothing revoked"; `insertGatewayKeyWithinLimit` and `revokeGatewayKey` in `repositories/gateway-keys.ts`). A Postgres error is thrown as is; the app asks `@gw/db` what it is (`isProjectNameTaken(error)`) and never reads Postgres codes itself.
3. Services and routes throw `AppError(status, code, message)`; the message must be safe to show (`issue-gateway-key.ts` `issueGatewayKey`). Services may throw `AppError` because they serve only this app's HTTP layer. A worker service would throw its own errors.
4. Anything else becomes a 500. The error handler logs it through `errorForLog`, which drops SQL and params (`error-handler.ts` `errorHandler`, `log-error.ts` `errorForLog`; see PITFALLS.md: Database errors carry query params).

## 5. Dependencies and config

- Dependencies are passed in, never imported as singletons. `app.ts` `buildApp` builds `db` and `auth` once; `config.ts` parses `masterKey` and `app.ts` passes all three on as plugin options; each route plugin declares what it needs (`GatewayKeyRoutesOptions { db }` in `gateway-key-routes.ts`).
- Config is read once: `loadConfig(process.env)` runs only in `main.ts` `readConfigOrExit` (and in the test fixture). No other admin-api runtime file reads `process.env`.
- Repositories never encrypt; services do (packages/db/README.md; `store-provider-key.ts` `storeProviderKey`).

## 6. Route, service, repository

> A route may call a `@gw/db` repository function directly. Add a service file (`<verb>-<noun>.ts` in the feature folder) when the work uses another package besides `@gw/db`, or needs 2+ repository calls (crypto, Redis, the queue). Turning one repository result or error into an `AppError` (404, 409) stays in the route file. A service never touches the request or reply.

Check against today's code:

| Code | Why it is where it is |
|---|---|
| `issueGatewayKey` (service) | uses crypto |
| `storeProviderKey` (service) | encrypts |
| `createProjectFor` (private function in `project-collection-routes.ts`) | one repository call plus 409 mapping, so it stays in the route file |
| list, revoke, rename, delete | direct repository calls |

## 7. Planned apps

- **Gateway** (hot path): key lookup, limit checks, forwarding, streaming. Everything else goes to the queue (CLAUDE.md). It never imports `@gw/auth` (it has no sessions) and, like all apps, no `drizzle-orm`. Its README says it "does not write to Postgres directly"; that cannot be linted while `@gw/db` has one entry point. Phase 2 may add a narrow read-only export; until then it is a review rule.
- **Worker** (cold path): consumes jobs and writes logs through the LogStore. No HTTP, so no `fastify`.
- **Dashboard**: React UI. It talks to admin-api over HTTP and imports only the browser-safe `@gw/shared` main entry.
- **Queue contract** (job names and payload types, gateway to worker): lives in a package, decided in Phase 2.

## 8. Tests and test helpers

- Tests sit next to the file they test (`x.test.ts`); a test of one feature sits in that feature's folder. Tests that cover the whole app (route inventory, ownership) sit at `src/` root; end-to-end tests in `src/e2e/`.
- Tests may import anything in their app, `@gw/db` tables, `drizzle-orm`, testing helpers and `tools/fake-provider`. They never import another app's source or `@gw/db/drizzle`. Tests never call real providers.
- Test helpers are `apps/<app>/src/testing/*.ts` and `@gw/db/testing`. Only tests and test config (`vitest.global-setup.ts` in admin-api and auth, which import `@gw/db/testing`) import them. Each helper file starts with a "Test-only" comment, and none is imported by runtime code (checked by grep).
- `tsconfig.build.json` excludes `src/testing`, but TypeScript still compiles any file that runtime code imports, so the exclude does not block a bad import. Lint does (`no-restricted-imports`).
- Guardrail tests that already exist: `route-inventory.test.ts` (every route needs a session unless allow-listed), `project-ownership.test.ts`, and `owner-access-rule.test.ts` (only two files name `owner_id`).

## 9. Naming and file placement

- One feature folder per resource: `projects/`, `gateway-keys/`, `provider-keys/`. Inside: `<feature>-routes.ts`, `<feature>-schemas.ts`, count caps (a number of things a user may have, such as `MAX_PROJECTS_PER_USER`) as `<feature>-limits.ts` (plain constants a service and a route can both import); input bounds on a body (such as `MAX_KEY_LENGTH`) stay in `<feature>-schemas.ts`, services as `<verb>-<noun>.ts` (`issue-gateway-key.ts`), hooks as `require-<thing>.ts`, request readers as `get-<thing>.ts`.
- Repository functions are named after their table (`listGatewayKeys`), as packages/db/README.md says.
- Imports use explicit `.ts` paths and no path aliases (the lint rules match import text; see section 11).

## 10. Where does new code go?

| New code | Goes in | Why |
|---|---|---|
| A new admin route | `apps/admin-api/src/<feature>/<feature>-routes.ts`, registered in the right scope: needs only a session, in `protected-api.ts`; needs a project the user can access (path has `:projectId`), in `projects/project-scoped-api.ts`; public, in `app.ts` like `routes/health-routes.ts` | scopes give login and project checks for free |
| A new query | a function in `packages/db/src/repositories/<table>.ts`; a new repository file also needs an `export *` line in `packages/db/src/index.ts` | apps never build queries |
| A query that must check a cap | repository function with lock, count and insert; returns a result union (ADR 0013) | exact limits |
| Logic that uses another package besides `@gw/db`, or needs 2+ repository calls | a service file in the feature folder | section 6 |
| A new crypto helper | `packages/shared/src/crypto/`, re-exported from `crypto/index.ts` | Node-only subpath (see PITFALLS.md: Node-only code in shared) |
| A type the dashboard and admin-api both use (for example `ErrorBody`) | `packages/shared/src/` main entry, types or browser-safe values only | the dashboard can import it |
| A helper two backend apps need | the package that owns the topic; move it only when the second user exists | no stubs |
| A gateway-only helper | `apps/gateway/src/` | apps do not share through each other |
| A new test helper | `apps/<app>/src/testing/` (one app) or `packages/db/src/testing/` (DB harness; add an `export` line to its `testing/index.ts`) | test-only; lint-checked (`no-restricted-imports`) |
| A new table | `packages/db/src/schema/`, then `pnpm db:generate` | migrations live with the schema |

GW-024 under this model: `ErrorBody` and `ErrorCode` are the admin-api and dashboard contract, so they move to the `@gw/shared` main entry. `AppError`, `toErrorResponse` and `CODE_BY_STATUS` stay in admin-api (they are HTTP code).

## 11. Rules and enforcement

The "Enforced by" column names what checks the rule today, or the task that adds the check. Every "must not import" and "Does not" statement in this page and the READMEs has a row here; "review" means no tool checks it.

| # | Rule | Enforced by |
|---|---|---|
| R1 | Apps never import other apps | ESLint `no-restricted-imports`, `import-x/no-relative-packages`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R2 | Packages never import apps or tools | ESLint `no-restricted-imports` (packages block); tested in `tools/repo-checks/src/boundaries.test.ts` |
| R3 | Package direction: shared, then db, then auth; `@gw/shared` imports no `@gw/*` | `tsc -b` rejects reference cycles; ESLint `no-restricted-imports` for the direction; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R4 | Import a package only through its `exports` | `exports` (Node and TypeScript refuse other paths) |
| R5 | No `drizzle-orm` or `pg` in app runtime code | ESLint `no-restricted-imports`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R6 | No queries on `db` in app runtime code | TypeScript (GW-045): apps get an opaque `Database` handle (a value you can pass around but not query), so `db.select(...)` is a compile error; `database-handle.test.ts` pins it (decision 3D, ADR 0014) |
| R7 | `testing/` helpers and `@gw/db/testing` only in tests and test config (`vitest.global-setup.ts`) | ESLint `no-restricted-imports` (test files and config are exempt); tested in `tools/repo-checks/src/boundaries.test.ts` |
| R8 | `@gw/shared` main entry stays browser-safe; the dashboard imports only `@gw/shared` main (never `@gw/db`, `@gw/auth`, `@gw/shared/crypto` or `node:*`) | ESLint `no-restricted-imports`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R9 | No import cycles (runtime imports only) | ESLint `import-x/no-cycle`; tested on `tools/repo-checks/fixtures/cycle` |
| R10 | Gateway and worker never import `@gw/auth`; worker never imports `fastify` | ESLint `no-restricted-imports`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R11 | Only entry-point files read `process.env`: `src/main.ts` and `src/*-cli.ts` files (today `apps/admin-api/src/main.ts`, `packages/db/src/migrate-cli.ts`, `tools/board-bot/src/main.ts`). Every other runtime file takes `env` as an argument (tests, fixtures and test helpers may read it) | ESLint `no-restricted-properties` (`src/main.ts` and `src/*-cli.ts` exempt); tested in `tools/repo-checks/src/boundaries.test.ts`. The rule matches `process.env` and `const { env } = process`, not `import { env } from "node:process"`, aliasing (`const p = process`) or `globalThis.process.env` (review only); see PITFALLS.md: Config readers take env as an argument |
| R12 | Log tables only through the LogStore | `packages/db/src/index.ts` does not re-export `logs.ts` |
| R13 | Route, service, repository rule (section 6) | review |
| R14 | Hot path does only lookup, limits, forward, stream; the gateway never writes Postgres directly, computes rollups or sends emails | review; the gateway README states it (see section 7) |
| R15 | Markdown is never reformatted | `.prettierrc.json` override (`requirePragma` for `*.md`); see PITFALLS.md: Prettier skips Markdown |
| R16 | `@gw/auth` and `@gw/db` never import HTTP frameworks (`fastify`) | ESLint `no-restricted-imports`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R17 | Tools never import any `@gw/*` | ESLint `no-restricted-imports`; tested in `tools/repo-checks/src/boundaries.test.ts` |
| R18 | Repositories never import crypto (`@gw/shared/crypto`, `node:crypto`) | ESLint `no-restricted-imports` (path `packages/db/src/repositories/**`); tested in `tools/repo-checks/src/boundaries.test.ts` |
| R19 | Schema never imports repositories | ESLint `no-restricted-imports` (path `packages/db/src/schema/**`); tested in `tools/repo-checks/src/boundaries.test.ts` |
| R20 | App runtime code never imports tables or the `schema` namespace from `@gw/db` (types such as `Project` are fine) | review; a table import is useless anyway, since apps have no query client (GW-045) |
| R21 | Services never import `fastify` or touch request/reply; scopes and hooks never import another feature's service | review (lint cannot tell a service from a route by file path) |

### Other guardrails (decision 6A)

| # | Guardrail | Status |
|---|---|---|
| G1 | A test checks every `PITFALLS.md: <heading>` pointer names a real heading | `tools/repo-checks/src/pitfalls-pointers.test.ts` |
| G2 | Prettier cannot reformat Markdown from any folder | `.prettierrc.json` override (R15) |
| G3 | Each README states its layer, what it may import and what it must not | done in GW-041 |
| G4 | `CLAUDE.md` links this page | done in GW-041 |
| G5 | `process.env` is read only in entry-point files (`main.ts`, `*-cli.ts`) | ESLint `no-restricted-properties` (R11) |
| G6 | A test checks each workspace dependency in a `package.json` has a matching `tsconfig.build.json` reference | Phase 2, GW-046 |

Tests that already exist: `route-inventory.test.ts`, `project-ownership.test.ts`, `owner-access-rule.test.ts` (section 8).

### How apps get the database (decision 3D)

A route could once write `db.select().from(...)` with no import at all, because `Database` was the full Drizzle client. GW-045 fixed this in the type system: `@gw/db` hands apps an opaque `Database` handle with no query methods. Repository functions unwrap it inside `@gw/db`. Tests unwrap it through `@gw/db/testing` (R7 bans that in runtime code). `@gw/auth` gets the real client through `@gw/db/drizzle`, an export that GW-042 lint bans in apps.

The type blocks `db.select(...)` on the handle. Until GW-042 merges, nothing blocks an app file from importing `toDrizzle` from `@gw/db/drizzle` or `@gw/db/testing` and querying; review catches it. (Delete this paragraph when GW-042 merges.)
