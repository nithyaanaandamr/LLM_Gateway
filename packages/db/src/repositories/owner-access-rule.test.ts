import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Only these two files may name the owner column: project-access.ts decides access,
// insert-project.ts writes it. Apps never see it.
// see PITFALLS.md: Project access goes through one condition
const ALLOWED = [
  "packages/db/src/repositories/insert-project.ts",
  "packages/db/src/repositories/project-access.ts",
];
const OWNER = /ownerId|owner_id/;
const REPO_ROOT = join(import.meta.dirname, "../../../..");
const SCANNED = ["packages/db/src", "apps/admin-api/src"];
// The schema defines the column; tests and test helpers set up data
const SKIPPED_DIRS = new Set(["schema", "testing"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("owner_id stays out of the code", () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(join(REPO_ROOT, dir)));

  it("scans real files (a wrong path cannot make the rule pass by finding nothing)", () => {
    const relativePaths = files.map((file) => relative(REPO_ROOT, file));
    expect(relativePaths).toEqual(expect.arrayContaining(ALLOWED));
    expect(relativePaths).toContain("apps/admin-api/src/app.ts");
    expect(relativePaths).not.toContain("packages/db/src/schema/app.ts");
  });

  it("is named only in project-access.ts and insert-project.ts", () => {
    const naming = files
      .filter((file) => OWNER.test(readFileSync(file, "utf8")))
      .map((file) => relative(REPO_ROOT, file));
    expect(naming.sort()).toEqual(ALLOWED);
  });
});
