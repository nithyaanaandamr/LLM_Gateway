# Architecture Decision Records (ADRs)

One file per significant decision: what we chose, why, and what we gave up.
Copy [0000-template.md](0000-template.md). Never delete an ADR; mark it `Superseded by NNNN` instead.

Statuses: `Open` (researching) → `Proposed` (recommendation, awaiting decision) → `Accepted` / `Rejected` → `Superseded`.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo.md) | One monorepo with pnpm workspaces | Accepted |
| [0002](0002-backend-language.md) | Backend language: TypeScript first, then Go | Accepted |
| [0003](0003-web-framework.md) | Fastify + Zod | Accepted |
| [0004](0004-orm.md) | Drizzle ORM | Accepted |
| [0005](0005-dashboard-auth.md) | Dashboard auth via Better Auth | Accepted |
| [0006](0006-budget-cap-enforcement.md) | Budget caps: tiers, concurrency cap, reservation | Accepted |
| [0007](0007-log-store-separation.md) | Separate log store behind an interface | Accepted |
| [0008](0008-redis-failure-mode.md) | Redis failure handling: configurable, default closed | Accepted |
| [0009](0009-hosting-path.md) | Hosting path and infra-as-code | Accepted |
| [0010](0010-board-sync-bot.md) | Board sync bot and review label gate | Accepted |
| [0011](0011-project-ownership.md) | Project ownership: single owner now, teams later | Accepted |
| [0012](0012-packages-compile-to-dist.md) | Packages and apps compile to dist | Accepted |
