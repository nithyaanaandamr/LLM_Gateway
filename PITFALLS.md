# Pitfalls

Deeper notes on gotchas, edge cases and trade-offs. Code comments point here (e.g. `// see PITFALLS.md: budget cap race`).
Add new entries; don't rewrite old ones.

---

## Budget cap race

**Problem:** the real cost of a request is known only after the response. If a key is at 99% of its cap, 5 parallel requests can each pass the check and overshoot it.

**Mitigation (see [ADR 0006](docs/decisions/0006-budget-cap-enforcement.md)):**
- Reserve the estimated max cost before forwarding; reconcile with the real cost after.
- Past a soft threshold (~80%), cap in-flight requests per key.
- Worst-case overshoot = in-flight limit × max cost per request.

## Partial usage on client disconnect

If a client drops mid-stream, the provider may still bill the tokens generated so far. Log partial usage anyway, or spend reports will undercount.

## Redis failure mode

Redis holds rate limits, budget counters and the key cache. When it is down, the gateway must either:
- **fail closed:** reject requests (safe for budgets, bad for uptime), or
- **fail open:** allow requests (good for uptime, budgets can overshoot).

Choice is configurable (`REDIS_FAILURE_MODE`). Open research: see [ADR 0008](docs/decisions/0008-redis-failure-mode.md).

## BullMQ needs `maxmemory-policy noeviction`

If Redis evicts keys under memory pressure, BullMQ can silently lose jobs. Local compose sets `noeviction`; managed Redis must be configured the same way.

## BullMQ on per-command-priced Redis

BullMQ sends many Redis commands even when idle. On pay-per-command services (e.g. Upstash), this can cost more than a small fixed-price instance.

## Gateway keys use a fast hash, not bcrypt

Gateway keys are 32 random bytes, so they can't be guessed. A fast hash (SHA-256) is safe here. bcrypt/argon2 are deliberately slow and built for weak human passwords; using them would add latency to every request. Dashboard **passwords** still use a slow hash: Better Auth's default, scrypt (an earlier note said argon2; corrected 2026-10-23).

## AES-GCM nonce reuse

Never reuse a nonce with the same key. Reuse breaks both secrecy and tamper protection. Generate a fresh random 12-byte nonce per encryption and store it next to the ciphertext.

## Cost accuracy

- Take token counts from the provider response, not from our own estimates.
- Prices change: keep a dated `model_pricing` table and use the price valid at request time.
- Store input and output cost separately (they are priced differently).

## Visual tests need a fixed environment

Screenshots differ between macOS and Linux (fonts, anti-aliasing). Generate and compare baselines inside the same Docker image locally and in CI, or tests fail for no real reason.

## Automated a11y checks are partial

axe and Lighthouse catch only part of WCAG issues. Keyboard-only and screen reader (VoiceOver) checks stay manual. Charts need a text summary and a table alternative.

## AWS idle cost

Load balancer, NAT gateway, managed DB and Redis bill hourly whether used or not. A full setup left running can cost $50–100+/month. Use infra-as-code to tear it down between demos, and set a billing alert first.

## App Runner and background workers

App Runner is built for HTTP services. The worker has no HTTP endpoint, so it fits ECS Fargate better.

## Branch protection on private repos

GitHub Free does not support branch protection or rulesets on private repos. Options: GitHub Pro, a public repo, or a local hook that blocks pushes to `main` (soft guard only).

## Corepack leaves Node after v24

Node 24 ships corepack; Node 25+ does not. When moving past Node 24, install it first (`npm i -g corepack`, then `corepack enable`), or `pnpm` stops being found.

## OrbStack socket

Without admin privileges, OrbStack doesn't create `/var/run/docker.sock`. The `docker` CLI still works, but Testcontainers looks there by default and can't find Docker. Setup step in the README.

## OrbStack licence

Free for personal, non-commercial use. Commercial use needs a paid licence. Fine for this project; check again if that changes.

## TypeScript pinned to 6.0

TypeScript 7 is out, but typescript-eslint supports only `<6.1` (as of 2026-10-22). Using TS 7 would break type-aware lint. Upgrade once typescript-eslint supports it.

TS 6 also stopped auto-loading `@types/*`. Node types are listed in `tsconfig.base.json` (`"types": ["node"]`); the dashboard sets its own.

## Type-aware lint

ESLint uses typescript-eslint's type-checked rules. They catch bugs plain lint misses, e.g. a promise that is never awaited (an error silently lost on the hot path). Cost: lint is slower, and every linted `.ts` file must belong to a package's `tsconfig.json`.

## jsx-a11y and ESLint 10

