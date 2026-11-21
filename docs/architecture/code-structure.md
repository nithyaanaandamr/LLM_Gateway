# Code structure

How the code is split into layers, who may import whom, and where new code goes. Read this before adding code. Decision record: [ADR 0014](../decisions/0014-code-layers-and-boundary-lint.md). Task: GW-041.

## 1. Purpose and terms

The rules are simple: each file has one job, and it may only use the layers below it. This page writes them down so a newcomer (or an agent) does not have to guess.

- **Layer:** a group of files with one job, which may only use layers below it.
- **Boundary:** the line between two layers, or between two packages.
- **Import cycle:** file A imports B, and B (directly or through others) imports A.
- **Entry point (`exports`):** the paths a package lets others import (`@gw/db`, `@gw/db/testing`). Node and TypeScript refuse any other path.
- **Runtime code:** code that runs in production: `src/` minus `*.test.ts`, `*.fixture.ts` and `src/testing/`.
- **Repository:** a plain function in `@gw/db` that runs one query or one transaction.
- **Service:** a function in an app that combines a repository with something else (for example crypto).

## 2. Repo map

Who imports whom today (workspace packages only):

```
apps/admin-api ──► @gw/auth ──► @gw/db ──► (drizzle-orm, pg)
      │                          ▲
      ├──────────────────────────┘   main entry; tests also use @gw/db/testing
      └──► @gw/shared/crypto              (node:crypto)

apps/gateway, apps/worker, apps/dashboard   empty: src/index.ts is `export {}`
tools/board-bot, tools/fake-provider        no workspace imports (fake-provider is empty)
@gw/shared main entry                        empty `export {}` (packages/shared/src/index.ts:2)
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

Package entry points today:

| Package | `exports` | What the main entry gives |
|---|---|---|
| `@gw/db` | `.`, `./testing` | `createDb`, `Database` type, `runMigrations`, `readDatabaseUrl`, `isUniqueViolation`, the repository functions, all app and auth tables, and a `schema` namespace (packages/db/src/index.ts:1-9). Not exported: `logs.ts` (schema/index.ts:1), `lockForLimit` and `accessibleProjects` (internal files). |
| `@gw/auth` | `.` | `createAuth`, `tableOptions`, `CLIENT_IP_HEADER`, `fromNodeHeaders`, types (packages/auth/src/index.ts). Imports only the `Database` type from `@gw/db`; no HTTP code. |
| `@gw/shared` | `.`, `./crypto` | Main: nothing yet. `./crypto`: master key, provider key encrypt/decrypt, gateway key helpers. |

No app imports another app, and no package imports an app. `tsc -b` refuses circular project references, so a package-to-package cycle already fails the build.

## 3. Inside a backend app

`admin-api` is the model; the gateway and worker reuse it (the worker has job handlers instead of HTTP).

```
 Startup        main.ts, app.ts, config.ts      reads env once, builds db/auth/keys
    │ passes dependencies as plugin options
    ▼
 HTTP           scopes → hooks → routes (+ schemas, helpers, errors)
    │ function calls                 (worker: job handlers instead of HTTP)
    ├──────────► Service  <verb>-<noun>.ts   combines repository + another package
    ▼                │
 Repository     @gw/db functions (never Drizzle in the app)
    ▼
 Schema         @gw/db tables (internal to repositories, migrations, tests)
