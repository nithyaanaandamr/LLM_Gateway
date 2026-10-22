# Tech stack

All choices are **Accepted**; linked ADRs explain why.

## Backend

| Tech | Role | Why | Main alternatives | Status |
|---|---|---|---|---|
| Node + TypeScript, then Go | All backend processes | TS for v1 (reviewable, shared types); Go after TS is stable | Python | Accepted: [0002](../decisions/0002-backend-language.md) |
| Fastify | HTTP server | Low overhead, streaming, built-in logging | Hono, Express, NestJS | Accepted: [0003](../decisions/0003-web-framework.md) |
| Zod | Runtime validation and types | One definition gives runtime checks and TS types | TypeBox, Joi | Accepted: [0003](../decisions/0003-web-framework.md) |

## Data

| Tech | Role | Why | Main alternatives | Status |
|---|---|---|---|---|
| Postgres | Source of truth | Relational data, transactions, aggregations | MongoDB, DynamoDB | Accepted |
| Drizzle | Data access and migrations | SQL-like, lightweight, teaches SQL | Prisma, Kysely | Accepted: [0004](../decisions/0004-orm.md) |
| Redis | Counters, cache, queue backend | In-memory, atomic ops, shared across instances | In-process memory, Memcached | Accepted |
| BullMQ | Job queue | Uses existing Redis; retries, scheduled jobs | SQS, pg-boss | Accepted |

## Security

| Tech | Role | Why | Main alternatives | Status |
|---|---|---|---|---|
| AES-GCM | Encrypt provider keys | Encrypts and detects tampering | AES-CBC (no tamper check) | Accepted |
| Secret store → KMS | Hold the master key | Master key never in code or DB | `.env` in production | Accepted (KMS later) |
| SHA-256 | Hash gateway keys | Keys are random; fast hash is safe and quick | bcrypt (too slow for hot path) | Accepted |
| Better Auth | Dashboard login | TS-native, self-hosted in our Postgres | Auth.js, Cognito, own build | Accepted: [0005](../decisions/0005-dashboard-auth.md) |

## Frontend

| Tech | Role | Why | Main alternatives | Status |
|---|---|---|---|---|
| React + TS + Vite | Dashboard | Logged-in SPA, no SEO need | Next.js | Accepted |
| TanStack Query | Server data cache | Caching, dedupe, refetch handled | Redux, SWR | Accepted |
| Recharts | Charts | Simple, React-native | ECharts, visx | Accepted |

## Testing

| Tech | Role | Status |
|---|---|---|
| Vitest | Unit and integration | Accepted |
| Testcontainers | Real Postgres/Redis in tests | Accepted |
| Fake provider | No real spend in tests | Accepted |
| Playwright | E2E, visual regression, a11y (with axe) | Accepted |
| k6 | Load test, p95 overhead | Accepted |

## Local dev

| Tech | Role | Why | Main alternatives | Status |
|---|---|---|---|---|
| fnm | Node version manager | Fast; reads `.nvmrc` and switches on `cd` | nvm, Volta, Homebrew `node@24` | Accepted |
| pnpm via corepack | Package manager | Version pinned in `package.json`, same for everyone | npm, Yarn | Accepted |
| OrbStack | Local Docker runtime (macOS) | Light on memory and battery, fast start; free for personal use | Docker Desktop, Colima | Accepted |

## Deploy

| Tech | Role | Status |
|---|---|---|
| Docker | Package each app | Accepted |
| GitHub Actions | CI/CD | Accepted |
| Mac mini + Cloudflare Tunnel, then AWS (ECS Fargate, RDS, ElastiCache) | Hosting | Accepted: [0009](../decisions/0009-hosting-path.md) |
| Terraform or AWS CDK | Infra as code | Accepted, tool chosen at Phase 6: [0009](../decisions/0009-hosting-path.md) |
