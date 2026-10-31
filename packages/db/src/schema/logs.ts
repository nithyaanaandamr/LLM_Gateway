// Log tables (ADR 0007). Not exported from @gw/db: only the future LogStore uses them.
// No foreign keys to app (see PITFALLS.md: No foreign keys into the logs schema).
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { isOneOf } from "./columns.ts";
import { logsSchema } from "./postgres-schemas.ts";

export const OUTCOMES = [
  "success",
  "blocked",
  "provider_error",
  "gateway_error",
  "client_disconnected",
] as const;

// From data-model.md "Reasons"
export const REASONS = [
  "rate_limit_requests",
  "rate_limit_tokens",
  "in_flight_limit",
  "budget_cap_reached",
  "budget_reservation_exceeded",
  "input_too_large",
  "provider_auth_failed",
  "provider_rate_limited",
  "provider_bad_request",
  "provider_server_error",
  "provider_timeout",
  "provider_key_unreadable",
  "internal",
] as const;

export const USAGE_SOURCES = ["provider", "estimated", "none"] as const;

export const requestLogs = logsSchema.table(
  "request_logs",
  {
    // UUID v7 from the gateway (see PITFALLS.md: UUID v7 for request logs)
    requestId: uuid("request_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    projectId: uuid("project_id").notNull(),
    gatewayKeyId: uuid("gateway_key_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    streamed: boolean("streamed").notNull(),
    outcome: text("outcome", { enum: OUTCOMES }).notNull(),
    reason: text("reason", { enum: REASONS }),
    statusCode: smallint("status_code").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    usageSource: text("usage_source", { enum: USAGE_SOURCES }).notNull(),
    // Nano-dollars as JS bigint (see PITFALLS.md: Money in nano-dollars, Drizzle column gotchas)
    inputCostNanos: bigint("input_cost_nanos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    outputCostNanos: bigint("output_cost_nanos", { mode: "bigint" })
      .notNull()
      .default(sql`0`),
    durationMs: integer("duration_ms").notNull(),
    ttftMs: integer("ttft_ms"),
    gatewayOverheadMs: integer("gateway_overhead_ms").notNull(),
  },
  (table) => [
    // started_at in the key keeps it partition-ready (see PITFALLS.md: Log job retries)
    primaryKey({ columns: [table.requestId, table.startedAt] }),
    index("request_logs_project_id_started_at_idx").on(
      table.projectId,
      table.startedAt.desc().nullsFirst(),
    ),
    index("request_logs_started_at_brin_idx").using("brin", table.startedAt),
    check("request_logs_outcome_check", isOneOf(table.outcome, OUTCOMES)),
    // NULL passes: `NULL in (…)` is not false
    check("request_logs_reason_check", isOneOf(table.reason, REASONS)),
    check(
      "request_logs_reason_required_check",
      sql`${table.outcome} in ('success', 'client_disconnected') or ${table.reason} is not null`,
    ),
    check("request_logs_usage_source_check", isOneOf(table.usageSource, USAGE_SOURCES)),
  ],
);

// Rebuilt from request_logs, never incremented (see PITFALLS.md: Log job retries)
export const usageHourly = logsSchema.table(
  "usage_hourly",
  {
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    projectId: uuid("project_id").notNull(),
    gatewayKeyId: uuid("gateway_key_id").notNull(),
    model: text("model").notNull(),
    requestCount: integer("request_count").notNull(),
    errorCount: integer("error_count").notNull(),
    blockedCount: integer("blocked_count").notNull(),
    inputTokens: bigint("input_tokens", { mode: "number" }).notNull(),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }).notNull(),
    outputTokens: bigint("output_tokens", { mode: "number" }).notNull(),
    inputCostNanos: bigint("input_cost_nanos", { mode: "bigint" }).notNull(),
    outputCostNanos: bigint("output_cost_nanos", { mode: "bigint" }).notNull(),
    durationMsSum: bigint("duration_ms_sum", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.hour, table.gatewayKeyId, table.model] }),
  ],
);
