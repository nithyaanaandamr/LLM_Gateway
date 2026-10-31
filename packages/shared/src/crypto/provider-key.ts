import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ProviderKeyDecryptError, UnknownMasterKeyVersionError } from "./errors.ts";
import type { MasterKey } from "./master-key.ts";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Field names match the DB columns in camelCase
export type EncryptedProviderKey = {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer; // 12 bytes
  readonly authTag: Buffer; // 16 bytes
  readonly masterKeyVersion: number;
};

// String.prototype.isWellFormed needs lib ES2024 (repo target is ES2023). A lone surrogate
// is silently turned into U+FFFD by UTF-8, so a round trip that changes the text finds it.
function isWellFormed(text: string): boolean {
  return Buffer.from(text, "utf8").toString("utf8") === text;
}

function projectIdToAad(projectId: string): Buffer {
  // see PITFALLS.md: Project ID as AAD must be canonical
  if (!CANONICAL_UUID.test(projectId)) {
    throw new TypeError("projectId must be a lowercase UUID");
  }
  return Buffer.from(projectId, "utf8");
}

function findMasterKey(masterKeys: readonly MasterKey[], version: number): MasterKey {
  const found = masterKeys.find((k) => k.version === version);
  if (found === undefined) throw new UnknownMasterKeyVersionError(version);
  return found;
}

function assertStoredLengths(encrypted: EncryptedProviderKey): void {
  // see PITFALLS.md: AES-GCM short auth tags
  if (encrypted.nonce.length !== NONCE_BYTES || encrypted.authTag.length !== AUTH_TAG_BYTES) {
    throw new ProviderKeyDecryptError();
  }
}

export function encryptProviderKey(input: {
  plaintext: string;
  projectId: string;
  masterKey: MasterKey;
}): EncryptedProviderKey {
  const { plaintext, projectId, masterKey } = input;
  if (plaintext === "") throw new TypeError("plaintext must not be empty");
  if (!isWellFormed(plaintext)) throw new TypeError("plaintext must be well-formed text");
  const aad = projectIdToAad(projectId);

  // Fresh nonce every call; see PITFALLS.md: AES-GCM nonce reuse
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey.key, nonce, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, nonce, authTag, masterKeyVersion: masterKey.version };
}

export function decryptProviderKey(input: {
  encrypted: EncryptedProviderKey;
  projectId: string;
  masterKeys: readonly MasterKey[];
}): string {
  const { encrypted, projectId, masterKeys } = input;
  const aad = projectIdToAad(projectId);
  const { key } = findMasterKey(masterKeys, encrypted.masterKeyVersion);
  assertStoredLengths(encrypted);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, encrypted.nonce, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(encrypted.authTag);
    return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString(
      "utf8",
    );
  } catch (cause) {
    throw new ProviderKeyDecryptError({ cause });
  }
}
