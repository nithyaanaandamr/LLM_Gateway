# @gw/admin-api

Backend for the dashboard.

**Does:** sign-up/login (sessions), projects, provider key storage (encrypt), gateway key issuance (show once, store hash), revocation, limits and budget settings, spend reports.

**Auth:** user sessions (cookie). Never accepts gateway keys.

## Run

- `pnpm --filter @gw/admin-api dev`: compiles to `dist/`, then rebuilds and restarts on file changes (including changes in packages it uses); loads the root `.env`.
- `pnpm --filter @gw/admin-api start`: runs the compiled `dist/main.js` (run `pnpm --filter @gw/admin-api build` first); real environment variables only (never reads `.env`).
- `pnpm --filter @gw/admin-api build`: compiles `src/` to `dist/`.

If a required variable is missing or invalid, the process prints which one and exits with code 1.

## Config

Each task adds its vars here.

| Variable         | Required / default | Meaning                                           |
| ---------------- | ------------------ | ------------------------------------------------- |
| `ADMIN_API_PORT` | required           | Port to listen on (0 to 65535; 0 = any free port) |
| `ADMIN_API_HOST` | `127.0.0.1`        | Address to listen on. Containers set `0.0.0.0`    |
| `LOG_LEVEL`      | `info`             | Log detail, see the levels below                  |

`LOG_LEVEL` values: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`.

## Routes

- `GET /health`: liveness. Returns `{ "status": "ok" }` when the process is up.

## Errors

Every error uses one JSON shape:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request is invalid",
    "requestId": "0b7e2c3a-6d1f-4a39-9a55-3f1c8e2d7b10",
    "details": [{ "path": "body.name", "message": "Too small: expected string to have >=1 characters" }]
  }
}
```

Codes: `BAD_REQUEST`, `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`, `INTERNAL`.

`details` appears only for validation errors. 5xx errors never include details. Quote the `requestId` when reporting a problem.
