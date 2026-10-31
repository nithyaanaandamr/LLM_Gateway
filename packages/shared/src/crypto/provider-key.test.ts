import { randomBytes, randomUUID } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { ProviderKeyDecryptError, UnknownMasterKeyVersionError } from "./errors.ts";
import { parseMasterKey, type MasterKey } from "./master-key.ts";
import {
  decryptProviderKey,
  encryptProviderKey,
  type EncryptedProviderKey,
} from "./provider-key.ts";

const makeKey = (version: number): MasterKey =>
  parseMasterKey({ version, base64: randomBytes(32).toString("base64") });

const PLAINTEXT = "sk-test-abc123";

function setup(plaintext = PLAINTEXT) {
  const masterKey = makeKey(1);
  const projectId = randomUUID();
  const encrypted = encryptProviderKey({ plaintext, projectId, masterKey });
  const decrypt = (overrides: Partial<Parameters<typeof decryptProviderKey>[0]> = {}) =>
    decryptProviderKey({ encrypted, projectId, masterKeys: [masterKey], ...overrides });
  return { masterKey, projectId, encrypted, decrypt };
}

// Copy of a buffer with its first bit flipped
function flipped(buf: Buffer): Buffer {
  const copy = Buffer.from(buf);
  copy[0] = (copy[0] ?? 0) ^ 1;
  return copy;
}

describe("round trip", () => {
  it.each([PLAINTEXT, "ключ-🔑"])("returns %s unchanged", (plaintext) => {
    expect(setup(plaintext).decrypt()).toBe(plaintext);
  });
});

describe("encrypted shape", () => {
  it("has the expected sizes and hides the plaintext", () => {
    const { encrypted } = setup();
    const plainBytes = Buffer.from(PLAINTEXT, "utf8");
    expect(encrypted.nonce.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);
    expect(encrypted.masterKeyVersion).toBe(1);
    expect(encrypted.ciphertext.length).toBe(plainBytes.length);
    expect(encrypted.ciphertext.includes(plainBytes)).toBe(false);
  });
});

describe("freshness", () => {
  it("same input twice gives different nonce and ciphertext", () => {
    const masterKey = makeKey(1);
    const projectId = randomUUID();
    const a = encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey });
    const b = encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey });
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("1,000 encryptions give 1,000 distinct nonces", () => {
    const masterKey = makeKey(1);
    const projectId = randomUUID();
    const nonces = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      nonces.add(
        encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey }).nonce.toString("hex"),
      );
    }
    expect(nonces.size).toBe(1000);
  });
});

describe("wrong project", () => {
  it("fails with another project's ID", () => {
    const { decrypt } = setup();
    expect(() => decrypt({ projectId: randomUUID() })).toThrow(ProviderKeyDecryptError);
  });
});

describe("tampering", () => {
  it.each(["ciphertext", "authTag", "nonce"] as const)(
    "fails when %s has a flipped bit",
    (field) => {
      const { encrypted, decrypt } = setup();
      const tampered: EncryptedProviderKey = { ...encrypted, [field]: flipped(encrypted[field]) };
      expect(() => decrypt({ encrypted: tampered })).toThrow(ProviderKeyDecryptError);
    },
  );
});

describe("wrong stored lengths", () => {
  it.each([4, 12])("rejects an auth tag cut to %i bytes", (length) => {
    const { encrypted, decrypt } = setup();
    const short = { ...encrypted, authTag: encrypted.authTag.subarray(0, length) };
    expect(() => decrypt({ encrypted: short })).toThrow(ProviderKeyDecryptError);
  });

  it.each([11, 13])("rejects a nonce of %i bytes", (length) => {
    const { encrypted, decrypt } = setup();
    const nonce = Buffer.concat([encrypted.nonce, Buffer.alloc(2)]).subarray(0, length);
    expect(() => decrypt({ encrypted: { ...encrypted, nonce } })).toThrow(ProviderKeyDecryptError);
  });
});