`eslint-plugin-jsx-a11y` (React accessibility rules) doesn't support ESLint 10 yet (as of 2026-10-22). It's needed only once the dashboard has JSX. When scaffolding the dashboard: check support, or fall back to ESLint 9.

## Prettier skips Markdown

Prettier pads Markdown tables, which rewrites every doc on each edit. Docs are hand-formatted; `.prettierignore` excludes `*.md`.

## Node runs TypeScript directly

Node 24 strips types and runs `.ts` files with no build step (used by `tools/board-bot`). Limits: imports need the `.ts` extension, and only "erasable" syntax works (no `enum`, no `namespace`, no constructor parameter properties). `erasableSyntaxOnly` in the package's tsconfig makes `tsc` flag these.

## Board bot

- **Bot PRs wait for approval.** When the built-in token opens or updates a PR, GitHub creates its workflow runs but holds them as `action_required` (prevents loops). Click "Approve workflows to run" on the PR, and its checks (CI, `review-label`) run. Seen on PR #4. If that click becomes a chore, a GitHub App token for the bot removes it.
- **Your merge of the sync PR does trigger workflows.** The bot skips PRs from `bot/` branches, or it would loop.
- **Rapid merges.** Runs queue one at a time; GitHub keeps only the newest waiting run. If 3+ PRs merge within a minute, one sync can be cancelled. Re-run it from the Actions tab.
- **PR titles are untrusted input.** `rebuild-branch.sh` reads them with `gh` into quoted shell variables. Never put PR data in `${{ }}` inside `run:`, which would let a title run shell commands.
- **The bot rebuilds its branch every run.** Each run resets `bot/board-sync` to `main`, replays one commit per PR already on the sync PR (read from the `move to Done after #N` commit messages), then adds the new PR. It used to merge `main` in instead, which conflicted whenever a feature PR edited the board table next to a row the bot had moved: the syncs for #12 and #13 were lost (2026-10-31, fixed in GW-026). So: hand-made commits on `bot/board-sync` are dropped on the next run, and the commit message format must stay as it is.

## CI affected packages

- **Root changes run everything.** pnpm's `[ref]` filter only sees which package folders changed. A change to root config (`tsconfig.base.json`, `eslint.config.js`, the lockfile, a workflow) affects every package but belongs to none, so CI checks all packages then.
- **Root is excluded from the filter.** Docs changes belong to the root package, and root's `lint` script is `pnpm -r lint`, so matching root would quietly check everything.
- **Diff base is the merge commit's parent.** A PR run checks out GitHub's merge of the PR into `main`. Its first parent (`HEAD^1`) is `main`, so the diff is exactly the PR's changes.
- **Bot PRs need one click.** CI on a bot PR waits for approval (see Board bot). Approve it before merging.

## Sprint file tables

The board bot marks a row Done if its first cell is a task ID (`| GW-### |`), in any table of a sprint file. Only Scope rows may start with an ID. Open topics rows start with the topic name; put task IDs in the Link column.

## Cascades don't reach Redis

`ON DELETE CASCADE` removes a project's gateway keys from Postgres, but their entries in the Redis key cache stay. Until they expire, the gateway would still accept those keys. Every delete or revoke goes through app code that also clears the cache; never a bare SQL delete.

## Provider key bound to its project

Provider keys are encrypted with the row's `project_id` as AES-GCM additional data (AAD). AAD isn't secret and isn't stored in the ciphertext, but decryption fails if it doesn't match. So a ciphertext copied into another project's row (by a bug or an attacker with DB write access) can't be decrypted there.

## No foreign keys into the logs schema

`logs` tables copy `project_id` and `gateway_key_id` but have no foreign keys to `app`. The log store may move to a separate database (ADR 0007), where foreign keys can't follow. It also means deleting a project never blocks on, or slows down for, millions of log rows. Cost: a log row can point at a project that no longer exists; reports must handle a missing name.

## Log job retries

BullMQ delivers a job at least once, so a batch of log rows can arrive twice.
- `request_logs` has a primary key on `(request_id, started_at)`; inserts use `ON CONFLICT DO NOTHING`, so the copy is dropped.
- Rollups are rebuilt from raw rows for the hours a batch touched, never incremented (`count = count + n`). Adding would double-count on every retry.

## Percentiles don't add up

The p95 of two hours is not the average of their p95s. Rollups store sums (count, tokens, cost, total latency), which give totals and averages. p95 needs raw rows (or a histogram), so it comes from `request_logs` within retention.

## Daily totals depend on timezone

"Today's spend" starts at midnight local time. A UTC daily table is wrong for most viewers, so we keep hourly rollups and add hours up in the viewer's timezone. Half-hour offsets (Adelaide UTC+9:30, India UTC+5:30) still split one hour across two days; days there are off by up to 30 minutes at the edges. Exact fix if needed: 30-minute buckets.

