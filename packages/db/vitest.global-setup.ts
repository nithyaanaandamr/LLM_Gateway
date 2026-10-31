// One Postgres container per test run (see PITFALLS.md: Test database per file)
import { setupTestPostgres } from "./src/testing/index.ts";

export default setupTestPostgres;
