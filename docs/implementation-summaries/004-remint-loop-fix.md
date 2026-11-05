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

- Each parent visit spawns **at most one** child.
- A remint from A sets **both** `inherited_from = public_id(A)` (same meaning as before) and `fresh_parent = public_id(A)` on the child (including unknown well-formed A).
- “Child already exists” for A: a visit with `fresh_parent = public_id(A)`, **or** (pre-R2 history) the earliest visit with `inherited_from = public_id(A)`. If one exists → that child’s stale page, mint nothing.
- First valid `/fresh` with no child → mint B, redirect to B’s draw.
- Later valid `/fresh` (or lost insert race) → mint nothing, render **B’s stale page**. Never redirect into B’s draw/census.
- Race safety: unique partial index on `fresh_parent` WHERE NOT NULL + insert-and-catch-conflict.
- Effect: a chain (A→B→C…), bounded by the per-source mint cap — not a tree.

### Migration

- `drizzle/0003_fresh_parent.sql`: **additive only** — `ADD COLUMN IF NOT EXISTS fresh_parent` + `CREATE UNIQUE INDEX IF NOT EXISTS visits_fresh_parent_uidx`. **No UPDATE/DELETE** of existing rows. `inherited_from` and all historical rows untouched (pre-R2 duplicates remain as lineage).

### Touch points

- `StaleVisitPage` / `FreshLinkExpiredPage`; `findExistingFreshChild` / `remintFromOrExisting`
- Draw page, write routes, `fresh/page.tsx`
- `content/era1/llms-header.md`, `data/README.md` dated note
- `.cursor/rules/no-data-edits-in-migrations.mdc`
- `scripts/era1-smoke.mjs`: checks `004-1`…`004-9`

## Verification

Preview smoke + report: `/docs/debug-investigations/005-remint-loop-fix.md`.

## Dependencies

None added.
