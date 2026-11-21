import type { GatewayKeySummary } from "@gw/db";
import { z } from "zod";
import { projectName } from "../projects/project-schemas.ts";

// Exact cap on active (not revoked) keys, counted and inserted under a per-project lock
// see PITFALLS.md: Limits are counted under a lock
export const MAX_ACTIVE_GATEWAY_KEYS = 20;

// Same rule as project names (trim, NFC, no control or bidi characters, 1 to 100):
// the DB CHECK is the same, and a NUL character would otherwise be a Postgres 500.
export const gatewayKeyName = projectName;

// Strict: unknown keys (projectId, keyHash, ...) are a 400, not silently ignored
export const gatewayKeyBody = z.strictObject({ name: gatewayKeyName });

export const gatewayKeyParams = z.object({ projectId: z.string(), keyId: z.uuid() });

// Only these fields leave the API; the serializer drops the rest of the row
export const gatewayKeyResponse = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  createdAt: z.date(),
  revokedAt: z.date().nullable(),
});

export const gatewayKeyListResponse = z.object({ gatewayKeys: z.array(gatewayKeyResponse) });

// The full key is in this response and nowhere else
// see PITFALLS.md: A gateway key is shown once
export const issueGatewayKeyResponse = z.object({
  key: z.string(),
  gatewayKey: gatewayKeyResponse,
});

export function toGatewayKeyResponse(key: GatewayKeySummary): z.infer<typeof gatewayKeyResponse> {
  const { id, name, keyPrefix, createdAt, revokedAt } = key;
  return { id, name, keyPrefix, createdAt, revokedAt };
}
