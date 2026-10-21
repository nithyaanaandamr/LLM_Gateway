# 0006. Budget caps: tiers, concurrency cap, reservation

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

Cost is known only after the response. Parallel requests near the cap can all pass the check and overshoot. See PITFALLS.md: budget cap race.

## Options

| Option | Effect on overshoot |
|---|---|
| Check spent < cap only | Unbounded under concurrency |
| Soft tiers (alert, throttle) | Smaller, still possible |
| Reservation (reserve estimated max cost, reconcile after) | Bounded by estimate accuracy |
| Concurrency cap past a threshold | Overshoot ≤ in-flight limit × max cost per request |

## Decision

Combine all three, configurable per project:

| Spent | Action |
|---|---|
| ≥ 80% | Notify owner (email: later phase) |
| ≥ 90% | Limit in-flight requests per key (e.g. 2) |
| ≥ 100% | Block |
| Always | Reserve estimated max cost (input tokens + `max_tokens` × price) before forwarding |

## Consequences

- If the client omits `max_tokens`, the gateway sets a default ceiling.
- Reservations must be released on error and on disconnect.
