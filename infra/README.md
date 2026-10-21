# Infra

| Path | Purpose | Phase |
|---|---|---|
| `compose.yaml` | Local Postgres + Redis | 0 |
| `docker/` | Dockerfiles per app | 6 |
| `terraform/` or `cdk/` | AWS infra-as-code (choice pending: [ADR 0009](../docs/decisions/0009-hosting-path.md)) | 6 |

Never expose databases or admin panels to the internet directly.
