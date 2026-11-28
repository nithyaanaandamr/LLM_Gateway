import { defineConfig } from "vitest/config";

// Cold CI: the first case loads ESLint with the whole root config. see PITFALLS.md: Slow first lint in tests
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 30_000 } });
