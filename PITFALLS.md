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
