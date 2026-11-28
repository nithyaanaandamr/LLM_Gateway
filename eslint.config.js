import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

// Boundary rules: docs/architecture/code-structure.md section 11.
// Each group matches the import text and carries the message a newcomer sees.
const OTHER_APPS = {
  group: [
    "@gw/admin-api",
    "@gw/gateway",
    "@gw/worker",
    "@gw/dashboard",
    "@gw/board-bot",
    "@gw/repo-checks",
  ],
  message: "Apps never import other apps or tools. Move shared code to a package in packages/.",
};
const FAKE_PROVIDER = {
  group: ["@gw/fake-provider"],
  message: "fake-provider is for tests only.",
};
const TESTING = {
  group: ["**/testing", "**/testing/**", "@gw/db/testing"],
  message: "testing/ helpers are for tests only.",
};
const DB_DRIZZLE = {
  group: ["@gw/db/drizzle"],
  message: "Apps get an opaque Database. Call a @gw/db repository function instead.",
};
const DRIZZLE_PG = {
  group: ["drizzle-orm", "drizzle-orm/*", "pg"],
  message: "App code never builds queries. Add a repository function in packages/db.",
};
const AUTH = {
  group: ["@gw/auth"],
  message: "No login sessions here, so no @gw/auth.",
};
const FASTIFY = {
  group: ["fastify", "fastify/*", "@fastify/*"],
  message: "Only apps that serve HTTP (admin-api, gateway) use fastify.",
};
// Bare names (`fs`) bypass `node:*`, so list them too. see PITFALLS.md: Bare Node built-ins bypass node: bans
const BARE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
].flatMap((name) => [name, `${name}/*`]);
const NODE = {
  group: ["node:*", ...BARE_BUILTINS],
  message: "Browser-safe code: no Node built-ins. Node-only helpers go in @gw/shared/crypto.",
};
const DASHBOARD_PACKAGES = {
  group: ["@gw/db", "@gw/db/*", "@gw/auth", "@gw/shared/crypto"],
  message: "The dashboard talks to admin-api over HTTP and imports only the @gw/shared main entry.",
};
const ANY_GW = {
  group: ["@gw/*"],
  message: "This code imports no workspace package.",
};
const SHARED_CRYPTO = {
  group: ["**/crypto", "**/crypto/**"],
  message: "The @gw/shared main entry is browser-safe; it never imports crypto/.",
};
const AUTH_IN_DB = {
  group: ["@gw/auth"],
  message: "@gw/db sits below @gw/auth; it never imports it.",
};
const CRYPTO_IN_REPO = {
  group: ["@gw/shared/crypto", "node:crypto", "crypto"],
  message: "Repositories store what they are given; encrypting is a service's job.",
};
const REPOS_IN_SCHEMA = {
  group: ["**/repositories", "**/repositories/**"],
  message: "Schema files define tables only; they never import repositories.",
};

const TEST_FILES = ["**/*.test.ts", "**/*.test.tsx", "**/*.fixture.ts", "**/testing/**"];
const ENTRY_POINTS = ["**/src/main.ts", "**/src/*-cli.ts"];
const restrict = (...groups) => ["error", { patterns: groups }];
const APP_RUNTIME = [OTHER_APPS, FAKE_PROVIDER, TESTING, DB_DRIZZLE, DRIZZLE_PG];
const DB_RUNTIME = [OTHER_APPS, FAKE_PROVIDER, TESTING, AUTH_IN_DB, FASTIFY];

// One block per file set. Several blocks can match one file: the LAST one replaces the
// earlier options for the same rule (no merge), so each block lists every group its files
// need. Order: general first, specific last. see PITFALLS.md: ESLint blocks replace rule options
const boundaryBlock = (files, groups, ignores = []) => ({
  files,
  ignores,
  rules: { "no-restricted-imports": restrict(...groups) },
});

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/build/",
    "**/coverage/",
    "**/playwright-report/",
    "**/test-results/",
    // Deliberate import cycle used by tools/repo-checks tests
    "tools/repo-checks/fixtures/",
  ]),
  js.configs.recommended,
  // Type-aware rules, e.g. no floating promises (see PITFALLS.md: Type-aware lint)
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["apps/dashboard/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [createNodeResolver()],
      // Without this, no-cycle skips .ts files and finds nothing.
      // see PITFALLS.md: import-x skips .ts files by default
      "import-x/extensions": [".ts", ".tsx", ".js"],
    },
    rules: {
      // Runtime imports only: `import type` is skipped
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
      // Blocks ../../gateway/src/... into another package
      "import-x/no-relative-packages": "error",
    },
  },

  // R1, R10: apps (tests too, for the @gw/db/drizzle ban). The dashboard's Node and package
  // bans (R8) are runtime-only below, so vite/playwright configs and tests may use Node.
  boundaryBlock(["apps/**"], [OTHER_APPS, DB_DRIZZLE]),
  boundaryBlock(["apps/gateway/**"], [OTHER_APPS, DB_DRIZZLE, AUTH]),
  boundaryBlock(["apps/worker/**"], [OTHER_APPS, DB_DRIZZLE, AUTH, FASTIFY]),
  // R5, R7: app runtime code
  boundaryBlock(["apps/*/src/**"], APP_RUNTIME, TEST_FILES),
  boundaryBlock(["apps/gateway/src/**"], [...APP_RUNTIME, AUTH], TEST_FILES),
  boundaryBlock(["apps/worker/src/**"], [...APP_RUNTIME, AUTH, FASTIFY], TEST_FILES),
  boundaryBlock(
    ["apps/dashboard/src/**"],
    [OTHER_APPS, FAKE_PROVIDER, TESTING, DRIZZLE_PG, FASTIFY, NODE, DASHBOARD_PACKAGES],
    TEST_FILES,
  ),
  // R2, R3, R7, R16, R18, R19: packages
  boundaryBlock(["packages/**"], [OTHER_APPS]),
  boundaryBlock(
    ["packages/auth/src/**"],
    [OTHER_APPS, FAKE_PROVIDER, TESTING, FASTIFY],
    TEST_FILES,
  ),
  boundaryBlock(["packages/db/src/**"], DB_RUNTIME, TEST_FILES),
  boundaryBlock(["packages/db/src/repositories/**"], [...DB_RUNTIME, CRYPTO_IN_REPO], TEST_FILES),
  boundaryBlock(["packages/db/src/schema/**"], [...DB_RUNTIME, REPOS_IN_SCHEMA], TEST_FILES),
  boundaryBlock(
    ["packages/shared/src/**"],
    [ANY_GW, TESTING, NODE, SHARED_CRYPTO],
    [...TEST_FILES, "packages/shared/src/crypto/**"],
  ),
  boundaryBlock(["packages/shared/src/crypto/**"], [ANY_GW, TESTING], TEST_FILES),
  // R17: tools stand alone
  boundaryBlock(["tools/*/src/**"], [ANY_GW]),

  // G5, R11: only entry points read process.env (a different rule, so no replacing)
  {
    files: ["apps/*/src/**", "packages/*/src/**", "tools/*/src/**"],
    ignores: [...TEST_FILES, ...ENTRY_POINTS],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read config once in main.ts (or a *-cli.ts) and pass it down.",
        },
      ],
    },
  },
  // Last: turns off rules that clash with Prettier
  prettier,
);
