import { eq } from "drizzle-orm";
import { toDrizzle, type Database } from "../client.ts";
import { PROVIDERS, providerKeys } from "../schema/index.ts";

export type Provider = (typeof PROVIDERS)[number];

// The only columns the admin API ever reads back. ciphertext, nonce and auth_tag are never selected.
// see PITFALLS.md: The admin API never reads a provider key back
export type ProviderKeySummary = Pick<
  typeof providerKeys.$inferSelect,
  "provider" | "lastFour" | "createdAt" | "updatedAt"
>;

// The encrypted bytes, shaped like EncryptedProviderKey in @gw/shared (this package never encrypts)
export type EncryptedKeyColumns = {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
  masterKeyVersion: number;
};

export type UpsertProviderKeyInput = {
  projectId: string;
  provider: Provider;
  encrypted: EncryptedKeyColumns;
  lastFour: string;
};

const SUMMARY_COLUMNS = {
  provider: providerKeys.provider,
  lastFour: providerKeys.lastFour,
  createdAt: providerKeys.createdAt,
  updatedAt: providerKeys.updatedAt,
};

// One atomic statement: parallel PUTs can't race into a unique violation. A replace keeps the
// row's id and created_at; updated_at is set by Drizzle (see PITFALLS.md: updated_at is set by Drizzle).
// Pass the project ID from the project scope, never from the URL.
export async function upsertProviderKey(
  db: Database,
  { projectId, provider, encrypted, lastFour }: UpsertProviderKeyInput,
): Promise<ProviderKeySummary> {
  const columns = { provider, lastFour, ...encrypted };
  const [summary] = await toDrizzle(db)
    .insert(providerKeys)
    .values({ projectId, ...columns })
    .onConflictDoUpdate({ target: providerKeys.projectId, set: columns })
    .returning(SUMMARY_COLUMNS);
  if (!summary) throw new Error("upsert into provider_keys returned no row");
  return summary;
}

export async function findProviderKeySummary(
  db: Database,
  projectId: string,
): Promise<ProviderKeySummary | undefined> {
  const [summary] = await toDrizzle(db)
    .select(SUMMARY_COLUMNS)
    .from(providerKeys)
    .where(eq(providerKeys.projectId, projectId));
  return summary;
}

// True if a row was deleted; false if the project had no key
export async function deleteProviderKey(db: Database, projectId: string): Promise<boolean> {
  const deleted = await toDrizzle(db)
    .delete(providerKeys)
    .where(eq(providerKeys.projectId, projectId))
    .returning({ id: providerKeys.id });
  return deleted.length > 0;
}
