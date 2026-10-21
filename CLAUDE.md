# Agent guide

LLM Gateway: a BYOK proxy with key management, rate limits, budget caps, usage tracking and a dashboard. Monorepo (pnpm workspaces).

## Read first
- [docs/README.md](docs/README.md): docs index
- [docs/architecture/overview.md](docs/architecture/overview.md): components and request flow
- [docs/planning/board.md](docs/planning/board.md): what is being worked on
- [PITFALLS.md](PITFALLS.md): known traps

## Workflow
- Every change belongs to a board task `GW-###`. Follow [docs/planning/README.md](docs/planning/README.md).
- Update the board in the same PR as the change.
- Significant decisions get an ADR in `docs/decisions/`.

## Rules
- Hot path (`apps/gateway`) does only: key lookup, limit checks, forwarding, streaming. Everything else goes to the queue.
- Tests never call real providers. Use `tools/fake-provider`.
- Never log prompts or responses by default. Metadata only.
- Never commit secrets. Use `.env` (git-ignored); keep `.env.example` updated.
- Comments stay brief. Put the why, gotchas and trade-offs in `PITFALLS.md` and reference it.
