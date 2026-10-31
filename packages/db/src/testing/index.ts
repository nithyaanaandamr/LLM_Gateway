// Test-only helpers. Never import from app code.
export { setupTestPostgres } from "./postgres-container.ts";
export { createTestDatabase, type TestDatabaseOptions } from "./test-database.ts";
// keeps the vitest ProvidedContext augmentation in the .d.ts (see PITFALLS.md: Type-only augmentations vanish from .d.ts)
export type { TestPostgres } from "./provided-context.ts";
