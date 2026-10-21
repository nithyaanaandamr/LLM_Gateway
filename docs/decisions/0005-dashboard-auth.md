# 0005. Dashboard auth: Better Auth

- **Status:** Accepted
- **Date:** 2026-10-21
- **Task:** GW-002

## Context

Basic login is easy; the long tail (CSRF, session rotation, reset tokens, brute force, OAuth, MFA) is where silent security bugs hide. Gateway key auth is already custom-built and shows that skill.

## Options

| Option | Pros | Cons |
|---|---|---|
| Better Auth | TS-native; users in our Postgres; works with Fastify | Newer library |
| Auth.js | Popular | Centred on Next.js |
| Cognito | AWS-native | Awkward DX; AWS lock-in |
| Build our own | Full understanding | High risk of subtle bugs; reviewer red flag |

## Decision

Better Auth. Write a short note explaining how its sessions and cookies work.

## Consequences

Auth tables are managed alongside our Drizzle schema.