## Provider error messages can contain prompts

Provider errors often quote the request ("This model's maximum context length is… your messages: …"). Logging the message would leak prompt content. Logs store only our own short `reason` code.

## Money in nano-dollars

Floats can't hold money exactly (0.1 + 0.2 ≠ 0.3). Integers can. Micro-dollars aren't small enough: a cheap model at $0.15 per million tokens costs 0.15 micro-dollars per token, so short requests would round to 0. Nano-dollars ($0.000000001) are exact for current prices. A `bigint` holds up to ~$9.2 billion in nano-dollars. In JS, values above 2^53 nano-dollars (~$9 million) lose precision as `number`; per-request values never get close, but large sums should be read as `bigint`.

## UUID v7 for request logs

App tables use random UUID v4: they're small, so where new rows land in the index doesn't matter. `request_logs` grows with every request. UUID v7 starts with a timestamp, so new IDs sort after old ones and inserts go to the end of the index instead of random pages. Postgres 17 has no built-in v7, so the gateway generates it.

## Drizzle can't declare partitioned tables

Drizzle's schema has no `PARTITION BY` (open request: drizzle-orm issue #6235, as of 2026-10-23). Partitioned tables need hand-written SQL migrations, and tools that read the live database (`drizzle-kit pull`/`push`) may mishandle partitions. Use `generate` + `migrate` only.

## pnpm blocks dependency build scripts

pnpm 12 fails `pnpm install` (`ERR_PNPM_IGNORED_BUILDS`) when a dependency has an install script nobody approved. List each one in `allowBuilds` in `pnpm-workspace.yaml`. We set all to `false`: fewer scripts run on install, and none are needed (drizzle-kit's esbuild works without its script). A new dependency with an install script must be added there.

## Migrations run once, by one process

Run `pnpm db:migrate` (or the same CLI) as one deploy step before apps start, never on every app start: several instances would migrate at once. As of drizzle-orm 0.45, the migrator takes no advisory lock (checked `pg-core/dialect.js`): it reads the last applied migration, then applies the rest in one transaction. Two runs at the same moment can both see the same state and both try to apply a migration. Also: never edit a merged migration; add a new one.

## pg pool idle errors

`pg.Pool` emits `error` when an idle connection dies (DB restart, network drop). With no listener, Node crashes the whole process. `createDb` logs the message; the pool drops the dead connection and opens a new one on next use.

## Database URL holds the password

Never put `DATABASE_URL` in error messages or logs. `readDatabaseUrl` reports what is wrong with the value, not the value.

## Testcontainers finds Docker

Lookup order: `DOCKER_HOST` env, `docker.host` in `~/.testcontainers.properties`, `/var/run/docker.sock`, `~/.docker/run/docker.sock`. OrbStack without admin privileges has none of the default sockets, so use the per-user properties file (README: Tests and Docker); it lives in the home folder, so no user path is committed. See also OrbStack socket. GitHub's ubuntu runners have `/var/run/docker.sock`, so CI needs nothing.

## Test database per file

One Postgres container per test run (~6 s), plus one database per test file cloned from a migrated template (~0.1 s). A container per file is too slow; one shared database makes parallel files race each other. Rules:

- The template must have no open connections while it is cloned, so `runMigrations` always closes its pool.
- Tests must `close()` their pool in `afterAll`, before teardown stops the container.

## Packages and apps compile to dist

Production, dev and spawned-process tests run `dist/`. Vitest runs the package's own source and other packages' `dist/`. Every script starts with `tsc -b tsconfig.build.json`, which rebuilds only what changed (dependencies first). Imports keep `.ts`; `rewriteRelativeImportExtensions` writes `.js` in the output. The editor shows other packages' types from `dist/*.d.ts`, which update after the next build or while `dev` runs (`declarationMap` makes "Go to definition" open the source). `tools/board-bot` is the exception (see Node runs TypeScript directly). ADR 0012.

## Stale dist

`tsc` never deletes files. A deleted or renamed source file leaves its old `.js` in `dist/` until you run `rm -rf packages/*/dist apps/*/dist`; CI and deploy build from a clean checkout, so they never see it. Build info lives in `dist/` so that deleting `dist/` forces a rebuild (verified: next to the tsconfig, it didn't). `start` never builds: run `build` first.

## Workspace dependency needs a tsconfig reference

When a package imports another workspace package, add it to `package.json` **and** to `references` in `tsconfig.build.json`. Without the reference, `tsc -b` doesn't build it first, and a fresh clone fails or sees old types.

## Type-only augmentations vanish from .d.ts

A file with only types and a `declare module` block (like `provided-context.ts`) is dropped from the `.d.ts` graph if nothing re-exports it. Other packages then lose the augmentation (`inject("testPostgres")` became `never`). Re-export a type from the entry file.

## CI builds everything first

The affected-packages filter includes dependents, not dependencies. `pnpm build` runs once up front, in dependency order, so two packages never build the same dependency at the same time and a build error shows as its own step.

## Migrations must keep the old version working

A deploy migrates first, then starts the new app (see Migrations run once, by one process). In between, the old version still serves users on the new structure, so every migration must work with both versions.

- **Safe in one deploy:** a new table; a new column that allows `NULL` or has a constant default.
- **Not safe in one deploy:** renaming or dropping a column or table; making a column `NOT NULL`; changing a column's type. The old code still uses the old shape and fails.
- **Do unsafe changes in two deploys ("expand, then contract"):** 1) add the new shape, copy existing data across, and make the code write both; 2) once no old code is running, remove the old shape.
- **Review rule:** for any PR with a migration, check each SQL statement against these lists.

