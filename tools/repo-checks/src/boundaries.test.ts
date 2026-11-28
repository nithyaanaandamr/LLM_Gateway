import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { BAD_CASES, OK_CASES } from "./boundary-cases.ts";
import { REPO_ROOT, eslint, lintRuleIds } from "./lint-text.ts";

describe("bad imports fail lint", () => {
  test.each(BAD_CASES)("$name", async ({ rule, file, code }) => {
    expect(await lintRuleIds(file, code)).toContain(rule);
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