```

| Layer | Job | May import | Must not import | Talks to neighbours by |
|---|---|---|---|---|
| Startup | read config once, build dependencies, register plugins, shut down | everything in its app; `@gw/*` main entries | testing helpers | passes `db`, `auth`, `masterKey` as plugin options (app.ts:31-42) |
| HTTP: scopes, hooks | access checks for a group of routes | HTTP helpers, repositories, `@gw/auth` | services of other features | throw `AppError`; set `request.project` / `request.auth` |
| HTTP: routes, schemas | parse input (Zod), call a repository or service, shape the response | own feature's schemas and service, HTTP helpers, repositories, `@gw/shared` | `drizzle-orm`, tables, `process.env`, another app | call functions; throw `AppError` with a safe message |
| Service | logic that spans packages (crypto + store) | repositories, `@gw/shared` (+crypto), own feature's schemas file, `errors.ts` | `fastify`, request/reply objects, `drizzle-orm` | plain arguments in, plain value out; may throw `AppError` |
| Repository (`@gw/db`) | one query or one transaction | schema, `drizzle-orm`, `pg` | apps, crypto | returns rows, `undefined`/`false`, or a result union; throws on unexpected DB errors |
| Schema (`@gw/db`) | table definitions | `drizzle-orm` | repositories, apps | n/a |

How `admin-api` files map to layers:

| Files | Layer |
|---|---|
| `main.ts`, `app.ts`, `config.ts`, `logger.ts`, `shutdown.ts` | Startup |
| `protected-api.ts`, `projects/project-scoped-api.ts`, `projects/project-scope.ts` | HTTP: scopes |
| `auth/require-session.ts`, `auth/require-trusted-origin.ts`, `projects/require-project.ts` | HTTP: hooks |
| `*/*-routes.ts`, `routes/health.ts`, `routes/me.ts` | HTTP: routes |
| `*/*-schemas.ts` | HTTP: schemas (Zod shapes, `toXResponse` mappers, limits) |
| `auth/get-auth-user.ts`, `projects/get-project.ts`, `projects/project-not-found.ts`, `projects/name-conflict.ts` | HTTP: helpers |
| `errors.ts`, `error-handler.ts`, `log-error.ts` | HTTP: errors |
| `auth/create-app-auth.ts`, `auth/auth-routes.ts`, `auth/to-web-request.ts`, `auth/send-web-response.ts`, `auth/auth-error.ts`, `auth/trusted-origins.ts` | HTTP: bridge to Better Auth |
| `gateway-keys/issue-gateway-key.ts`, `provider-keys/store-provider-key.ts` | Service |

## 4. How errors cross layers

1. Package code throws its own named errors (`InvalidMasterKeyError`); the app maps them where it calls (config.ts:73).
2. Repositories return expected outcomes as values, never exceptions (`{ status: "limit_reached" }`, `false` for "nothing deleted"; gateway-keys.ts:72-73). A Postgres error is thrown as is; the app asks `@gw/db` what it is (`isProjectNameTaken(error)`) and never reads Postgres codes itself.
3. Services and routes throw `AppError(status, code, message)`; the message must be safe to show (issue-gateway-key.ts:26-31). Services may throw `AppError` because they serve only this app's HTTP layer. A worker service would throw its own errors.
4. Anything else becomes a 500. The error handler logs it through `errorForLog`, which drops SQL and params (error-handler.ts:13, log-error.ts:1-3; see PITFALLS.md: Database errors carry query params).

## 5. Dependencies and config

- Dependencies are passed in, never imported as singletons. `app.ts:31-42` builds `db`, `auth` and `masterKey` once and passes them as plugin options; each route plugin declares what it needs (`GatewayKeyRoutesOptions { db }`, gateway-key-routes.ts:14-16).
- Config is read once: `loadConfig(process.env)` runs only in `main.ts:8` (and in the test fixture). No other admin-api runtime file reads `process.env`.
- Repositories never encrypt; services do (packages/db/README.md, store-provider-key.ts:20-26).

## 6. Route, service, repository

> A route may call a `@gw/db` repository function directly. Add a service file (`<verb>-<noun>.ts` in the feature folder) when the work (1) uses another package besides `@gw/db` (crypto, Redis, the queue), or (2) needs more than one repository call. Turning one repository result or error into an `AppError` (404, 409) stays in the route file. A service never touches the request or reply.

Check against today's code:

| Code | Why it is where it is |
|---|---|
| `issueGatewayKey` (service) | uses crypto |
| `storeProviderKey` (service) | encrypts |
| `createProjectFor` (private function in project-collection-routes.ts:24-32) | one repository call plus 409 mapping, so it stays in the route file |
| list, revoke, rename, delete | direct repository calls |

## 7. Planned apps

- **Gateway** (hot path): key lookup, limit checks, forwarding, streaming. Everything else goes to the queue (CLAUDE.md). It never imports `@gw/auth` (it has no sessions) and, like all apps, no `drizzle-orm`. Its README says it "does not write to Postgres directly"; that cannot be linted while `@gw/db` has one entry point. Phase 2 may add a narrow read-only export; until then it is a review rule.
- **Worker** (cold path): consumes jobs and writes logs through the LogStore. No HTTP, so no `fastify`.
- **Dashboard**: React UI. It talks to admin-api over HTTP and imports only the browser-safe `@gw/shared` main entry.
- **Queue contract** (job names and payload types, gateway to worker): lives in a package, decided in Phase 2.

## 8. Tests and test helpers

- Tests sit next to the file they test (`x.test.ts`). Tests that cover the whole app (route inventory, ownership) sit at `src/` root; end-to-end tests in `src/e2e/`.
- Tests may import anything in their app, `@gw/db` tables, `drizzle-orm`, testing helpers and `tools/fake-provider`. They never import another app's source. Tests never call real providers.
- Test helpers are `apps/<app>/src/testing/*.ts` and `@gw/db/testing`. Only tests import them. Each `admin-api` helper starts with a "Test-only" comment, and none is imported by runtime code (checked by grep).
- `tsconfig.build.json` excludes `src/testing`, but TypeScript still compiles any file that runtime code imports, so the exclude does not block a bad import. Lint does (GW-042).
- Guardrail tests that already exist: `route-inventory.test.ts` (every route needs a session unless allow-listed), `project-ownership.test.ts`, and `owner-access-rule.test.ts` (only two files name `owner_id`).

## 9. Naming and file placement

- One feature folder per resource: `projects/`, `gateway-keys/`, `provider-keys/`. Inside: `<feature>-routes.ts`, `<feature>-schemas.ts`, services as `<verb>-<noun>.ts` (`issue-gateway-key.ts`), hooks as `require-<thing>.ts`, request readers as `get-<thing>.ts`.
- Repository functions are named after their table (`listGatewayKeys`), as packages/db/README.md says.
- Imports use explicit `.ts` paths and no path aliases (the lint rules match import text; see section 11).

## 10. Where does new code go?

| New code | Goes in | Why |
|---|---|---|
| A new admin route | `apps/admin-api/src/<feature>/<feature>-routes.ts`, registered in the right scope | scopes give login and project checks for free |
| A new query | a function in `packages/db/src/repositories/<table>.ts`, exported from `@gw/db` | apps never build queries |
| A query that must check a cap | repository function with lock, count and insert; returns a result union (ADR 0013) | exact limits |
| Logic mixing DB and crypto (or 2+ repository calls) | a service file in the feature folder | section 6 |
| A new crypto helper | `packages/shared/src/crypto/`, re-exported from `crypto/index.ts` | Node-only subpath (see PITFALLS.md: Node-only code in shared) |
| A type the dashboard and admin-api both use (for example `ErrorBody`) | `packages/shared/src/` main entry, types or browser-safe values only | the dashboard can import it |
| A helper two backend apps need | the package that owns the topic; move it only when the second user exists | no stubs |
| A gateway-only helper | `apps/gateway/src/` | apps do not share through each other |
| A new test helper | `apps/<app>/src/testing/` (one app) or `packages/db/src/testing/` (DB harness) | test-only, lint-checked |
| A new table | `packages/db/src/schema/`, then `pnpm db:generate` | migrations live with the schema |

GW-024 under this model: `ErrorBody` and `ErrorCode` are the admin-api and dashboard contract, so they move to the `@gw/shared` main entry. `AppError`, `toErrorResponse` and `CODE_BY_STATUS` stay in admin-api (they are HTTP code).

## 11. Rules and enforcement

The "Enforced by" column names what checks the rule today, or the task that adds the check.

| # | Rule | Enforced by |
|---|---|---|
| R1 | Apps never import other apps | GW-042 lint (`no-restricted-imports`, `import-x/no-relative-packages`); words only until then |
| R2 | Packages never import apps or tools | GW-042 lint |
| R3 | Package direction: shared, then db, then auth | `tsc -b` rejects reference cycles; GW-042 lint for the direction |
| R4 | Import a package only through its `exports` | `exports` (Node and TypeScript refuse other paths) |
| R5 | No `drizzle-orm` or `pg` in app runtime code | GW-042 lint; true today |
| R6 | No queries on `db` in app runtime code | GW-045: apps get an opaque `Database` handle with no query methods, so `db.select(...)` is a TypeScript error (decision 3D, ADR 0014) |
| R7 | `testing/` helpers and `@gw/db/testing` only in tests | GW-042 lint |
| R8 | `@gw/shared` main entry stays browser-safe | GW-042 lint (`node:*` and `crypto` banned in shared main and in the dashboard) |
| R9 | No import cycles (runtime imports only) | GW-042 lint (`import-x/no-cycle`) |
| R10 | Gateway never imports `@gw/auth`; worker never imports `fastify` | GW-042 lint |
| R11 | Only startup reads `process.env` | GW-042 lint (`main.ts` allowed); true today in admin-api runtime code |
| R12 | Log tables only through the LogStore | `exports` (`logs.ts` is not exported) |
| R13 | Route, service, repository rule (section 6) | review |
| R14 | Hot path does only lookup, limits, forward, stream | review; the gateway README states it |
| R15 | Markdown is never reformatted | GW-042 (Prettier config); see PITFALLS.md: Prettier skips Markdown |

### How apps get the database (decision 3D)

Today `Database` is the full Drizzle client, so a route could write `db.select().from(...)` with no import at all. GW-045 fixes this in the type system: `@gw/db` hands apps an opaque `Database` handle with no query methods. Repository functions unwrap it inside `@gw/db`. Tests unwrap it through `@gw/db/testing` (R7 bans that in runtime code). `@gw/auth` gets the real client through an export that lint bans in apps. Until GW-045 lands, R6 is only a rule in words.

## 12. Known exceptions

Small inconsistencies we decided to leave (decision 5A). The convention above is the rule; these are the named exceptions.

- `routes/health.ts` and `routes/me.ts` sit in a `routes/` folder without the `-routes` suffix.
- `gateway-key-logs.test.ts` and `provider-key-logs.test.ts` sit at `src/` root, though they test one feature.
- Limits live in a schemas file (`MAX_ACTIVE_GATEWAY_KEYS`, gateway-key-schemas.ts:7) and a service imports them from there. `storeProviderKey` takes a Zod-inferred body type (store-provider-key.ts:3-4, :18).
- `packages/db` has one import cycle, type-only: `insert-project.ts:4` imports the `Project` type from `projects.ts`, which imports `insert-project.ts` (projects.ts:4, :8). It is erased at runtime, and rule R9 counts runtime imports only.
- `readDatabaseUrl` in `packages/db/src/config.ts` defaults to `process.env`, and test helpers read it too. Neither is app startup code; R11 covers app runtime files only.
- Only the helpers in `apps/admin-api/src/testing/` carry a "Test-only" comment; most files in `packages/db/src/testing/` do not.
