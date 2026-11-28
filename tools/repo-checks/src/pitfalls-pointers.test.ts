import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "./lint-text.ts";
import { findBrokenPointers, readHeadings } from "./pitfalls-pointers.ts";

const PITFALLS = "## Budget cap race\n## Type-aware lint\n## Type-aware\n";
const headings = readHeadings(PITFALLS);
const broken = (line: string) => findBrokenPointers("x.md", line, headings);

describe("findBrokenPointers", () => {
  test.each([
    "(see PITFALLS.md: Budget cap race)",
    "| PITFALLS.md: Budget cap race | next |",
    "// see PITFALLS.md: Type-aware lint",
    "see PITFALLS.md: Budget cap race, Type-aware lint.",
    "see PITFALLS.md: Budget cap race and Type-aware lint",
    "| see PITFALLS.md: Budget cap race |",
    "see PITFALLS.md: <heading>",
    "[PITFALLS.md](PITFALLS.md): known traps",
  ])("accepts %s", (line) => {
    expect(broken(line)).toEqual([]);
  });

  test.each([
    "see PITFALLS.md: budget cap race",
    "see PITFALLS.md: Budget cap",
    "see PITFALLS.md: Budget cap race is bad",
  ])("rejects %s", (line) => {
    expect(broken(line)).toHaveLength(1);
  });

  test("reports file and line", () => {
    const result = findBrokenPointers("a.md", "ok\nsee PITFALLS.md: Nope", headings);
    expect(result).toEqual([{ file: "a.md", line: 2, text: "Nope" }]);
  });
});

describe("repo pointers", () => {
  test("every PITFALLS.md pointer names a real heading", () => {
    const repoHeadings = readHeadings(readFileSync(join(REPO_ROOT, "PITFALLS.md"), "utf8"));
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter((f) => /\.(md|ts|tsx|js|json|yml|yaml|sh)$/.test(f))
      .filter(
        (f) => f !== "pnpm-lock.yaml" && !f.startsWith("tools/repo-checks/src/pitfalls-pointers"),
      );
    const found = files.flatMap((file) =>
      findBrokenPointers(file, readFileSync(join(REPO_ROOT, file), "utf8"), repoHeadings),
    );
    expect(found).toEqual([]);
  });
});