## Master key parsing

`Buffer.from(x, "base64")` silently skips bad characters and accepts any length, so a typo'd key "works" but is the wrong key. We check the exact 44-char format and the 32-byte length, and wrap the bytes in a `KeyObject` so logging it prints nothing secret.

## AES-GCM short auth tags

Without `authTagLength: 16`, Node accepts a tag as short as 4 bytes (verified on Node 24.22), making forgery feasible. Always pass the option and reject stored tags that aren't 16 bytes.

## Project ID as AAD must be canonical

AAD is compared byte by byte, so an uppercase UUID won't decrypt a row encrypted with the lowercase one. Helpers require lowercase canonical UUIDs (what Postgres returns).

## Master key versions

Each row stores which master key encrypted it. Decrypt picks the key by that version. Rotation = load old + new, re-encrypt rows with new, then drop old. `UnknownMasterKeyVersionError` means config is missing a key, not that data is bad. A new master key also restarts the random-nonce budget (see AES-GCM nonce reuse).

## Changing MASTER_KEY makes stored provider keys unreadable

Every row keeps master key version 1. A new key with the same version fails to decrypt, so all stored provider keys stop working. Rotation needs versions and a re-encrypt step (Backlog GW-035).

## The admin API never reads a provider key back

It stores `lastFour` when the key is saved and selects only summary columns (provider, last four, dates). With no decrypt path in the admin API, there is nothing to leak through a bug, a log line or an error.

## We don't check provider key formats

Formats change and differ per provider, so a regex would eventually refuse a valid key. We only trim, bound the length to 20 to 512 characters (the minimum keeps `lastFour` from showing most of a short key) and refuse our own `gw_live_` keys (a common paste mistake). The real check is a test call to the provider on save (Backlog GW-036).

## Node-only code in shared

Crypto uses `node:crypto`, which browsers don't have. It is exported only via `@gw/shared/crypto`; the main `@gw/shared` entry (used by the dashboard) must never import it.

## Gateway key format

`gw_live_` + 64 lowercase hex (32 random bytes, 256 bits). Hex chosen for simplicity and double-click selection. Strict format check before hashing, so junk never reaches Redis or the DB and each key has exactly one hash.

## Hash lookup needs no constant-time compare

The attacker picks the key but can't steer its SHA-256 hash, so timing the DB lookup teaches them nothing about real keys. Constant-time compare (`timingSafeEqual`) matters only when comparing a secret directly to attacker input in JS.

## A gateway key is shown once

Only the 201 body of `POST /api/projects/:projectId/gateway-keys` holds the key (`Cache-Control: no-store`, and no code path logs it: Fastify doesn't log bodies). The database keeps the SHA-256 hash and the 12-character prefix, nothing else. A lost key is replaced by issuing a new one and revoking the old; it can never be recovered. The key is made in the service (`issue-gateway-key.ts`) before the transaction, so the repository never sees it, only its hash. Tests check the stored row, the list response and a real process's stdout and stderr for the key's 64-hex part.

## Find child rows through their project

The project scope proves the user may access the project in the URL. A key ID in the URL is separate input: revoke matches `id` **and** `project_id`. With `id` alone, a user could revoke any key in the system by putting its ID under their own project. The same rule holds for every future child row (usage, members): look it up through `getProject(request).id`, never by its own ID. The IDOR tests cover both another project of mine and another user's key.

## Revoke has no cache to clear yet

The gateway's Redis key cache arrives in Phase 2. Until then revoke only sets `revoked_at`, and project delete relies on the foreign-key cascade. When the cache exists, the revoke handler and the project delete handler are the single places that must also clear it, or a revoked key keeps working until its cache entry expires (Backlog GW-033; see Cascades don't reach Redis). Revoke also bumps `updated_at` when repeated (Drizzle sets it on every update); `revoked_at` keeps the first time, and `updated_at` is not returned by the API.

