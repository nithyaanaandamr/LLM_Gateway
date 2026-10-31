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
- **PR titles are untrusted input.** The workflow passes them via `env`, never `${{ }}` inside `run:`, which would let a title run shell commands.

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

## Node-only code in shared

Crypto uses `node:crypto`, which browsers don't have. It is exported only via `@gw/shared/crypto`; the main `@gw/shared` entry (used by the dashboard) must never import it.

## Gateway key format

`gw_live_` + 64 lowercase hex (32 random bytes, 256 bits). Hex chosen for simplicity and double-click selection. Strict format check before hashing, so junk never reaches Redis or the DB and each key has exactly one hash.

## Hash lookup needs no constant-time compare

The attacker picks the key but can't steer its SHA-256 hash, so timing the DB lookup teaches them nothing about real keys. Constant-time compare (`timingSafeEqual`) matters only when comparing a secret directly to attacker input in JS.
