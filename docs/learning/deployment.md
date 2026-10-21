# Deployment learning track

Learn by doing, one step at a time. Each step maps to board tasks.

| Step | Goal | Concepts | Phase |
|---|---|---|---|
| 1. Docker locally | `pnpm infra:up` runs Postgres + Redis | Images, containers, volumes, ports | 0 |
| 2. CI | Lint, test and build on every PR | Workflows, jobs, caching, secrets in CI | 0 |
| 3. Containerise apps | Each app has a Dockerfile | Multi-stage builds, small images | 6 |
| 4. Easy deploy | Running on Mac mini via Cloudflare Tunnel | DNS, HTTPS, reverse proxy, tunnels | 6 |
| 5. AWS | Running on ECS Fargate + RDS + ElastiCache | VPC, subnets, security groups, IAM roles, load balancer, image registry, logs | 6 |
| 6. Infra as code | One command builds, one tears down | Terraform/CDK state, plans, drift | 6 |

**Before step 5:** set an AWS billing alert. See PITFALLS.md: AWS idle cost.

## Notes

Add what you learn here as you go.
