CREATE TABLE "app"."gateway_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"key_prefix" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gateway_keys_key_hash_unique" UNIQUE("key_hash"),
	CONSTRAINT "gateway_keys_name_length_check" CHECK (char_length("app"."gateway_keys"."name") between 1 and 100),
	CONSTRAINT "gateway_keys_key_hash_length_check" CHECK (octet_length("app"."gateway_keys"."key_hash") = 32)
);
--> statement-breakpoint
CREATE TABLE "app"."projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_owner_id_name_unique" UNIQUE("owner_id","name"),
	CONSTRAINT "projects_name_length_check" CHECK (char_length("app"."projects"."name") between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "app"."provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"nonce" "bytea" NOT NULL,
	"auth_tag" "bytea" NOT NULL,
	"master_key_version" smallint DEFAULT 1 NOT NULL,
	"last_four" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_keys_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "provider_keys_provider_check" CHECK ("app"."provider_keys"."provider" in ('openai')),
	CONSTRAINT "provider_keys_nonce_length_check" CHECK (octet_length("app"."provider_keys"."nonce") = 12),
	CONSTRAINT "provider_keys_auth_tag_length_check" CHECK (octet_length("app"."provider_keys"."auth_tag") = 16)
);
--> statement-breakpoint
CREATE TABLE "auth"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs"."request_logs" (
	"request_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"gateway_key_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"streamed" boolean NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"status_code" smallint NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"usage_source" text NOT NULL,
	"input_cost_nanos" bigint DEFAULT 0 NOT NULL,
	"output_cost_nanos" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer NOT NULL,
	"ttft_ms" integer,
	"gateway_overhead_ms" integer NOT NULL,
	CONSTRAINT "request_logs_request_id_started_at_pk" PRIMARY KEY("request_id","started_at"),
	CONSTRAINT "request_logs_outcome_check" CHECK ("logs"."request_logs"."outcome" in ('success', 'blocked', 'provider_error', 'gateway_error', 'client_disconnected')),
	CONSTRAINT "request_logs_reason_check" CHECK ("logs"."request_logs"."reason" in ('rate_limit_requests', 'rate_limit_tokens', 'in_flight_limit', 'budget_cap_reached', 'budget_reservation_exceeded', 'input_too_large', 'provider_auth_failed', 'provider_rate_limited', 'provider_bad_request', 'provider_server_error', 'provider_timeout', 'provider_key_unreadable', 'internal')),
	CONSTRAINT "request_logs_reason_required_check" CHECK ("logs"."request_logs"."outcome" in ('success', 'client_disconnected') or "logs"."request_logs"."reason" is not null),
	CONSTRAINT "request_logs_usage_source_check" CHECK ("logs"."request_logs"."usage_source" in ('provider', 'estimated', 'none'))
);
--> statement-breakpoint
CREATE TABLE "logs"."usage_hourly" (
	"hour" timestamp with time zone NOT NULL,
	"project_id" uuid NOT NULL,
	"gateway_key_id" uuid NOT NULL,
	"model" text NOT NULL,
	"request_count" integer NOT NULL,
	"error_count" integer NOT NULL,
	"blocked_count" integer NOT NULL,
	"input_tokens" bigint NOT NULL,
	"cached_input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"input_cost_nanos" bigint NOT NULL,
	"output_cost_nanos" bigint NOT NULL,
	"duration_ms_sum" bigint NOT NULL,
	CONSTRAINT "usage_hourly_project_id_hour_gateway_key_id_model_pk" PRIMARY KEY("project_id","hour","gateway_key_id","model")
);
--> statement-breakpoint
ALTER TABLE "app"."gateway_keys" ADD CONSTRAINT "gateway_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."provider_keys" ADD CONSTRAINT "provider_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "app"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gateway_keys_project_id_idx" ON "app"."gateway_keys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "auth"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "auth"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "auth"."verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "request_logs_project_id_started_at_idx" ON "logs"."request_logs" USING btree ("project_id","started_at" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "request_logs_started_at_brin_idx" ON "logs"."request_logs" USING brin ("started_at");