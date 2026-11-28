// One row per rule: a file path (relative to the repo root) and code that must fail.
// Rule ids: NRI = no-restricted-imports, NRP = import-x/no-relative-packages,
// NRPROP = no-restricted-properties.
export const NRI = "no-restricted-imports";
export const NRP = "import-x/no-relative-packages";
export const NRPROP = "no-restricted-properties";

export interface BadCase {
  name: string;
  rule: string;
  file: string;
  code: string;
}

export interface OkCase {
  name: string;
  file: string;
  code: string;
}

const A = "apps/admin-api/src/x.ts";
const A_TEST = "apps/admin-api/src/x.test.ts";

export const BAD_CASES: BadCase[] = [
  // R1: apps never import other apps
  { name: "R1 app imports another app", rule: NRI, file: A, code: `import "@gw/gateway";` },
  {
    name: "R1 app test imports another app",
    rule: NRI,
    file: A_TEST,
    code: `import "@gw/worker";`,
  },
  {
    name: "R1 relative path into another package",
    rule: NRP,
    file: A,
    code: `import "../../gateway/src/index.ts";`,
  },
  // R5: no drizzle-orm / pg in app runtime
  { name: "R5 app imports drizzle-orm", rule: NRI, file: A, code: `import "drizzle-orm";` },
  {
    name: "R5 app type-imports drizzle-orm subpath",
    rule: NRI,
    file: A,
    code: `import type {} from "drizzle-orm/node-postgres";`,
  },
  { name: "R5 app imports pg", rule: NRI, file: A, code: `import "pg";` },
  // GW-045: @gw/db/drizzle banned in apps, tests too
  {
    name: "GW-045 app imports @gw/db/drizzle",
    rule: NRI,
    file: A,
    code: `import "@gw/db/drizzle";`,
  },
  {
    name: "GW-045 app test imports @gw/db/drizzle",
    rule: NRI,
    file: A_TEST,
    code: `import "@gw/db/drizzle";`,
  },
  // R7: testing helpers only in tests
  {
    name: "R7 app imports ./testing",
    rule: NRI,
    file: A,
    code: `import "./testing/test-config.ts";`,
  },
  { name: "R7 app imports @gw/db/testing", rule: NRI, file: A, code: `import "@gw/db/testing";` },
  { name: "R7 app imports fake-provider", rule: NRI, file: A, code: `import "@gw/fake-provider";` },
  {
    name: "R7 db runtime imports ./testing",
    rule: NRI,
    file: "packages/db/src/x.ts",
    code: `import "./testing/index.ts";`,
  },
  // R10: gateway and worker
  {
    name: "R10 gateway imports @gw/auth",
    rule: NRI,
    file: "apps/gateway/src/x.ts",
    code: `import "@gw/auth";`,
  },
  {
    name: "R10 worker imports @gw/auth",
    rule: NRI,
    file: "apps/worker/src/x.ts",
    code: `import "@gw/auth";`,
  },
  {
    name: "R10 worker imports fastify",
    rule: NRI,
    file: "apps/worker/src/x.ts",
    code: `import "fastify";`,
  },
  // R8: dashboard and shared main stay browser-safe
  {
    name: "R8 dashboard imports @gw/shared/crypto",
    rule: NRI,
    file: "apps/dashboard/src/x.ts",
    code: `import "@gw/shared/crypto";`,
  },
  {
    name: "R8 dashboard imports @gw/db",
    rule: NRI,
    file: "apps/dashboard/src/x.ts",
    code: `import "@gw/db";`,
  },
  {
    name: "R8 dashboard imports node:fs",
    rule: NRI,
    file: "apps/dashboard/src/x.ts",
    code: `import "node:fs";`,
  },
  {
    name: "R8 shared main imports node:crypto",
    rule: NRI,
    file: "packages/shared/src/x.ts",
    code: `import "node:crypto";`,
  },
  {
    name: "R8 shared main imports ./crypto",
    rule: NRI,
    file: "packages/shared/src/x.ts",
    code: `import "./crypto/index.ts";`,
  },
  // R2 / R3: packages
  {
    name: "R2 package imports an app",
    rule: NRI,
    file: "packages/db/src/x.ts",
    code: `import "@gw/admin-api";`,
  },
  {
    name: "R2 package test imports an app",
    rule: NRI,
    file: "packages/db/src/x.test.ts",
    code: `import "@gw/admin-api";`,
  },
  {
    name: "R3 db imports @gw/auth",
    rule: NRI,
    file: "packages/db/src/x.ts",
    code: `import "@gw/auth";`,
  },
  {
    name: "R3 shared crypto imports a workspace package",
    rule: NRI,
    file: "packages/shared/src/crypto/x.ts",
    code: `import "@gw/db";`,
  },
  {
    name: "R3 shared main imports a workspace package",
    rule: NRI,
    file: "packages/shared/src/x.ts",
    code: `import "@gw/db";`,
  },
  // R16: no HTTP frameworks in db and auth
  {
    name: "R16 db imports fastify",
    rule: NRI,
    file: "packages/db/src/x.ts",
    code: `import "fastify";`,
  },
  {
    name: "R16 auth imports fastify",
    rule: NRI,
    file: "packages/auth/src/x.ts",
    code: `import "fastify";`,
  },
  // R17: tools stand alone
  {
    name: "R17 tool imports @gw/db",
    rule: NRI,
    file: "tools/board-bot/src/x.ts",
    code: `import "@gw/db";`,
  },
  // R18 / R19
  {
    name: "R18 repository imports @gw/shared/crypto",
    rule: NRI,
    file: "packages/db/src/repositories/x.ts",
    code: `import "@gw/shared/crypto";`,
  },
  {
    name: "R18 repository imports node:crypto",
    rule: NRI,
    file: "packages/db/src/repositories/x.ts",
    code: `import "node:crypto";`,
  },
  {
    name: "R19 schema imports repositories",
    rule: NRI,
    file: "packages/db/src/schema/x.ts",
    code: `import "../repositories/projects.ts";`,
  },
  // R11 / G5: process.env outside entry points
  {
    name: "R11 app reads process.env",
    rule: NRPROP,
    file: A,
    code: `export const port = process.env.PORT;`,
  },
  {
    name: "R11 app destructures env from process",
    rule: NRPROP,
    file: A,
    code: `const { env } = process;\nexport { env };`,
  },
  {
    name: "R11 package reads process.env",
    rule: NRPROP,
    file: "packages/db/src/x.ts",
    code: `export const u = process.env.DATABASE_URL;`,
  },
  {
    name: "R11 tool reads process.env",
    rule: NRPROP,
    file: "tools/board-bot/src/x.ts",
    code: `export const t = process.env.TOKEN;`,
  },
];

