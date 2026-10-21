# 0009. Hosting path and infra-as-code

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

Owner is new to deployment. A full AWS setup has hourly idle cost.

## Options

| Option | Pros | Cons |
|---|---|---|
| Mac mini (Cloudflare Tunnel) first, then AWS | Learn step by step; $0 always-on host | Two setups |
| AWS only | One setup | Steep start; ongoing cost |

Compute on AWS: ECS Fargate (runs the worker cleanly) over App Runner (HTTP-only fit).
Infra as code: Terraform (common in job ads) vs AWS CDK (TypeScript). Decide when Phase 6 starts.

## Decision

Mac mini first, then AWS on ECS Fargate + RDS + ElastiCache. Infra-as-code tool decided at Phase 6.

## Consequences

AWS environment is torn down between demos; billing alert set before first deploy.
