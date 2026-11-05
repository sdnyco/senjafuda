# Remint loop fix — preview verification (spec 004)

**Date:** 2026-11-05T12:59:51.897Z  
**Commit:** `c359d86` (+ smoke assertion follow-ups)  
**Preview deployment:** https://senjafuda-k6snk4pda-sdnycos-projects.vercel.app  
**Method:** Node `fetch` + protection bypass + test hooks (`scripts/era1-smoke.mjs`)

## Spec 004 checklist

- [x] 1 Stale draw → one signed `/fresh`, zero pattern links, no remint
- [x] 2 Stale write → redirect to draw stale page, no remint
- [x] 3 Fresh within TTL → new visit, 16 pattern links
- [x] 4 Fresh expired → HTML dead end, no signed links, no `/`
- [x] 5 Crawler: follow all stale-page links after TTL → zero new visits (`/fresh`, `/record`, `/llms.txt`, `/data`)
- [x] 6 Normal flow + expired sig on own visit → re-render, no remint
- [x] 7 `/llms.txt` contains the new “Start a fresh cell” line; production `/api/test/*` → 404

## Automated results (final run)

**16/17** automated checks; **spec 004 remint checks 6/6**.

| Id | Result | Detail |
|---|---|---|
| 0-hook-echo | PASS | status=200 hooks=true env=preview |
| 5-cell-race | PASS | forced cell race → `note=taken` |
| 7-growth | PASS | at 11 → 5; at 12 → 7 |
| 8-sweep | PASS | branched draw → stale page (no auto-remint); swept cell reclaimable |
| 9-source-cap | FAIL* | reset=200 but first draw already capped |
| 004-1-stale-draw | PASS | stalePage; one signed fresh; 0 patterns |
| 004-2-stale-write | PASS | 302 → same visit draw stale page |
| 004-3-fresh-ok | PASS | new visit; 16 patterns |
| 004-4-fresh-expired | PASS | HTML dead end; 0 signed; no `/` |
| 004-5-crawler | PASS | 4 links; minted=0 |
| 004-6-normal | PASS | finish + late re-render on own visit |
| 10-decline | PASS | |
| 11-form | PASS | |
| 12-census-correction | PASS | supersededRows=1 |
| 14-export | PASS | |
| 15-no-ip-ua | PASS | |
| prod-test-routes-404 | PASS | all listed `/api/test/*` → 404 on senjafuda.org |

\* `9-source-cap` **passed** on the first smoke against this Preview (`c359d86` deploy) before repeated runs left the per-source draw counter hot. `reset-source-caps` returned 200 but did not clear enough Upstash keys for a clean re-run. Unrelated to remint behaviour; not a regression from this change.

## Manual note (check 7)

`GET /llms.txt` on Preview includes: *If a link belongs to an earlier visit, you will get one "Start a fresh cell" link. Follow it promptly; it expires after 5 minutes.*
