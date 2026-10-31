import { createSecretKey, type KeyObject } from "node:crypto";
import { InvalidMasterKeyError } from "./errors.ts";

const MASTER_KEY_BYTES = 32;
const MAX_VERSION = 32767; // fits a Postgres smallint
const BASE64_32_BYTES = /^[A-Za-z0-9+/]{43}=$/;

// KeyObject, not Buffer: logging it prints nothing secret (see PITFALLS.md: Master key parsing)
export type MasterKey = { readonly version: number; readonly key: KeyObject };

export function parseMasterKey(input: { version: number; base64: string }): MasterKey {
  const { version, base64 } = input;

  if (!Number.isInteger(version) || version < 1 || version > MAX_VERSION) {
    throw new InvalidMasterKeyError("version must be an integer from 1 to 32767");
  }
  // Buffer.from ignores bad chars; see PITFALLS.md: Master key parsing
  if (!BASE64_32_BYTES.test(base64)) {
    throw new InvalidMasterKeyError("must be 44 base64 characters (32 bytes)");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length !== MASTER_KEY_BYTES) {
    throw new InvalidMasterKeyError("must decode to 32 bytes");
  }
  // The last char has 2 unused bits; re-encoding allows only the canonical spelling
  if (bytes.toString("base64") !== base64) {
    throw new InvalidMasterKeyError("must be canonical base64");
  }
  return { version, key: createSecretKey(bytes) };
}
