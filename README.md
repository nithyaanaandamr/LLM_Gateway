# LLM Gateway

A proxy that sits between your app and an LLM provider, adding API key management, usage and cost tracking, per-key rate limits, monthly budget caps and a dashboard.
Bring Your Own Key: you paste your provider key (encrypted at rest with AES-GCM), receive a gateway key, and point your SDK's base URL at the gateway.
The hot path stays fast: key lookup, rate-limit and budget checks run in Redis, and responses stream straight back to the client.
Usage logging, cost calculation and hourly/daily rollups happen off the hot path, through a queue-driven worker writing to Postgres.
Stack: Node and TypeScript (Fastify), Postgres, Redis, BullMQ, and a React dashboard, deployed on AWS with GitHub Actions CI/CD.
