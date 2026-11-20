import { describe, expect, it } from "vitest";
import { trustedOrigins } from "./trusted-origins.ts";

describe("trustedOrigins", () => {
  it("returns the API origin and the dashboard origin", () => {
    const config = {
      authBaseUrl: "https://admin.example.com",
      dashboardOrigin: "https://app.example.com",
    };
    expect(trustedOrigins(config)).toEqual([
      "https://admin.example.com",
      "https://app.example.com",
    ]);
  });
});