describe("master keys", () => {
  it("fails with a different key of the same version", () => {
    const { decrypt } = setup();
    expect(() => decrypt({ masterKeys: [makeKey(1)] })).toThrow(ProviderKeyDecryptError);
  });

  it("picks the key by version, whatever the list order", () => {
    const projectId = randomUUID();
    const [v1, v2] = [makeKey(1), makeKey(2)] as const;
    const withV1 = encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey: v1 });
    const withV2 = encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey: v2 });
    expect(decryptProviderKey({ encrypted: withV1, projectId, masterKeys: [v2, v1] })).toBe(
      PLAINTEXT,
    );
    expect(decryptProviderKey({ encrypted: withV2, projectId, masterKeys: [v1, v2] })).toBe(
      PLAINTEXT,
    );
  });

  it("throws UnknownMasterKeyVersionError when the version is not loaded", () => {
    const { decrypt } = setup();
    const error = (() => {
      try {
        decrypt({ masterKeys: [makeKey(2)] });
      } catch (err) {
        return err;
      }
    })();
    expect(error).toBeInstanceOf(UnknownMasterKeyVersionError);
    expect((error as UnknownMasterKeyVersionError).version).toBe(1);
  });

  it("throws UnknownMasterKeyVersionError for an empty key list", () => {
    const { decrypt } = setup();
    expect(() => decrypt({ masterKeys: [] })).toThrow(UnknownMasterKeyVersionError);
  });

  it("fails when the row's version is changed to another loaded version", () => {
    const { encrypted, masterKey, decrypt } = setup();
    const changed = { ...encrypted, masterKeyVersion: 2 };
    expect(() => decrypt({ encrypted: changed, masterKeys: [masterKey, makeKey(2)] })).toThrow(
      ProviderKeyDecryptError,
    );
  });
});

describe("bad input", () => {
  it("rejects empty plaintext", () => {
    expect(() =>
      encryptProviderKey({ plaintext: "", projectId: randomUUID(), masterKey: makeKey(1) }),
    ).toThrow(TypeError);
  });

  it("rejects plaintext with a lone surrogate", () => {
    const args = { projectId: randomUUID(), masterKey: makeKey(1) };
    expect(() => encryptProviderKey({ plaintext: "sk-\ud800", ...args })).toThrow(
      "plaintext must be well-formed text",
    );
    expect(() => encryptProviderKey({ plaintext: "sk-\ud800", ...args })).toThrow(TypeError);
  });

  const upper = randomUUID().toUpperCase();
  const noDashes = randomUUID().replaceAll("-", "");
  it.each([upper, noDashes, "", "not-a-uuid", `{${randomUUID()}}`])(
    "rejects project ID %j on encrypt and decrypt",
    (projectId) => {
      const { encrypted, masterKey } = setup();
      expect(() => encryptProviderKey({ plaintext: PLAINTEXT, projectId, masterKey })).toThrow(
        TypeError,
      );
      expect(() => decryptProviderKey({ encrypted, projectId, masterKeys: [masterKey] })).toThrow(
        TypeError,
      );
    },
  );
});

describe("no leaks", () => {
  it("failed decrypt errors do not contain the plaintext", () => {
    const secret = "sk-very-secret-value-123";
    const { decrypt } = setup(secret);
    let caught: unknown;
    try {
      decrypt({ projectId: randomUUID() });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProviderKeyDecryptError);
    expect(String(caught)).not.toContain(secret);
    expect(inspect(caught)).not.toContain(secret);
  });
});

describe("format stability", () => {
  // Rows already in the DB must stay readable. If this fails, the stored format changed.
  // test-only key, not a secret
  const TEST_ONLY_MASTER_KEY = "W2UwdUGcmgR3g/nFp9geDzTQsE2wCBH8aV9wl6y8pUc=";

  it("decrypts a row produced by an earlier version", () => {
    const masterKey = parseMasterKey({ version: 1, base64: TEST_ONLY_MASTER_KEY });
    const encrypted: EncryptedProviderKey = {
      ciphertext: Buffer.from("bee06d7bbca71d6ca86ccc4391440717fcd12fb3ae", "hex"),
      nonce: Buffer.from("01ae923e41caa8b8d5c852a4", "hex"),
      authTag: Buffer.from("624a2ee5bc2c76eac59bd606ca21227c", "hex"),
      masterKeyVersion: 1,
    };
    const projectId = "3f0c2a9e-6b1d-4c58-9a47-2d8e5f1b7c06";
    expect(decryptProviderKey({ encrypted, projectId, masterKeys: [masterKey] })).toBe(
      "sk-fixture-0123456789",
    );
  });
});
