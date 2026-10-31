import { createHash, randomBytes } from "node:crypto";

const GATEWAY_KEY_RANDOM_BYTES = 32;
// see PITFALLS.md: Gateway key format
const GATEWAY_KEY_PATTERN = /^gw_live_[0-9a-f]{64}$/;

export const GATEWAY_KEY_PREFIX = "gw_live_";
export const GATEWAY_KEY_DISPLAY_LENGTH = 12;

export type GeneratedGatewayKey = {
  readonly key: string; // show once, never store or log
  readonly keyHash: Buffer; // 32 bytes -> key_hash
  readonly keyPrefix: string; // first 12 chars -> key_prefix
};

export function isGatewayKey(value: string): boolean {
  // typeof first: RegExp.test coerces arrays and String objects
  return typeof value === "string" && GATEWAY_KEY_PATTERN.test(value);
}

export function hashGatewayKey(key: string): Buffer {
  // Never put the value in the message
  if (!isGatewayKey(key)) throw new TypeError("not a gateway key");
  return createHash("sha256").update(key, "utf8").digest();
}

export function generateGatewayKey(): GeneratedGatewayKey {
  const key = GATEWAY_KEY_PREFIX + randomBytes(GATEWAY_KEY_RANDOM_BYTES).toString("hex");
  return {
    key,
    keyHash: hashGatewayKey(key),
    keyPrefix: key.slice(0, GATEWAY_KEY_DISPLAY_LENGTH),
  };
}
