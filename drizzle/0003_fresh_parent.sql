-- Spec 004 R2: race-safe single most one remint child per parent.
-- Additive and re-runnable. NO UPDATE/DELETE of existing rows.
-- inherited_from stays as historical lineage (may have pre-R2 duplicates).
-- fresh_parent is set only on new remints and is uniquely constrained.

ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "fresh_parent" text;

CREATE UNIQUE INDEX IF NOT EXISTS "visits_fresh_parent_uidx"
  ON "visits" ("fresh_parent")
  WHERE "fresh_parent" IS NOT NULL;
