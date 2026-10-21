# 0003. Web framework: Fastify + Zod

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

The gateway adds latency to every request and must stream. Input must be validated at runtime.

## Options

| Option | Pros | Cons |
|---|---|---|
| Fastify | Low overhead, streaming, built-in pino logging, plugins | Plugin model to learn |
| Hono | Very light, edge-ready | Edge benefits unused (we run containers) |
| Express | Familiar | Slower, less structure |
| NestJS | Strong structure | Heavy boilerplate for this size |

Validation: Zod (widely known, infers TS types) over TypeBox (faster, Fastify-native) and Joi.

## Decision

Fastify with Zod.

## Consequences

Use a Zod type provider for Fastify so route schemas and types stay in one place.
