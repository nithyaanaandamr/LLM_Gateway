import { upsertProviderKey, type Database, type Project, type ProviderKeySummary } from "@gw/db";
import { encryptProviderKey, type MasterKey } from "@gw/shared/crypto";
import type { z } from "zod";
import type { providerKeyBody } from "./provider-key-schemas.ts";

// Last four characters (code points, so an emoji is never cut in half)
function lastFour(key: string): string {
  return Array.from(key).slice(-4).join("");
}

// Encrypts with the project's database ID as AAD, then stores the bytes and the last four.
// `project` comes from the project scope: its id is lowercase, as the AAD requires.
// see PITFALLS.md: Provider key bound to its project
export function storeProviderKey(
  db: Database,
  masterKey: MasterKey,
  project: Project,
  { provider, key }: z.infer<typeof providerKeyBody>,
): Promise<ProviderKeySummary> {
  const encrypted = encryptProviderKey({ plaintext: key, projectId: project.id, masterKey });
  return upsertProviderKey(db, {
    projectId: project.id,
    provider,
    encrypted,
    lastFour: lastFour(key),
  });
}
