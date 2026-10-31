import { describe, expect, it } from "vitest";
import { generateGatewayKey, hashGatewayKey, isGatewayKey } from "./gateway-key.ts";

const HEX64 = "a1b2c3d4".repeat(8);
const ZERO_KEY = "gw_live_" + "0".repeat(64);

describe("generateGatewayKey", () => {
  it("returns a well-formed key, prefix and hash", () => {
    const { key, keyPrefix, keyHash } = generateGatewayKey();
    expect(isGatewayKey(key)).toBe(true);
    expect(key).toHaveLength(72);
    expect(key.startsWith("gw_live_")).toBe(true);
    expect(keyPrefix).toBe(key.slice(0, 12));
    expect(keyPrefix).toHaveLength(12);
    expect(keyHash).toHaveLength(32);
    expect(keyHash.equals(hashGatewayKey(key))).toBe(true);
  });

  it("makes 1,000 different keys", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 1000; i++) keys.add(generateGatewayKey().key);
    expect(keys.size).toBe(1000);
  });
});

describe("hashGatewayKey", () => {
  it("matches an independent SHA-256 (printf %s … | shasum -a 256)", () => {
    expect(hashGatewayKey(ZERO_KEY).toString("hex")).toBe(
      "7af7ff73b5eeb48bce4aa504444c32f159e989f4fae7a1aafc5dda26a459b319",
    );
  });

  it("is stable for the same key and differs for a one-char change", () => {
    const other = "gw_live_" + "0".repeat(63) + "1";
    expect(hashGatewayKey(ZERO_KEY).equals(hashGatewayKey(ZERO_KEY))).toBe(true);
    expect(hashGatewayKey(ZERO_KEY).equals(hashGatewayKey(other))).toBe(false);
  });

  it("throws TypeError for an invalid key without echoing it", () => {
    const bad = "gw_live_secret-looking-but-wrong";
    let caught: unknown;
    try {
      hashGatewayKey(bad);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TypeError);
    expect(String(caught)).not.toContain(bad);
  });
});

describe("isGatewayKey", () => {
  it("accepts a valid key", () => {
    expect(isGatewayKey("gw_live_" + HEX64)).toBe(true);
  });

  const rejected: [string, string][] = [
    ["empty string", ""],
    ["prefix only", "gw_live_"],
    ["63 hex chars", "gw_live_" + HEX64.slice(1)],
    ["65 hex chars", "gw_live_" + HEX64 + "a"],
    ["gw_test_ prefix", "gw_test_" + HEX64],
    ["uppercase prefix", "GW_LIVE_" + HEX64],
    ["uppercase hex", "gw_live_" + HEX64.toUpperCase()],
    ["a non-hex g", "gw_live_" + "g" + HEX64.slice(1)],
    ["leading space", " gw_live_" + HEX64],
    ["trailing space", "gw_live_" + HEX64 + " "],
    ["trailing newline", "gw_live_" + HEX64 + "\n"],
    ["Bearer header", "Bearer gw_live_" + HEX64],
    ["full-width digit", "gw_live_" + "０" + HEX64.slice(1)],
    ["Arabic-Indic digit", "gw_live_" + "٠" + HEX64.slice(1)],
  ];

  it.each(rejected)("rejects %s", (_name, value) => {
    expect(isGatewayKey(value)).toBe(false);
  });

  it("rejects non-strings that coerce to a valid key", () => {
    const key = "gw_live_" + HEX64;
    expect(isGatewayKey([key] as unknown as string)).toBe(false);
    expect(isGatewayKey(new String(key) as unknown as string)).toBe(false);
  });
});
