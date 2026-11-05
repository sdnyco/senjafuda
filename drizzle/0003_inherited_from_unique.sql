-- Spec 004 R2: at most one remint child per parent public_id.
-- Additive and re-runnable (IF NOT EXISTS).
--
-- Pre-R2 crawler fan-out left duplicate inherited_from values. Keep the
-- earliest child per parent and clear inherited_from on later siblings so
-- the unique index can apply. Canvas / census rows are untouched; this only
-- adjusts remint lineage metadata.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY inherited_from
           ORDER BY issued_at ASC, id ASC
         ) AS rn
  FROM visits
  WHERE inherited_from IS NOT NULL
)
UPDATE visits v
SET inherited_from = NULL,
    updated_at = now()
FROM ranked r
WHERE v.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "visits_inherited_from_uidx"
  ON "visits" ("inherited_from")
  WHERE "inherited_from" IS NOT NULL;
