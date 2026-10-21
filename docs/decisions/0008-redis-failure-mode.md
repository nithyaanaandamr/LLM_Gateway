# 0008. Redis failure handling

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-009

## Context

Redis holds rate limits, budget counters, the key cache and the job queue. If it is down, the gateway can't check limits. See PITFALLS.md: Redis failure mode.

## Research topics

- [ ] Replicas with automatic failover (e.g. ElastiCache Multi-AZ)
- [ ] Timeouts and circuit breaker around Redis calls
- [ ] Fail open vs fail closed, per check (rate limit vs budget vs cache)
- [ ] Local in-memory fallback counters per instance
- [ ] What happens to queued log jobs during an outage

## Decision

Failure mode is configurable via `REDIS_FAILURE_MODE`, default `closed`.

Research (GW-009) continues; its outcome is recorded in a new ADR that supersedes this one.
