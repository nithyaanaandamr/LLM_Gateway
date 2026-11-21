import { PROVIDERS, type ProviderKeySummary } from "@gw/db";
import { GATEWAY_KEY_PREFIX } from "@gw/shared/crypto";
import { z } from "zod";

const MIN_KEY_LENGTH = 20;
const MAX_KEY_LENGTH = 512;
const GATEWAY_KEY_MESSAGE = "This is a gateway key. Paste your provider's API key instead.";

// Not valid text: a control character (the key travels in an HTTP header, which can't carry one,
// so such a key could never work; NUL also makes Postgres refuse last_four) or a lone surrogate
// (the crypto helper refuses it). Both are a 400, not a 500. Inner spaces are fine.
// see PITFALLS.md: We don't check provider key formats
const NOT_VALID_TEXT = /[\p{Cc}\p{Surrogate}]/u;

// No provider format check: we trim, bound the length and refuse our own gateway keys.
// Every check runs on the trimmed value, which is what gets encrypted. Messages hold no input.
// see PITFALLS.md: We don't check provider key formats
export const providerKeyValue = z
  .string()
  .trim()
  .min(MIN_KEY_LENGTH)
  .max(MAX_KEY_LENGTH)
  .refine((key) => !key.startsWith(GATEWAY_KEY_PREFIX), GATEWAY_KEY_MESSAGE)
  .refine((key) => !NOT_VALID_TEXT.test(key), "must be valid text");

// Strict: unknown keys (projectId, lastFour, ...) are a 400, not silently ignored
export const providerKeyBody = z.strictObject({
  provider: z.enum(PROVIDERS),
  key: providerKeyValue,
});

// Only these fields leave the API; the serializer drops anything else
export const providerKeyResponse = z.object({
  provider: z.enum(PROVIDERS),
  lastFour: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export function toProviderKeyResponse(
  summary: ProviderKeySummary,
): z.infer<typeof providerKeyResponse> {
  const { provider, lastFour, createdAt, updatedAt } = summary;
  return { provider, lastFour, createdAt, updatedAt };
}