export const OK_CASES: OkCase[] = [
  {
    name: "main.ts reads process.env",
    file: "apps/admin-api/src/main.ts",
    code: `export const p = process.env.PORT;`,
  },
  {
    name: "*-cli.ts reads process.env",
    file: "packages/db/src/migrate-cli.ts",
    code: `export const u = process.env.DATABASE_URL;`,
  },
  {
    name: "tools main.ts reads process.env",
    file: "tools/board-bot/src/main.ts",
    code: `export const t = process.env.TOKEN;`,
  },
  {
    name: "src/testing helper reads process.env",
    file: "apps/admin-api/src/testing/x.ts",
    code: `export const p = process.env.PORT;`,
  },
  { name: "test reads process.env", file: A_TEST, code: `export const p = process.env.PORT;` },
  { name: "test imports ./testing", file: A_TEST, code: `import "./testing/test-config.ts";` },
  { name: "app test imports @gw/fake-provider", file: A_TEST, code: `import "@gw/fake-provider";` },
  { name: "app test imports drizzle-orm", file: A_TEST, code: `import "drizzle-orm";` },
  {
    name: "@gw/auth imports @gw/db/drizzle",
    file: "packages/auth/src/x.ts",
    code: `import "@gw/db/drizzle";`,
  },
  {
    name: "shared crypto imports node:crypto",
    file: "packages/shared/src/crypto/x.ts",
    code: `import "node:crypto";`,
  },
  {
    name: "auth test config imports @gw/db/testing",
    file: "packages/auth/vitest.global-setup.ts",
    code: `import "@gw/db/testing";`,
  },
  {
    name: "db runtime imports drizzle-orm",
    file: "packages/db/src/x.ts",
    code: `import "drizzle-orm";`,
  },
  { name: "admin-api imports @gw/auth", file: A, code: `import "@gw/auth";` },
];
