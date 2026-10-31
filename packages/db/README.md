# @gw/db

Drizzle schema, migrations and the database client.

- App data: users, projects, provider keys, gateway keys, model pricing
- Logs: request logs and rollups, in a separate `logs` schema, accessed only through the `LogStore` interface (see [ADR 0007](../../docs/decisions/0007-log-store-separation.md))

## Layout

- `src/schema/`: Drizzle schema
- `migrations/`: generated SQL, committed
- `src/client.ts`: `createDb(url)`
- `src/migrate.ts`: `runMigrations(url)`
- `src/testing/`: test-only helpers, exported as `@gw/db/testing`
- `dist/`: compiled output (git-ignored; `pnpm build`)

## Add a migration

1. Edit `src/schema/`.
2. `pnpm db:generate --name <what_changed>`
3. Read the SQL, then commit it.

Never edit a migration that has been merged; add a new one.

## Run migrations

```sh
pnpm infra:up
cp .env.example .env   # first time only
pnpm db:migrate
```

## Use the test harness in another package

1. Add `@gw/db` as a workspace dependency.
2. Create `vitest.global-setup.ts`:
   ```ts
   import { setupTestPostgres } from "@gw/db/testing";
   export default setupTestPostgres;
   ```
3. In `vitest.config.ts`: `defineConfig({ test: { globalSetup: ["./vitest.global-setup.ts"] } })`.
4. In a test file:
   ```ts
   let connection: DbConnection;
   beforeAll(async () => {
     connection = createDb(await createTestDatabase());
   });
   afterAll(() => connection.close());
   ```

Each test file gets its own migrated database. Also add `{ "path": "../../packages/db/tsconfig.build.json" }` to the consuming package's `tsconfig.build.json` references, so `tsc -b` builds `@gw/db` first.
