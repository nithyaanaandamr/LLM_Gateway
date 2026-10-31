// One Postgres container per test run (see PITFALLS.md: Test database per file)
import { setupTestPostgres } from "@gw/db/testing";

export default setupTestPostgres;
