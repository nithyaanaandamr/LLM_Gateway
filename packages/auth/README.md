# @gw/auth

Better Auth config (ADR 0005); it shapes the `auth` tables in `packages/db`.

Regenerate the auth tables: `pnpm auth:generate`, then `pnpm db:generate --name <what_changed>`.

Routes, secret and base URL come in GW-017.
