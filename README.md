# LLM Gateway

A proxy that sits between your app and an LLM provider, adding API key management, usage and cost tracking, per-key rate limits, monthly budget caps and a dashboard.

Bring Your Own Key: you paste your provider key (encrypted at rest with AES-GCM), receive a gateway key, and point your SDK's base URL at the gateway.

The hot path stays fast: key lookup, rate-limit and budget checks run in Redis, and responses stream straight back to the client.
Usage logging, cost calculation and hourly/daily rollups happen off the hot path, through a queue-driven worker writing to Postgres.

Stack: Node and TypeScript (Fastify), Postgres, Redis, BullMQ, and a React dashboard, deployed on AWS with GitHub Actions CI/CD.
Once the TypeScript version is stable, the backend moves to Go ([ADR 0002](docs/decisions/0002-backend-language.md)).

> **Status:** Phase 0 (foundations). See the [roadmap](docs/planning/roadmap.md) and [board](docs/planning/board.md).

## Repo layout

```
apps/
  gateway/       Hot-path proxy: auth, limits, forwarding, streaming
  admin-api/     Dashboard backend: sessions, projects, keys, reports
  worker/        BullMQ jobs: log inserts, rollups, alerts
  dashboard/     React + Vite UI
packages/
  shared/        Zod schemas, shared types, cost calculation
  db/            Drizzle schema and migrations
tools/
  fake-provider/ Fake LLM provider for tests (no real spend)
tests/
  e2e/           Playwright: functional, visual, accessibility
  load/          k6 load tests
infra/           Local Docker setup; later deploy config
docs/            Architecture, decisions, planning, quality, learning
```

## Docs

Start at [docs/README.md](docs/README.md).

## Local setup

Not runnable yet. Tooling is set up in Phase 0 (see board tasks GW-003 to GW-005).
