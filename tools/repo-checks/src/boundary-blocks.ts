// One row per boundaryBlock in eslint.config.js: a file that block decides (it is the last
// matching block for that file) and, per group, an import that only that group bans.
// `pattern` is the group's first pattern in the config; the test finds the group by it.
export interface BlockGroup {
  pattern: string;
  example: string;
}

export interface BlockRow {
  block: string;
  file: string;
  groups: BlockGroup[];
}

const OTHER_APPS: BlockGroup = { pattern: "@gw/admin-api", example: "@gw/gateway" };
const FAKE_PROVIDER: BlockGroup = { pattern: "@gw/fake-provider", example: "@gw/fake-provider" };
const TESTING: BlockGroup = { pattern: "**/testing", example: "./testing/x.ts" };
const DB_DRIZZLE: BlockGroup = { pattern: "@gw/db/drizzle", example: "@gw/db/drizzle" };
const DRIZZLE_PG: BlockGroup = { pattern: "drizzle-orm", example: "drizzle-orm" };
const AUTH: BlockGroup = { pattern: "@gw/auth", example: "@gw/auth" };
const FASTIFY: BlockGroup = { pattern: "fastify", example: "fastify" };
const NODE: BlockGroup = { pattern: "node:*", example: "node:fs" };
const DASHBOARD_PACKAGES: BlockGroup = { pattern: "@gw/db", example: "@gw/db" };
const ANY_GW: BlockGroup = { pattern: "@gw/*", example: "@gw/db" };
const SHARED_CRYPTO: BlockGroup = { pattern: "**/crypto", example: "./crypto/index.ts" };
const CRYPTO_IN_REPO: BlockGroup = { pattern: "@gw/shared/crypto", example: "@gw/shared/crypto" };
const REPOS_IN_SCHEMA: BlockGroup = {
  pattern: "**/repositories",
  example: "../repositories/projects.ts",
};

const APP_RUNTIME = [OTHER_APPS, FAKE_PROVIDER, TESTING, DB_DRIZZLE, DRIZZLE_PG];
// AUTH_IN_DB and AUTH share one pattern; the db blocks use the same example.
const DB_RUNTIME = [OTHER_APPS, FAKE_PROVIDER, TESTING, AUTH, FASTIFY];

export const BLOCK_ROWS: BlockRow[] = [
  { block: "apps", file: "apps/admin-api/src/x.test.ts", groups: [OTHER_APPS, DB_DRIZZLE] },
  { block: "gateway", file: "apps/gateway/src/x.test.ts", groups: [OTHER_APPS, DB_DRIZZLE, AUTH] },
  {
    block: "worker",
    file: "apps/worker/src/x.test.ts",
    groups: [OTHER_APPS, DB_DRIZZLE, AUTH, FASTIFY],
  },
  { block: "apps runtime", file: "apps/admin-api/src/x.ts", groups: APP_RUNTIME },
  { block: "gateway runtime", file: "apps/gateway/src/x.ts", groups: [...APP_RUNTIME, AUTH] },
  {
    block: "worker runtime",
    file: "apps/worker/src/x.ts",
    groups: [...APP_RUNTIME, AUTH, FASTIFY],
  },
  {
    block: "dashboard runtime",
    file: "apps/dashboard/src/x.ts",
    groups: [OTHER_APPS, FAKE_PROVIDER, TESTING, NODE, DASHBOARD_PACKAGES],
  },
  { block: "packages", file: "packages/db/src/x.test.ts", groups: [OTHER_APPS] },
  {
    block: "auth runtime",
    file: "packages/auth/src/x.ts",
    groups: [OTHER_APPS, FAKE_PROVIDER, TESTING, FASTIFY],
  },
  { block: "db runtime", file: "packages/db/src/x.ts", groups: DB_RUNTIME },
  {
    block: "db repositories",
    file: "packages/db/src/repositories/x.ts",
    groups: [...DB_RUNTIME, CRYPTO_IN_REPO],
  },
  {
    block: "db schema",
    file: "packages/db/src/schema/x.ts",
    groups: [...DB_RUNTIME, REPOS_IN_SCHEMA],
  },
  {
    block: "shared main",
    file: "packages/shared/src/x.ts",
    groups: [ANY_GW, TESTING, NODE, SHARED_CRYPTO],
  },
  { block: "shared crypto", file: "packages/shared/src/crypto/x.ts", groups: [ANY_GW, TESTING] },
  { block: "tools", file: "tools/board-bot/src/x.ts", groups: [ANY_GW] },
];
