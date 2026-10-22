import { describe, expect, test } from "vitest";
import { markDone } from "./sprint.ts";

const sprint = `## Scope

| ID | Task | Status |
|---|---|---|
| GW-001 | Repo skeleton | Done |
| GW-010 | Finalise roadmap | Open |
`;

describe("markDone", () => {
  test("sets Status to Done for the given tasks", () => {
    const result = markDone(sprint, ["GW-010"]);

    expect(result.marked).toEqual(["GW-010"]);
    expect(result.text).toContain("| GW-010 | Finalise roadmap | Done |");
  });

  test("skips tasks already Done or not in scope", () => {
    const result = markDone(sprint, ["GW-001", "GW-999"]);

    expect(result.marked).toEqual([]);
    expect(result.text).toBe(sprint);
  });
});
