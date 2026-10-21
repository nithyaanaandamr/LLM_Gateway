# Architecture overview

## Components

```
                         HOT PATH (must be fast)
 ┌──────────┐  gw_live_…  ┌──────────────┐  provider key  ┌──────────────┐
 │ User's   │ ──────────▶ │   Gateway    │ ─────────────▶ │ LLM provider │
 │ app/SDK  │ ◀────────── │  (Fastify)   │ ◀───────────── │              │
 └──────────┘  streamed   └──────┬───────┘   streamed     └──────────────┘
                                 │ key lookup, rate limit, budget
                                 ▼
                          ┌──────────────┐
                          │    Redis     │  counters, key cache, job queue
                          └──────┬───────┘
                                 │ log job (BullMQ)
 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
                         COLD PATH (can be slow)
                                 ▼
                          ┌──────────────┐        ┌──────────────┐
                          │    Worker    │ ─────▶ │   Postgres   │
                          └──────────────┘        └──────▲───────┘
 ┌──────────────┐  session cookie  ┌──────────────┐      │
 │  Dashboard   │ ───────────────▶ │  Admin API   │ ─────┘
 └──────────────┘                  └──────────────┘
```

| Component | Role |
|---|---|
| Gateway | Authenticates gateway keys, checks limits, forwards, streams back |
| Redis | Rate-limit counters, month-to-date spend, key cache, job queue |
| Postgres | Users, projects, encrypted provider keys, hashed gateway keys, logs, rollups, pricing |
| Worker | Batch-inserts logs, builds hourly/daily rollups, sends alerts (later) |
| Admin API | Dashboard backend, session auth |
| Dashboard | Spend over time, per-key breakdown, key management |

## One request (hot path)

1. Client calls the gateway with its gateway key.
2. Gateway hashes the key and looks it up (cached in Redis).
3. Gateway checks the rate limit and reserves estimated cost against the budget in Redis.
4. Gateway decrypts the provider key, forwards the request and streams the response back.
5. On stream end (or client disconnect), it reads token usage, computes cost, reconciles the reservation and enqueues a log job.

**Principle:** auth, limits and forwarding are inline. Logging and reporting happen afterwards.

## Code structure

One repo, separate processes (modular monolith). See [ADR 0001](../decisions/0001-monorepo.md).

## Deliberate design decisions

| Topic | Where |
|---|---|
| Budget caps under concurrency | [ADR 0006](../decisions/0006-budget-cap-enforcement.md) |
| App data vs log storage | [ADR 0007](../decisions/0007-log-store-separation.md) |
| Redis down: fail open or closed | [ADR 0008](../decisions/0008-redis-failure-mode.md) |
| Admin API vs gateway: separate auth | This doc, components table |
| Privacy: metadata-only logs | [security.md](security.md) |
| Partial usage on disconnect | [PITFALLS.md](../../PITFALLS.md) |
