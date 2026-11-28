import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

// Node flags in `start`: everything between `node` and the entry file
function startFlags(): string[] {
  const pkg = JSON.parse(readFileSync(`${APP_DIR}/package.json`, "utf8")) as {
    scripts: { start: string };
  };
  const words = pkg.scripts.start.split(/\s+/);
  expect(words[0]).toBe("node");
  return words.slice(1, -1);
}

// Runs built code with the start flags; loadConfig({}) throws on purpose
function stackFromBuiltCode(): string {
  const script = 'import("./dist/config.js").then((m) => m.loadConfig({}))';
  const result = spawnSync(
    process.execPath,
    [...startFlags(), "--input-type=module", "-e", script],
    // Only PATH: an inherited NODE_OPTIONS could enable source maps and hide a missing flag
    { cwd: APP_DIR, encoding: "utf8", env: { PATH: process.env.PATH ?? "" } },
  );
  return result.stderr;
}

// see PITFALLS.md: Source maps need the flag and the .map files
describe("source maps", { timeout: 15_000 }, () => {
  it("a stack trace from built code points at .ts lines", () => {
    expect(stackFromBuiltCode()).toContain("src/config.ts:");
  });
});
