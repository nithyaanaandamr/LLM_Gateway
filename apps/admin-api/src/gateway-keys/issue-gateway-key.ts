import { insertGatewayKeyWithinLimit, type Database, type GatewayKeySummary } from "@gw/db";
import { generateGatewayKey } from "@gw/shared/crypto";
import { AppError } from "../errors.ts";
import { MAX_ACTIVE_GATEWAY_KEYS } from "./gateway-key-schemas.ts";

export type IssuedGatewayKey = {
  key: string; // the only copy: show once, never store or log
  gatewayKey: GatewayKeySummary;
};

// Makes the key first (the repository does no crypto, and the lock is held only for the
// count and the insert), stores the hash and prefix, and hands back the key once.
// projectId must come from getProject(request).id.
// see PITFALLS.md: A gateway key is shown once
export async function issueGatewayKey(
  db: Database,
  projectId: string,
  name: string,
): Promise<IssuedGatewayKey> {
  const { key, keyHash, keyPrefix } = generateGatewayKey();
  const result = await insertGatewayKeyWithinLimit(
    db,
    { projectId, name, keyHash, keyPrefix },
    MAX_ACTIVE_GATEWAY_KEYS,
  );
  if (result.status === "limit_reached") {
    throw new AppError(
      409,
      "CONFLICT",
      `Active gateway key limit reached (${MAX_ACTIVE_GATEWAY_KEYS})`,
    );
  }
  return { key, gatewayKey: result.gatewayKey };
}
