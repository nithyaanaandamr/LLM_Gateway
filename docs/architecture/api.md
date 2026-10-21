# API *(draft)*

To be specified in Phase 1.

## Gateway (hot path)

Mirrors the provider's API so users only change base URL and key.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/chat/completions` | Streaming and non-streaming |

Errors: `401` bad key, `429` rate limit, `402`/`429` budget exceeded *(decide)*, `502` provider error, `503` Redis down and fail-closed.

## Admin API

| Area | Routes (draft) |
|---|---|
| Auth | Handled by auth library |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` |
| Provider key | `PUT/DELETE /api/projects/:id/provider-key` |
| Gateway keys | `GET/POST /api/projects/:id/keys`, `DELETE /api/keys/:id` |
| Usage | `GET /api/projects/:id/usage?from&to&groupBy` |
