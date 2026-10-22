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

Apps are not built yet. Tooling and local infra (Postgres, Redis) work.

### Prerequisites (macOS)

| Tool | Version | Install |
|---|---|---|
| Node | 24 (pinned in `.nvmrc`) | `brew install fnm`, then `fnm install` in the repo |
| pnpm | 12 (pinned in `package.json` `packageManager`) | `corepack enable` (comes with Node 24) |
| Docker runtime | OrbStack 2.2 (Docker Engine 29, Compose 5) | `brew install --cask orbstack`, open the app once, then Settings → System → enable admin privileges (see PITFALLS.md: OrbStack socket) |

Add fnm to your shell (`~/.zshrc`):

```sh
eval "$(fnm env --use-on-cd --version-file-strategy=recursive --shell zsh)"
```

Check:

```sh
node -v            # v24.x
pnpm -v            # 12.x
docker version     # client and server both listed
```

Versions last checked: 2026-10-22 (Node 24.22.1, pnpm 12.14.0, OrbStack 2.2.4, Docker 29.8.2, Compose 5.5.0).

### Scripts

Run from the repo root:

| Command | Does |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm lint` | ESLint, every package |
| `pnpm typecheck` | TypeScript check, every package |
| `pnpm test` | Vitest, every package |
| `pnpm format` / `pnpm format:check` | Prettier: fix / check formatting |
| `pnpm infra:up` | Start Postgres and Redis; waits until both are healthy |
| `pnpm infra:status` | Show containers and health |
| `pnpm infra:down` | Stop them (data kept) |
| `pnpm infra:reset` | Stop and **delete** local data |
