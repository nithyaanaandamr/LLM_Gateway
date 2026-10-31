import { sql } from "drizzle-orm";
import { check, index, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth.ts";
import { bytea, isOneOf, timestamps } from "./columns.ts";
import { appSchema } from "./postgres-schemas.ts";

export const PROVIDERS = ["openai"] as const;

export const projects = appSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [
    // Also the index for "list my projects"
    unique("projects_owner_id_name_unique").on(table.ownerId, table.name),
    check("projects_name_length_check", sql`char_length(${table.name}) between 1 and 100`),
  ],
);

export const providerKeys = appSchema.table(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // One per project (data model: change to UNIQUE (project_id, provider) for a second provider)
    projectId: uuid("project_id")
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: PROVIDERS }).notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    nonce: bytea("nonce").notNull(),
    authTag: bytea("auth_tag").notNull(),
    masterKeyVersion: smallint("master_key_version").notNull().default(1),
    lastFour: text("last_four").notNull(),
    ...timestamps,
  },
  (table) => [
    check("provider_keys_provider_check", isOneOf(table.provider, PROVIDERS)),
    check("provider_keys_nonce_length_check", sql`octet_length(${table.nonce}) = 12`),
    check("provider_keys_auth_tag_length_check", sql`octet_length(${table.authTag}) = 16`),
  ],
);

export const gatewayKeys = appSchema.table(
  "gateway_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // SHA-256 of the full key; unique for the hot-path lookup
    keyHash: bytea("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    // NULL = active; revoked rows are kept (see PITFALLS.md: Cascades don't reach Redis)
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("gateway_keys_project_id_idx").on(table.projectId),
    check("gateway_keys_name_length_check", sql`char_length(${table.name}) between 1 and 100`),
    check("gateway_keys_key_hash_length_check", sql`octet_length(${table.keyHash}) = 32`),
  ],
);
