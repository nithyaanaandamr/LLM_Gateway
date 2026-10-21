# 0007. Separate log store behind an interface

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

App data needs many small, safe writes. Logs need large appends and heavy aggregation. Mixing them can slow the dashboard as logs grow.

## Options

| Option | Pros | Cons |
|---|---|---|
| One Postgres, mixed tables | Simplest | Hard to split later |
| Separate DB now (ClickHouse/Timescale) | Built for analytics | Extra cost and ops in v1 |
| **Seam now, split later** | Cheap now; swap is one module | Discipline needed to use only the interface |

## Decision

All log reads and writes go through a `LogStore` interface. v1 uses the same Postgres with a separate `logs` schema. Split to a dedicated store when volume demands it.

## Consequences

No code outside `LogStore` may query log tables directly.
