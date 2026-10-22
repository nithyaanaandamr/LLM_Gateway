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

Gateway keys are 32 random bytes, so they can't be guessed. A fast hash (SHA-256) is safe here. bcrypt/argon2 are deliberately slow and built for weak human passwords; using them would add latency to every request. Dashboard **passwords** still use argon2.

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
