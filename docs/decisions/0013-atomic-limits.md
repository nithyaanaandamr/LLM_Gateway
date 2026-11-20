# 0013. Every limit is one atomic check-and-count

- **Status:** Accepted
- **Date:** 2026-11-21
- **Task:** GW-018

## Context

The app has several limits: 100 projects per user, 20 active gateway keys per project (GW-020), rate limits and budget caps in the gateway. A limit is "count what exists, refuse if the count is too high, otherwise add one". Done as separate steps (count, then insert), parallel requests all see the same count and all pass. QA measured 20 parallel project creates from 99 ending at 119: the overshoot equals the number of parallel requests.

The owner's rule: if we are strict about tickets, we are strict everywhere. Every limit must be one atomic check-and-count, in the system that owns the counter.

## Options

For Postgres-backed limits (admin writes):

| Option | Exact? | Cost |
|---|---|---|
| A. Count, then insert (soft cap) | No: overshoots by the number of parallel requests | Simplest; what GW-018 first had |
| B. One conditional `INSERT … SELECT … WHERE count < N` | No. Under READ COMMITTED each statement works from its own snapshot, so two concurrent statements can't see each other's uncommitted row and both pass | One statement, but still racy |
| C. Counter row, `UPDATE … SET n = n + 1 WHERE n < N` | Yes (the row lock serializes) | Needs a counter column kept in sync on every insert, delete and cascade; a missed path makes it drift. For projects the counter would live on `auth.users`, Better Auth's table |
| D. SERIALIZABLE transaction plus retry | Yes | Every caller needs a retry loop for serialization failures; failures grow with load |
| E. Advisory transaction lock, then count and insert | Yes | The lock holds one pooled connection while a create waits (see PITFALLS.md: Lock waits share the database pool) |

## Decision

**Every limit is counted in one atomic step in the system that owns the counter. Where we can't be exact, we write down the bound and why.**

Where it applies:

| Limit | Store | Mechanism |
|---|---|---|
| Projects per user (100), active gateway keys per project (20, GW-020) | Postgres | Option E: `lockForLimit(tx, scope, id)` (`pg_advisory_xact_lock`), then count and insert in one transaction. Scopes: `"projects"` with the user ID, `"gateway-keys"` with the project ID |
| Gateway rate limits (Phase 2) | Redis | Atomic Redis operations (a script or single command), never read-then-write |
| Budget caps | Redis and Postgres | Bounded by reservation, not exact ([ADR 0006](0006-budget-cap-enforcement.md)): worst-case overshoot = in-flight limit × max cost per request |

Why E over the others: it needs no extra column (C), no retry code (D), and no lock on a table we don't own, because there is no row of ours to lock for "this user's projects". It is transaction-scoped: released at commit, rollback or a dead connection, and it works behind PgBouncer in transaction pooling mode (session locks don't).

### Known exceptions

| Limit | Why it isn't exact |
|---|---|
| Login rate limit | In memory per process (Better Auth's built-in store). Each instance counts alone, and a restart resets it. GW-029 moves it to Redis |
| Any Redis limit while Redis is down | Follows the failure mode in [ADR 0008](0008-redis-failure-mode.md); its research successor (GW-009) is still open |
| Budget caps | Bounded, not exact (ADR 0006) |

## Consequences

- Admin creates for one user take turns. A waiting create holds a pooled connection, so a burst from one user can delay others (PITFALLS.md: Lock waits share the database pool). **GW-034 (rate limit admin writes per user) is required before the first deployment.**
- `lockForLimit` is generic. GW-020 reuses it for the gateway key cap.
- The cap counts accessible projects, so team projects will count toward it once teams exist (ADR 0011).
- Tests prove exactness: 20 parallel creates from 99 give one success and nineteen 409s, and a user's burst never blocks another user.
- A new limit must say which of the above it uses, or write down its bound here.
