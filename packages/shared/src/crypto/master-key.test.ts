import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { InvalidMasterKeyError } from "./errors.ts";
import { parseMasterKey } from "./master-key.ts";

const validBase64 = () => randomBytes(32).toString("base64");
const parse = (base64: string, version = 1) => parseMasterKey({ version, base64 });

describe("parseMasterKey: valid input", () => {
  it("returns the version and a 32-byte secret KeyObject", () => {
    const result = parse(validBase64(), 7);
    expect(result.version).toBe(7);
    expect(result.key.type).toBe("secret");
    expect(result.key.symmetricKeySize).toBe(32);
  });
});

describe("parseMasterKey: wrong length", () => {
  it.each([16, 31, 33, 64])("rejects base64 of %i bytes", (bytes) => {
    const base64 = randomBytes(bytes).toString("base64");
    expect(() => parse(base64)).toThrow(InvalidMasterKeyError);
  });
});

describe("parseMasterKey: bad text", () => {
  const key = validBase64();
  const cases: [string, string][] = [
    ["empty string", ""],
    ["one char replaced by !", "!" + key.slice(1)],
    ["one char replaced by $", key.slice(0, 10) + "$" + key.slice(11)],
    ["base64url alphabet", "-_".repeat(21) + "-="],
    ["missing =", key.slice(0, 43)],
    ["leading space", ` ${key}`],
    ["trailing space", `${key} `],
    ["trailing newline", `${key}\n`],
  ];

  it.each(cases)("rejects %s", (_name, input) => {
    expect(() => parse(input)).toThrow(InvalidMasterKeyError);
  });

  it("rejects base64url made from a real key with + and / swapped", () => {
    // Find a key whose base64 has + or /, then swap them for - and _
    let base64 = validBase64();
    while (!/[+/]/.test(base64)) base64 = validBase64();
    const url = base64.replaceAll("+", "-").replaceAll("/", "_");
    expect(() => parse(url)).toThrow(InvalidMasterKeyError);
  });
});

describe("parseMasterKey: non-canonical spelling", () => {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  it("rejects the other spellings of the same 32 bytes", () => {
    const base64 = validBase64();
    const last = ALPHABET.indexOf(base64[42] as string);
    const top4 = last & 0b111100; // only these bits of the last char are used
    const others = [0, 1, 2, 3].map((low) => ALPHABET[top4 | low] as string);
    expect(others).toContain(base64[42]);
    for (const char of others) {
      const spelling = base64.slice(0, 42) + char + "=";
      if (char === base64[42]) {
        expect(parse(spelling).key.symmetricKeySize).toBe(32);
      } else {
        expect(Buffer.from(spelling, "base64").equals(Buffer.from(base64, "base64"))).toBe(true);
        expect(() => parse(spelling)).toThrow(InvalidMasterKeyError);
      }
    }
  });
});

describe("parseMasterKey: version", () => {
  it.each([0, -1, 1.5, 32768, NaN])("rejects version %s", (version) => {
    expect(() => parse(validBase64(), version)).toThrow(InvalidMasterKeyError);
  });

  it.each([1, 32767])("accepts version %i", (version) => {
    expect(parse(validBase64(), version).version).toBe(version);
  });
});

describe("parseMasterKey: no leaks", () => {
  it("error text never contains the input", () => {
    const bad = randomBytes(31).toString("base64");
    let caught: unknown;
    try {
      parse(bad);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InvalidMasterKeyError);
    expect(String(caught)).not.toContain(bad);
    expect(inspect(caught)).not.toContain(bad);
  });

  it("inspect and JSON.stringify of the result hide the key", () => {
    const bytes = randomBytes(32);
    const base64 = bytes.toString("base64");
    const result = parse(base64);
    for (const text of [inspect(result), JSON.stringify(result)]) {
      expect(text).not.toContain(base64);
      expect(text).not.toContain(bytes.toString("hex"));
    }
  });
});
