// Attacker-style tests: forgery, tampering, randomness and key-format edge cases
import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderKeyDecryptError } from "./errors.ts";
import { generateGatewayKey, hashGatewayKey, isGatewayKey } from "./gateway-key.ts";
import { parseMasterKey } from "./master-key.ts";
import {
  decryptProviderKey,
  encryptProviderKey,
  type EncryptedProviderKey,
} from "./provider-key.ts";

const masterKey = parseMasterKey({ version: 1, base64: randomBytes(32).toString("base64") });
const PLAINTEXT = "sk-test-secret-0123456789";

function encryptFor(projectId: string, plaintext = PLAINTEXT) {
  return encryptProviderKey({ plaintext, projectId, masterKey });
}
function tryDecrypt(encrypted: EncryptedProviderKey, projectId: string) {
  return () => decryptProviderKey({ encrypted, projectId, masterKeys: [masterKey] });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider key forgery attempts", () => {
  const projectId = randomUUID();
  const row = encryptFor(projectId);

  it.each([0, 1, 4, 8, 15, 17, 32])("rejects an auth tag of %i bytes", (length) => {
    const authTag = Buffer.concat([row.authTag, Buffer.alloc(32)]).subarray(0, length);
    expect(tryDecrypt({ ...row, authTag }, projectId)).toThrow(ProviderKeyDecryptError);
  });

  it("rejects an all-zero 16-byte tag", () => {
    const forged = { ...row, authTag: Buffer.alloc(16) };
    expect(tryDecrypt(forged, projectId)).toThrow(ProviderKeyDecryptError);
  });

  it("rejects every single-bit flip in ciphertext, nonce and tag", () => {
    for (const field of ["ciphertext", "nonce", "authTag"] as const) {
      for (let bit = 0; bit < row[field].length * 8; bit++) {
        const copy = Buffer.from(row[field]);
        copy[bit >> 3] = (copy[bit >> 3] ?? 0) ^ (1 << (bit & 7));
        expect(tryDecrypt({ ...row, [field]: copy }, projectId)).toThrow(ProviderKeyDecryptError);
      }
    }
  });

  it("rejects a shortened, extended or emptied ciphertext", () => {
    const variants = [
      row.ciphertext.subarray(0, -1),
      Buffer.concat([row.ciphertext, Buffer.alloc(1)]),
      Buffer.alloc(0),
    ];
    for (const ciphertext of variants) {
      expect(tryDecrypt({ ...row, ciphertext }, projectId)).toThrow(ProviderKeyDecryptError);
    }
  });

  it("rejects rows moved between projects and mixed fields from two rows", () => {
    const otherId = randomUUID();
    const other = encryptFor(otherId, "sk-other-project-key");
    expect(tryDecrypt(row, otherId)).toThrow(ProviderKeyDecryptError);
    expect(tryDecrypt(other, projectId)).toThrow(ProviderKeyDecryptError);
    expect(tryDecrypt({ ...row, ciphertext: other.ciphertext }, projectId)).toThrow(
      ProviderKeyDecryptError,
    );
    expect(tryDecrypt({ ...row, authTag: other.authTag }, projectId)).toThrow(
      ProviderKeyDecryptError,
    );
  });

  it("emits no Node deprecation warning (DEP0182) on a short-tag attempt", async () => {
    const warnings: Error[] = [];
    const onWarning = (w: Error) => warnings.push(w);
    process.on("warning", onWarning);
    try {
      const short = { ...row, authTag: row.authTag.subarray(0, 4) };
      expect(tryDecrypt(short, projectId)).toThrow(ProviderKeyDecryptError);
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("warning", onWarning);
    }
    expect(warnings).toEqual([]);
  });
});

describe("randomness", () => {
  it("never uses Math.random", () => {
    vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random must not be used for secrets");
    });
    expect(() => generateGatewayKey()).not.toThrow();
    expect(() => encryptFor(randomUUID())).not.toThrow();
  });

  it("10,000 gateway keys: all valid, all distinct, every hex digit appears at every position", () => {
    const seen = new Set<string>();
    const digitsAt = Array.from({ length: 64 }, () => new Set<string>());
    for (let i = 0; i < 10_000; i++) {
      const { key, keyHash, keyPrefix } = generateGatewayKey();
      expect(isGatewayKey(key)).toBe(true);
      expect(key).toHaveLength(72);
      expect(keyPrefix).toBe(key.slice(0, 12));
      expect(keyHash.equals(hashGatewayKey(key))).toBe(true);
      seen.add(key);
      [...key.slice(8)].forEach((digit, pos) => digitsAt[pos]?.add(digit));
    }
    expect(seen.size).toBe(10_000);
    expect(digitsAt.every((digits) => digits.size === 16)).toBe(true);
  });
});

describe("gateway key has exactly one spelling", () => {
  const { key } = generateGatewayKey();
  const junk = ["\0", "\r", "\n", "\t", " ", "​", "﻿", " "];

  it("rejects junk inserted or substituted at any position", () => {
    for (let i = 0; i <= key.length; i++) {
      for (const j of junk) {
        expect(isGatewayKey(key.slice(0, i) + j + key.slice(i))).toBe(false);
        expect(isGatewayKey(key.slice(0, i) + j + key.slice(i + 1))).toBe(false);
      }
    }
  });
});
