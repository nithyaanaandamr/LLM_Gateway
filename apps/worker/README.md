# @gw/worker

- **Layer:** App (cold path, planned)
- **May import:** `@gw/db`, `@gw/shared`, the queue client
- **Does not:** import other apps, `@gw/auth` or `fastify`

The cold path. Consumes BullMQ jobs from Redis.

**Jobs:**
- `log.write`: batch-insert request logs (via the `LogStore` interface)
- `rollup.hourly` / `rollup.daily`: aggregate spend per key and project
- `budget.alert` (later): notify owners at thresholds

No HTTP endpoint.