## Empty env vars count as missing

`.env` lines like `ADMIN_API_PORT=` give `""`, and `Number("")` is `0` (any free port). Config drops empty values before validating, so they report "is required".

## Config validates only what the code reads

We don't require future vars now: it forces fake values, and a var's rules belong with the code that uses it. Rule: a task that reads a new var adds it to the Zod schema, `.env.example` and the README in the same PR.

## .env is for local dev only

Only the `dev` script loads it (Node's `--env-file-if-exists`). App code never reads `.env`, so production can't pick one up by accident. Real env vars win over the file. That includes an empty one: `ADMIN_API_PORT=` set in the shell blocks the `.env` value, so dev reports "is required". Production values come from the platform / secret store.

## Error responses never leak internals

5xx bodies are always generic; the full error is logged with the same `requestId`. 4xx messages from Fastify are passed through (they describe the client's own request). `AppError` messages must be written to be client-safe. Exception: requests arriving during shutdown get Fastify's own 503 body (`return503OnClosing`), which skips our handler. Also not covered: errors Node rejects before Fastify sees the request (malformed HTTP, 431 headers too large) use Node's own response; a `clientErrorHandler` could wrap them later. Invalid URLs are covered (`frameworkErrors`).

## Log redaction

Fastify's default request log has no headers; `redact` is a backstop for code that logs `request.headers`. Add new sensitive header names (e.g. a future API-key header) to `REDACT_PATHS`.

## Custom error handler must log

Once `setErrorHandler` is used, Fastify no longer logs errors. Our handler logs 5xx itself (4xx already show in the "request completed" line).

## Graceful shutdown

On SIGTERM, `app.close()` stops new connections, finishes in-flight requests and runs `onClose` hooks (close DB/Redis there). `process.once`: a second signal kills at once. No own timeout: Docker (10 s) and ECS (30 s) SIGKILL after their grace period. Tests must send the signal once.

Keep-alive trap: a connection that was busy when SIGTERM arrived goes back to idle after its response, and `app.close()` only closes connections that were idle at that moment. Node then waits for Fastify's 72 s keep-alive timeout, past Docker's 10 s. Fix: after `preClose` we add `connection: close` to every response, so the socket ends with the response. Don't use `forceCloseConnections: true`: it cuts in-flight requests.

## Dev runs two watchers

`tsc -b -w` rebuilds the app and the packages it uses; `node --watch dist/main.js` restarts when `dist/` changes. `concurrently --kill-others` stops both on Ctrl+C. Not `a & b` in the script: in a non-interactive shell a background job ignores Ctrl+C, so it keeps running after you quit. The script builds once first so Node never starts before `dist/` exists.

## Auth schema is generated

`packages/db/src/schema/auth.ts` is written by `pnpm auth:generate` from `packages/auth`; never edit it. It declares `authSchema` itself (so `postgres-schemas.ts` doesn't). Change the config, run `pnpm auth:generate`, then `pnpm db:generate`. The first run on a new config prints "Drizzle schema mismatch" before writing; that's expected. Needs no database or secret (the CLI config uses `drizzle.mock`).

## Better Auth tables have no time zone

The generator writes `timestamp` (without time zone) and has no option to change it. Drizzle writes and reads them as UTC, so values are right; only `now()` defaults use the DB session time zone, which is UTC in our image and on RDS by default. Keep the DB in UTC. Hand edits are lost on regenerate.

## One copy of drizzle-orm

`better-auth` brings `kysely`, an optional peer of `drizzle-orm`, so pnpm can install two drizzle-orm copies whose types don't mix ("separate declarations of a private property"). After adding deps, run `pnpm dedupe`; `grep -c '^  drizzle-orm@0.45.4(' pnpm-lock.yaml` must be 1.

## Drizzle column gotchas

drizzle-orm 0.45 has no `bytea` (we use `customType`). `.default(0n)` on a `bigint` column crashes drizzle-kit ("Do not know how to serialize a BigInt"); use ``.default(sql`0`)``. Generated CHECKs show fully qualified column names (`"app"."projects"."name"`); that's valid and Postgres stores the short form. Money columns use `mode: "bigint"`. Drizzle's `.desc()` writes `NULLS LAST`, which is not Postgres's plain `DESC` (that is `NULLS FIRST`), so the index can't serve `ORDER BY … DESC`; use `.desc().nullsFirst()`.

## updated_at is set by Drizzle

`$onUpdate(() => sql\`now()\`)` fills it on every `db.update()`. Raw SQL updates don't; no trigger exists. `now()` is the transaction's start time, the same clock as the `created_at` default.

## Log tables stay inside packages/db

`schema/logs.ts` isn't exported from `@gw/db`, so apps can't query log tables (ADR 0007). `drizzle.config.ts` lists it separately so migrations still include it. The future LogStore imports it directly.

## Better Auth turns off origin checks in tests

Under `NODE_ENV=test` Better Auth skips its origin and CSRF checks, so tests would pass against a weaker setup than production. `createAuth` sets `advanced.disableOriginCheck: false` explicitly, so tests see production behaviour. It reads `NODE_ENV` once, at import; set behaviour-changing options explicitly instead of relying on its defaults.

## Auth rate limit needs the real client IP

Better Auth reads the client IP only from headers. We set our own `x-gw-client-ip` from Fastify's `request.ip` (replacing anything the client sent) and tell Better Auth to read only that. Default `x-forwarded-for` would let any client fake its IP. Behind a proxy, `request.ip` is the proxy's address until `trustProxy` is set, so everyone shares one bucket (backlog: GW-028). The limiter's store is an in-memory map per process, shared by every auth instance in a test file: give each test request its own `remoteAddress` (`uniqueIp()` in `testing/auth-requests.ts`). It resets on restart and is not shared between instances (backlog: GW-029).

## Better Auth reads env vars by itself

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` are read silently if set. We pass explicit values, which win, but a stray `BETTER_AUTH_TRUSTED_ORIGINS` still adds origins. Keep it out of the environment.

## A signed cookie is not a valid session

The HMAC signature only proves we issued the cookie. Every request also looks up the session row, which is why logout works (the row is deleted) and why the cookie cache stays off (a deleted session would keep working for up to 5 minutes). So a made-up token with a correct signature gets past the signature check and reaches the database; tests for DB failures need such a cookie (`signedCookie()` in `server-process.test.ts`). With two session cookies on one request, the first one wins. Sign-out with the database down returns 200 and clears the cookie, but the session row survives until it expires (backlog: GW-032).

## Session refresh needs its Set-Cookie forwarded

`getSession` may extend a session that is more than 1 day old and send a fresh cookie, or send a clearing cookie for an expired one. `requireSession` copies every `Set-Cookie` onto the reply. Without that, the browser cookie dies on its old date and an active user is logged out after 7 days.

## Session cookie name changes on https

Better Auth adds the `__Secure-` prefix when `BETTER_AUTH_URL` is https (`__Secure-better-auth.session_token`). Never hard-code the cookie name: tests pick it by pattern (`cookieFrom` in `testing/auth-requests.ts`).

## Changing BETTER_AUTH_SECRET logs everyone out

Every cookie signature stops matching. To rotate without logging people out, use Better Auth's versioned `BETTER_AUTH_SECRETS`.

## Auth requests are parsed twice

Fastify parses the JSON body and checks it with Zod; `toWebRequest` then re-serializes it with `JSON.stringify` for Better Auth, and drops `content-length` because the length changed. Consequences:
- Big numbers lose precision (`12345678901234567890` becomes `12345678901234567000`).
- The forwarded body is always JSON, whatever the client's content type was (a `text/plain` body arrives as JSON text).
- `new Request` normalizes the URL: `%2e%2e` becomes `..` and is collapsed, so Better Auth can see a different path than Fastify matched. Only our four fixed routes are forwarded; keep this in mind before ever forwarding a wildcard.
- An empty body with `content-type: application/json` gets Fastify's own 400 before our code runs. Clients that send no body (sign-out) must also send no `content-type`.

## Better Auth's origin check covers only its own routes

It guards `/api/auth/*`. Our protected routes run `requireTrustedOrigin`, which requires an `Origin` from the trusted list on POST, PUT, PATCH and DELETE (a missing `Origin` is rejected, GET is not checked). Scripts and tests must send `Origin`, even Node `fetch` and curl.

## Session tokens in plain text

`auth.sessions.token` is stored as is, not hashed (gateway keys are hashed). Anyone with read access to the database can use live sessions until they expire (7 days). Accepted for v1; revisit before going public.

## Database errors carry query params

Drizzle puts the SQL and its params in the error message and on `query` and `params`. Params are emails (login lookup), session tokens (session lookup) and password hashes (inserts). pino prints all of it, plus the cause's stack. `errorForLog` (`src/log-error.ts`) turns such an error, even one wrapped inside another, into `{ type, code }`, with the code from the real cause (`ECONNREFUSED`, `57P01`). It is used in two places: the Better Auth `log` hook and the error handler.

What it does not do:
- Only Drizzle query errors are redacted. Any other error is logged as it is, message and stack included, so never put secrets in an error message.
- A non-Error `cause` is not inspected.
- A chain deeper than 5 causes becomes `{ type: "TruncatedErrorChain" }`.
- The class is found by its name, because Drizzle does not set `error.name`; a test fails if Drizzle renames it.

## Better Auth prints errors to stderr on its own

When a query fails, the router in `better-call` (`dist/router.mjs`) runs `console.error("# SERVER_ERROR: ", error)`, with the SQL params and stack, bypassing our `log` hook. It does this unless the router's `onError` returns a Response or `throwError` is set. Better Auth's own `onError` (`better-auth/dist/api/index.mjs`) returns nothing, so `onAPIError.onError` cannot stop it, and an error thrown inside that hook is caught and logged by Better Auth. `onAPIError: { throw: true }` does: non-API errors then leave `auth.handler` as exceptions and reach our error handler, which logs them with `errorForLog`. API errors (401, 429, ...) still become normal responses. Side effect: Better Auth's own `onError` log lines are skipped; route-level warnings (such as "Invalid password") still arrive through our hook. The real-process test in `server-process.test.ts` checks stdout and stderr for this.

## Request logs include the query string

Fastify's request log prints the full URL, so a token or email in a query string ends up in the logs. Never put secrets in URLs; send them in a header or body.

## Not your project is 404, not 403

403 means "it exists, but it isn't yours", which tells a stranger which project IDs are real (an **existence oracle**). The project scope answers 404 for someone else's project and for one that doesn't exist: same status, same code, same message, and the same single query, so the timing matches too. The owner never sees this 404, so nothing useful is hidden from real users. `project-ownership.test.ts` compares the two answers for every `:projectId` route.

One small difference remains: a `projectId` that can't be a UUID is answered without a query, so it is a little faster. It reveals nothing, because such an ID can't exist.

## Project access goes through one condition

Only `accessibleProjects(userId)` (`packages/db/src/repositories/project-access.ts`) reads `owner_id` to decide access ([ADR 0011](docs/decisions/0011-project-ownership.md) calls it `canAccessProject`). It is a SQL condition, not a yes/no function, so one query both checks access and loads the row. Moving to teams changes only this condition.

- Never query `projects` from an app. Use `findAccessibleProject` and `listAccessibleProjects`; `renameProject` and `deleteProject` apply the same condition themselves (defence in depth: they are the only functions that touch a project by its bare ID).
- `insertProject` is the one place that writes `owner_id`, and `owner-access-rule.test.ts` fails if any other file in `packages/db/src` or `apps/admin-api/src` (schema, tests and test helpers aside) names the owner column.
- The cap counts *accessible* projects. Once teams exist, team projects will count toward a user's 100.

## Project scope runs before the body is read

The project check is an `onRequest` hook. Fastify has set `request.params` by then but has not parsed or validated the body, so:
- another user's project is 404 even with a broken body (a body error can't come first and confirm that the project exists);
- a malformed `projectId` is 404, not 400: an ID that can't exist is "not found". A malformed `keyId` (a child ID) stays a 400 from the route schema, because that is checked after access is settled;
- `project-ownership.test.ts` needs no valid body per route.

The hook relies on the protected scope's session hook running first (it needs the user). Hooks of a parent plugin run before those of its children, which is why the project scope must stay inside the protected scope.

## Use the project ID from the database

`z.uuid()` accepts uppercase hex, and Postgres matches it, so `/api/projects/6F1C…` finds the project. The row Postgres returns has the lowercase ID. Handlers use `getProject(request).id`, never the URL's `projectId`, so every later query and the provider key's AAD get the canonical ID (see Project ID as AAD must be canonical). The URL value is used once, for the lookup.

## Limits are counted under a lock

Every cap (100 projects per user; 20 active gateway keys per project in GW-020) is counted and inserted in one transaction that first takes a Postgres advisory lock named by the cap and its owner: `lockForLimit(tx, "projects", userId)`. Parallel creates for the same user take turns; other users don't wait. Decision and alternatives: [ADR 0013](docs/decisions/0013-atomic-limits.md).

- **Why not count, then insert:** two requests both count 99 and both insert. QA measured 20 parallel creates from 99 ending at 119: the overshoot equals the number of parallel requests.
- **Why one conditional statement is still racy:** `INSERT … SELECT … WHERE (select count(*) …) < 100` runs under READ COMMITTED, where each statement works from its own snapshot. Two concurrent statements can't see each other's uncommitted row, so both count 99 and both insert. A unique constraint can't express "at most 100".
- **Why an advisory lock and not `SELECT … FOR UPDATE` on a parent row:** for projects the parent is `auth.users`, Better Auth's table, and we don't lock tables we don't own. We have no row of our own to lock for "this user's projects". An advisory lock needs no row.
- **Why the lock is transaction-scoped:** `pg_advisory_xact_lock` is released at commit or rollback, on every error path, and when the connection dies. It also works behind PgBouncer in transaction pooling mode; session-level locks (`pg_advisory_lock`) do not.
- **The key** is `hashtextextended(scope || ':' || id, 0)`, a bigint. Two different names with the same hash would only wait for each other needlessly.
- **Deletes take no lock:** they only lower the count, which can't break the cap.
- A duplicate name still surfaces as a unique violation inside the transaction (it rolls back and releases the lock), see Unique violations are found by constraint name.

## Lock waits share the database pool

While a create waits for its user's lock it holds one pooled connection. `pg` allows 10 per process by default, and the same pool serves session checks for every request. A burst of creates from one user can therefore use up the pool and delay other users. QA measured a 500-create burst from one user delaying other users by up to 0.2 s locally (estimated 2 to 5 s on a networked database), with no errors; it clears by itself as the burst drains one create at a time. The pool has no wait timeout (`connectionTimeoutMillis` is 0 in `packages/db/src/client.ts`), so starvation shows up as delay or a hang, never as an error.

The owner chose to keep the blocking lock (the cap stays exact) and not to change pool settings in GW-018. **GW-034 (rate limit admin writes per user) must ship before the first deployment**: it bounds how many creates one user can queue (e.g. about 60 per minute), though it can't stop one simultaneous burst. Other levers, not used yet: a larger pool, `lock_timeout` on the transaction (turns a long wait into an error). **GW-037** adds the pool size setting (`DATABASE_POOL_MAX`) and the pooler plan for deployment, including a check that advisory transaction locks work under it.

## Unique violations are found by constraint name

A duplicate project name is detected from the database, not by looking first, so two parallel creates can't both succeed. `isUniqueViolation(error, constraint)` reads `code === "23505"` and the constraint name from the pg error, which Drizzle wraps in `cause` (the chain is walked, at most 5 deep). `isProjectNameTaken` names the constraint `projects_owner_id_name_unique`. Renaming that constraint in a migration silently turns the 409 into a 500; `unique-violation.test.ts` and the duplicate-name route tests pin the real name.

## Zod and Postgres agree on name length (code points)

Names are 1 to 100 characters. Zod 4.6.7 counts code points once a string is longer than the limit in UTF-16 units (`zod/v4/core/checks.js`: it measures units first and falls back to code points only when that already exceeds the max). Postgres `char_length` counts characters, which for UTF-8 are code points. So 100 emoji (200 UTF-16 units) pass both and 101 fail both, and the DB `CHECK` never fires first. Tests pin the 100 and 101 emoji boundary on both sides. Zod normalizes to NFC before the length check, so a name typed with combining accents counts like the stored text. If a Zod upgrade changes the counting, those tests fail.

## Names refuse control and bidi characters

The shared name rule (project names now, gateway key names in GW-020) refuses:
- **Control characters** (`\p{Cc}`): NUL makes Postgres fail with a 500 (text can't hold it); newlines and BEL break logs and UIs. The check sees the raw text before trimming, so a trailing newline is refused, not trimmed away.
- **Bidi overrides and isolates** (U+202A to U+202E, U+2066 to U+2069): they make a name display as something else.

It does not refuse all format characters (`\p{Cf}`): that would break ZWJ emoji and Persian and Indic scripts, which need ZWJ and ZWNJ. Order: control check, trim, NFC, then length. NFC means "café" typed either way is one name, so the unique constraint can't be dodged with a different Unicode spelling. Lookalike letters from other scripts (homoglyphs) are not handled.

## List order must not depend on the collation

`ORDER BY name` follows the database's default collation: the Alpine Postgres used in tests sorts by bytes (`A, B, a, b`), while a glibc or RDS database sorts `a, A, b, B`. The list uses `ORDER BY name COLLATE "C", id`, which sorts by bytes everywhere. `lower(name)` was rejected because it still depends on the locale for non-ASCII text. The test sets an ICU collation on the column first, so it fails if the `COLLATE` is removed even on a byte-sorting database. If a friendlier order is wanted later, sort in the dashboard.

## Fastify onRoute errors in callback plugins are uncaught

The project scope must stop a route that has no `:projectId`. Throwing from an `onRoute` hook doesn't do it: avvio catches only promise rejections, so a synchronous throw inside a callback-style plugin (our `FastifyPluginCallbackZod` convention) becomes an `uncaughtException`, and `ready()` never settles. Making the outer plugin async doesn't help: what matters is the plugin that registers the route. `projectScope` therefore only records the bad URLs in `onRoute` (in a `Set`, because Fastify adds a HEAD route for each GET) and throws from an `onReady` hook, so `ready()` rejects with a message that lists them. `require-project.test.ts` checks callback and async plugins, at the top and in child plugins.
