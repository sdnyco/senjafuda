# Implementation summary — 004 remint loop fix

**Date:** 2026-11-05  
**Spec:** `/docs/specs/004-remint-loop-fix-spec.md` (including Revisions 1 and 2)  
**Branch:** `remint-loop-fix`

## What changed

Breaks the crawler remint fan-out from spec 003 R1 without changing draw conditions (not a new era).

**Era rule (for later readers):** an era changes when the conditions visitors draw under change (canvas rules, vocabulary, seal, who may draw). Flow plumbing — how links expire and how stale visits are handled — is not a condition.

### Behaviour (R1)

- **`GET /s/{v}/draw`** and every write link on an **unusable** visit: write nothing, mint nothing; render `StaleVisitPage` (or redirect writes to draw). Exactly one signed `Start a fresh cell` → `/fresh`. No Home/`/` (minting). Shell footer keeps `/record`, `/llms.txt`, `/data`. No sweep on that early return.
- **`GET /s/{v}/fresh`** is the only remint path. **Expired/invalid signature → HTML dead end** (`FreshLinkExpiredPage`: link to `/record` only), **not** a redirect to `/`.
- Census and decline GETs on any unusable/unknown visit use the same stale page (R1.9).
- Malformed ids still 404 before DB access.

### Behaviour (R2 — fast crawlers)

- Each parent visit spawns **at most one** child: lookup by `inherited_from = public_id(A)` (**including unknown well-formed A** — R2 overrides R1.6’s null `inherited_from` so uniqueness can apply).
- First valid `/fresh` → mint B, redirect to B’s draw.
- Later valid `/fresh` for A (or lost insert race) → **mint nothing**, render **B’s stale page** (B’s own `fresh` link only). Never redirect into B’s draw/census.
- Race-safe via unique partial index on `inherited_from` WHERE NOT NULL + insert-and-catch-conflict.
- Effect: a chain (A→B→C…), bounded by the per-source mint cap — not a tree.

### Migration

- `drizzle/0003_inherited_from_unique.sql`: clear duplicate `inherited_from` on later siblings (keep earliest child), then `CREATE UNIQUE INDEX IF NOT EXISTS visits_inherited_from_uidx`. Re-runnable. Pre-R2 fan-out left duplicates; canvas/census untouched.

### Touch points

- `StaleVisitPage` / `FreshLinkExpiredPage`; `remintFromOrExisting` / `getVisitByInheritedFrom`
- Draw page, write routes, `fresh/page.tsx`
- `content/era1/llms-header.md`, `data/README.md` dated note
- `scripts/era1-smoke.mjs`: checks `004-1`…`004-9`

## Verification

Preview smoke + report: `/docs/debug-investigations/005-remint-loop-fix.md`.

## Dependencies

None added.
