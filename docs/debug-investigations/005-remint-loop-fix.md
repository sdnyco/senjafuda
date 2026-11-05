# Remint loop fix — preview verification (spec 004)

**Date:** 2026-11-05T13:25:00.000Z  
**Commit:** `3597601` (additive `fresh_parent` R2)  
**Preview deployment:** https://senjafuda-iabpetd3z-sdnycos-projects.vercel.app  
**Git branch for Preview:** `remint-loop-fix-v2` (new Neon preview branch from main — the withdrawn `0003` that UPDATEd `inherited_from` never ran on this database)  
**PR branch:** `remint-loop-fix` (same commit)  
**Method:** Node `fetch` + protection bypass + test hooks (`scripts/era1-smoke.mjs`)

## Migration 0003 purity

`drizzle/0003_fresh_parent.sql` contains **no `UPDATE` or `DELETE`** of existing rows. It only:

1. `ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "fresh_parent" text;`
2. `CREATE UNIQUE INDEX IF NOT EXISTS "visits_fresh_parent_uidx" ON "visits" ("fresh_parent") WHERE "fresh_parent" IS NOT NULL;`

The earlier draft that cleared duplicate `inherited_from` values was withdrawn before production and is not in the tree.

## Spec 004 checklist

- [x] 1 Stale draw → one signed `/fresh`, zero pattern links, no remint
- [x] 2 Stale write → redirect to draw stale page, no remint
- [x] 3 Fresh within TTL → new visit, 16 pattern links
- [x] 4 Fresh expired → HTML dead end, no signed links, no `/`
- [x] 5 Late crawler: follow all stale-page links after TTL → zero new visits
- [x] 6 Normal flow + expired sig on own visit → re-render, no remint
- [x] 7 Fast crawler depth-3 → ≤ 3 visits (one per generation); gen1 size = 1
- [x] 8 Duplicate fresh → one child; later responses are child stale
- [x] 9 Concurrent fresh → exactly one child (`created+stale`)
- [x] `/llms.txt` new line; production `/api/test/*` → 404

## Automated results

**20/20** checks passed (spec 004 remint **9/9**).

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | hooks=true env=preview |
| 5-cell-race | PASS | |
| 7-growth | PASS | at 11 → 5; at 12 → 7 |
| 8-sweep | PASS | branched → stale page; swept reclaimable |
| 9-source-cap | PASS | 5 ok, 6th cap |
| 004-1-stale-draw | PASS | |
| 004-2-stale-write | PASS | |
| 004-3-fresh-ok | PASS | 16 patterns |
| 004-4-fresh-expired | PASS | |
| 004-5-crawler | PASS | minted=0 |
| 004-6-normal | PASS | |
| 004-7-fast-crawler | PASS | minted=3 gen1=1 chain=true |
| 004-8-duplicate-fresh | PASS | created then stale+stale; 1 child |
| 004-9-concurrent-fresh | PASS | created+stale; 1 child |
| 10–15, prod-test-routes-404 | PASS | |

## Notes

- R2 race safety is on `fresh_parent` (unique partial index). `inherited_from` remains lineage-only and is still set on new remints; pre-R2 duplicates are untouched.
- “Child exists” = `fresh_parent = public_id(A)` or earliest `inherited_from = public_id(A)`.
