# 0002. Backend language: TypeScript first, then Go

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

AI agents write most code; the owner reviews and must defend it in interviews. Target roles are React + Node full-stack.

## Options

| Option | Pros | Cons |
|---|---|---|
| TypeScript | Owner can review it today; shared types with dashboard; matches target roles | Slower than Go for a proxy |
| Go | Best fit for a fast proxy | Owner can't yet spot Go-specific bugs (goroutine leaks, data races) in review |
| Python | Strong in AI/ML roles | Async pitfalls; off the target-role story |

## Decision

TypeScript for v1. **Go becomes the backend language once the TypeScript version is stable.**

"Stable" means:
- Phases 0–5 done (v1 feature-complete)
- Full test suite green in CI
- k6 baseline (p95 overhead) published

Migration (Phase 7) order: gateway hot path first, then worker, then admin API. Each step is benchmarked against the TypeScript baseline and must pass the same test suite.

The dashboard stays React + TypeScript.

## Consequences

- Shared TS types between backend and frontend during v1.
- Before migrating, API contracts move to OpenAPI so Go and the dashboard share one contract (TS types generated from it).
- Language-agnostic tests (e2e, k6, fake provider) are the safety net for the migration; keep them independent of TS internals.
