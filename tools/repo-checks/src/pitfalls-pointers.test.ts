import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "./lint-text.ts";
import { findBrokenPointers, readHeadings } from "./pitfalls-pointers.ts";

const OWN_FILES = "tools/repo-checks/src/pitfalls-pointers";
const PITFALLS =
  "## Budget cap race\n## Type-aware lint\n## Type-aware\n## Money in nano-dollars\n";
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
    "see PITFALLS.md: Budget cap race, then retry later",
    "see PITFALLS.md: Budget cap race and why it matters",
    "see PITFALLS.md: Budget cap race, and PITFALLS.md: Type-aware lint",
    "see PITFALLS.md: Budget cap race; PITFALLS.md: Type-aware lint",
    "see PITFALLS.md: Budget cap race   ",
    "see PITFALLS.md: Budget cap race\t",
    "see PITFALLS.md: Budget cap race!",
    "see PITFALLS.md: Budget cap race?",
    "see **PITFALLS.md: Budget cap race**",
    "(PITFALLS.md: Budget cap race) and PITFALLS.md: Type-aware lint",
    "see PITFALLS.md: <heading>",
    "[PITFALLS.md](PITFALLS.md): known traps",
  ])("accepts %s", (line) => {
    expect(broken(line)).toEqual([]);
  });

  test.each([
    "see PITFALLS.md: budget cap race",
    "see PITFALLS.md: Budget cap",
    "see PITFALLS.md: Budget cap race is bad",
    "see PITFALLS.md: Budget cap race, Typo here",
    "see PITFALLS.md: Budget cap race; Typo here",
    "see PITFALLS.md: Budget cap race, Type-aware lint is bad",
    "see PITFALLS.md: <Typo>",
  ])("rejects %s", (line) => {
    expect(broken(line)).toHaveLength(1);
  });

  // Known limits of the simple rule (see looksLikeHeading)
  test.each([
    "see PITFALLS.md: Budget cap race, typo here",
    "see PITFALLS.md: Budget cap race and Typo here",
  ])("limitation: accepts %s", (line) => {
    expect(broken(line)).toEqual([]);
  });

  test("a wrapped pointer is not checked (known limit)", () => {
    expect(broken("see PITFALLS.md:\nNope")).toEqual([]);
  });

  test("reports file and line", () => {
    const result = findBrokenPointers("a.md", "ok\nsee PITFALLS.md: Nope", headings);
    expect(result).toEqual([{ file: "a.md", line: 2, text: "Nope" }]);
  });
});

describe("repo pointers", () => {
  test("every PITFALLS.md pointer names a real heading", () => {
    const repoHeadings = readHeadings(readFileSync(join(REPO_ROOT, "PITFALLS.md"), "utf8"));
    const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const found = listed
      .split("\n")
      .filter((f) => f !== "" && f !== "pnpm-lock.yaml" && !f.startsWith(OWN_FILES))
      .filter((f) => existsSync(join(REPO_ROOT, f)))
      .flatMap((file) => {
        const bytes = readFileSync(join(REPO_ROOT, file));
        if (bytes.includes(0)) return []; // binary
        return findBrokenPointers(file, bytes.toString("utf8"), repoHeadings);
      });
    expect(found).toEqual([]);
  });
});
