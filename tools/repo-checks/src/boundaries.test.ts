import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BAD_CASES, OK_CASES } from "./boundary-cases.ts";
import { BLOCK_ROWS } from "./boundary-blocks.ts";
import { REPO_ROOT, eslint, lintMessages, lintRuleIds, restrictedGroups } from "./lint-text.ts";

describe("bad imports fail lint", () => {
  test.each(BAD_CASES)("$name", async ({ rule, file, code }) => {
    expect(await lintRuleIds(file, code)).toContain(rule);
  });
});

// One bad import per (block, group): dropping any group from any block fails a test.
const BLOCK_GROUP_CASES = BLOCK_ROWS.flatMap((row) =>
  row.groups.map((g) => ({ name: `${row.block}: ${g.pattern}`, row, g })),
);

describe("every group of every block bans its example", () => {
  test.each(BLOCK_GROUP_CASES)("$name", async ({ row, g }) => {
    const groups = await restrictedGroups(row.file);
    const configured = groups.find((c) => c.group[0] === g.pattern);
    expect(configured, `group ${g.pattern} missing for ${row.file}`).toBeDefined();
    const messages = await lintMessages(row.file, `import "${g.example}";`);
    const texts = messages
      .filter((m) => m.ruleId === "no-restricted-imports")
      .map((m) => m.message);
    expect(texts.some((t) => t.includes(configured?.message ?? "?"))).toBe(true);
  });

  test.each(BLOCK_ROWS)("$block lists no group the table lacks", async (row) => {
    const configured = (await restrictedGroups(row.file)).map((c) => c.group[0]);
    expect(configured.sort()).toEqual(row.groups.map((g) => g.pattern).sort());
  });
});

describe("allowed imports pass lint", () => {
  test.each(OK_CASES)("$name", async ({ file, code }) => {
    expect(await lintRuleIds(file, code)).toEqual([]);
  });
});

describe("import cycles", () => {
  test("a runtime cycle fails import-x/no-cycle", async () => {
    const file = join(REPO_ROOT, "tools/repo-checks/fixtures/cycle/a.ts");
    const [result] = await eslint.lintFiles([file]);
    expect(result?.messages.map((m) => m.ruleId)).toContain("import-x/no-cycle");
  });
});
