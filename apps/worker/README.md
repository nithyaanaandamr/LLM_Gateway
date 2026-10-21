# @gw/worker

The cold path. Consumes BullMQ jobs from Redis.

**Jobs:**
- `log.write`: batch-insert request logs (via the `LogStore` interface)
- `rollup.hourly` / `rollup.daily`: aggregate spend per key and project
- `budget.alert` (later): notify owners at thresholds

No HTTP endpoint.
