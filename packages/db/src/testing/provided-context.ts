// Test-only, not in the main entry.
// Set by global setup (see PITFALLS.md: Test database per file)
export interface TestPostgres {
  adminUrl: string; // URL of the "postgres" maintenance database
  templateDatabase: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    testPostgres: TestPostgres;
  }
}
