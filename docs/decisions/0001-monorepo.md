# 0001. One monorepo with pnpm workspaces

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-001

## Context

The gateway has four apps (gateway, admin API, worker, dashboard) sharing types, DB schema and cost logic. Solo developer, one product.

## Options

| Option | Pros | Cons |
|---|---|---|
| Monorepo | Shared types break the build on mismatch; one PR per feature; one CI; one board | Needs workspace tooling |
| Repo per layer | Independent history | Types drift or need publishing; multi-PR changes; split tracking |

## Decision

One repo per product. Apps in `apps/`, shared code in `packages/`, pnpm workspaces. Each app still builds and deploys separately.

## Consequences

- CI should run only the affected apps (Turborepo or path filters, decided in GW-006).
- The game project gets its own repo.
