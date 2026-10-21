# @gw/db

Drizzle schema, migrations and the database client.

- App data: users, projects, provider keys, gateway keys, model pricing
- Logs: request logs and rollups, in a separate `logs` schema, accessed only through the `LogStore` interface (see [ADR 0007](../../docs/decisions/0007-log-store-separation.md))
