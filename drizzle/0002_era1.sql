-- Era 1 tables. Additive only; pilot tokens/answers untouched.
-- Re-runnable (IF NOT EXISTS / exception handlers).

CREATE TABLE IF NOT EXISTS "visits" (
  "id" text PRIMARY KEY NOT NULL,
  "era" integer DEFAULT 1 NOT NULL,
  "issued_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "vocab_version" text NOT NULL,
  "ua_rules_version" integer NOT NULL,
  "ua_class" text NOT NULL,
  "ua_family" text NOT NULL,
  "ua_suspect" boolean DEFAULT false NOT NULL,
  "status" text NOT NULL,
  "swept" boolean DEFAULT false NOT NULL,
  "rate_limited" boolean DEFAULT false NOT NULL,
  "late_fetches" integer DEFAULT 0 NOT NULL,
  "inherited_from" text,
  "completed_at" timestamptz,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "drawings" (
  "id" bigserial PRIMARY KEY,
  "visit_id" text,
  "kind" text NOT NULL,
  "x" integer NOT NULL,
  "y" integer NOT NULL,
  "pattern" text NOT NULL,
  "path" text NOT NULL,
  "option_order" text,
  "status" text NOT NULL,
  "excluded_reason" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "drawings" ADD CONSTRAINT "drawings_visit_id_visits_id_fk"
   FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "drawings_valid_xy_uidx"
  ON "drawings" ("x", "y") WHERE "status" = 'valid';

CREATE INDEX IF NOT EXISTS "drawings_visit_id_idx" ON "drawings" ("visit_id");
CREATE INDEX IF NOT EXISTS "drawings_status_idx" ON "drawings" ("status");

CREATE TABLE IF NOT EXISTS "census" (
  "id" bigserial PRIMARY KEY,
  "visit_id" text NOT NULL,
  "field" text NOT NULL,
  "value" text NOT NULL,
  "answered_at" timestamptz NOT NULL,
  "path" text NOT NULL,
  "position" integer,
  "option_order" text,
  "superseded" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "census" ADD CONSTRAINT "census_visit_id_visits_id_fk"
   FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "census_visit_field_idx" ON "census" ("visit_id", "field");

CREATE TABLE IF NOT EXISTS "canvas_state" (
  "id" integer PRIMARY KEY NOT NULL,
  "frame_size" integer NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "visits_status_idx" ON "visits" ("status");
CREATE INDEX IF NOT EXISTS "visits_issued_at_idx" ON "visits" ("issued_at");

-- updated_at on every UPDATE (R14)
CREATE OR REPLACE FUNCTION era1_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER visits_updated_at BEFORE UPDATE ON "visits"
    FOR EACH ROW EXECUTE PROCEDURE era1_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER drawings_updated_at BEFORE UPDATE ON "drawings"
    FOR EACH ROW EXECUTE PROCEDURE era1_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER census_updated_at BEFORE UPDATE ON "census"
    FOR EACH ROW EXECUTE PROCEDURE era1_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER canvas_state_updated_at BEFORE UPDATE ON "canvas_state"
    FOR EACH ROW EXECUTE PROCEDURE era1_set_updated_at();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Seed: centre void + initial 5×5 frame (idempotent)
INSERT INTO "canvas_state" ("id", "frame_size", "updated_at")
VALUES (1, 5, now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "drawings" ("visit_id", "kind", "x", "y", "pattern", "path", "option_order", "status", "created_at", "updated_at")
SELECT NULL, 'seed', 0, 0, 'p0', 'seed', NULL, 'valid', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "drawings" WHERE "kind" = 'seed' AND "x" = 0 AND "y" = 0 AND "status" = 'valid'
);

-- Export role (created outside migrations). Idempotent if the role is absent.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'senjafuda_export') THEN
    GRANT SELECT ON TABLE visits, drawings, census, canvas_state TO senjafuda_export;
  END IF;
END $$;
