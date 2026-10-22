import { describe, expect, test } from "vitest";
import { moveToDone } from "./board.ts";

const board = `# Board

## In review

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-004 | Root tooling | 0 | lint passes |

## Backlog

| ID | Task | Phase | Acceptance criteria |
|---|---|---|---|
| GW-006 | CI workflow | 0 | runs on PRs |

## Done

| ID | Task | Phase | Completed |
|---|---|---|---|
| GW-001 | Repo skeleton | 0 | 2026-10-21 |
`;

describe("moveToDone", () => {
  test("moves rows from any column to the end of Done, with the date", () => {
    const result = moveToDone(board, ["GW-004", "GW-006"], "2026-10-22");

    expect(result.moved).toEqual(["GW-004", "GW-006"]);
    expect(result.text).not.toContain("lint passes");
    expect(result.text).toContain(
      [
        "| GW-001 | Repo skeleton | 0 | 2026-10-21 |",
        "| GW-004 | Root tooling | 0 | 2026-10-22 |",
        "| GW-006 | CI workflow | 0 | 2026-10-22 |",
      ].join("\n"),
    );
  });

  test("leaves tasks already in Done untouched", () => {
    const result = moveToDone(board, ["GW-001"], "2026-10-22");

    expect(result.alreadyDone).toEqual(["GW-001"]);
    expect(result.text).toBe(board);
  });

  test("reports IDs not on the board", () => {
    const result = moveToDone(board, ["GW-999"], "2026-10-22");

    expect(result.missing).toEqual(["GW-999"]);
    expect(result.text).toBe(board);
  });

  test("fails when the board has no Done section", () => {
    expect(() => moveToDone("| GW-004 | x | 0 | y |", ["GW-004"], "2026-10-22")).toThrow(
      /no "## Done"/,
    );
  });
});
