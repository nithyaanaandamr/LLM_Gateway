import { describe, expect, test } from "vitest";
import { taskIds } from "./task-ids.ts";

describe("taskIds", () => {
  test("finds every ID in a multi-task title", () => {
    expect(taskIds("GW-003, GW-004, GW-005: Toolchain")).toEqual(["GW-003", "GW-004", "GW-005"]);
  });

  test("drops duplicates", () => {
    expect(taskIds("GW-011: follow-up to GW-011")).toEqual(["GW-011"]);
  });

  test("returns nothing when the title has no ID", () => {
    expect(taskIds("Fix typo")).toEqual([]);
  });

  test("ignores look-alikes", () => {
    expect(taskIds("XGW-001 and GW-01")).toEqual([]);
  });
});
