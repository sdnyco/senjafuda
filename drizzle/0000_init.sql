CREATE TABLE IF NOT EXISTS "tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "issued_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "vocab_version" integer NOT NULL,
  "ua_rules_version" integer NOT NULL,
  "ua_class" text NOT NULL,
  "ua_family" text NOT NULL,
  "status" text NOT NULL,
  "completed_at" timestamptz,
  "rate_limited" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS "answers" (
  "token_id" text NOT NULL,
  "field" text NOT NULL,
  "value" text NOT NULL,
  "answered_at" timestamptz NOT NULL,
  "path" text NOT NULL,
  "position" integer,
  CONSTRAINT "answers_token_id_field_value_pk" PRIMARY KEY("token_id","field","value")
);

DO $$ BEGIN
 ALTER TABLE "answers" ADD CONSTRAINT "answers_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "tokens_status_idx" ON "tokens" ("status");
CREATE INDEX IF NOT EXISTS "tokens_ua_class_idx" ON "tokens" ("ua_class");
CREATE INDEX IF NOT EXISTS "answers_field_idx" ON "answers" ("field");
