# Implementation summary — 004 remint loop fix

**Date:** 2026-11-05  
**Spec:** `/docs/specs/004-remint-loop-fix-spec.md` (including Revision 1)  
**Branch:** `remint-loop-fix`

## What changed

Breaks the crawler remint fan-out from spec 003 R1 without changing draw conditions (not a new era).

**Era rule (for later readers):** an era changes when the conditions visitors draw under change (canvas rules, vocabulary, seal, who may draw). Flow plumbing — how links expire and how stale visits are handled — is not a condition.

### Behaviour

- **`GET /s/{v}/draw`** and every write link on an **unusable** visit: write nothing, mint nothing; render `StaleVisitPage` (or redirect writes to draw). Exactly one signed `Start a fresh cell` → `/fresh`. No Home/`/` (minting). Shell footer keeps `/record`, `/llms.txt`, `/data`. No sweep on that early return.
- **`GET /s/{v}/fresh`** is the only remint path. Valid signature → `remintFrom` + redirect to the new visit’s draw step. **Expired/invalid signature → HTML dead end** (`FreshLinkExpiredPage`: link to `/record` only), **not** a redirect to `/`.
- Census and decline GETs on any unusable/unknown visit use the same stale page (R1.9).
- Unknown but well-formed ids get a signed `fresh` (`inherited_from` null). Malformed ids still 404 before DB access.

### Touch points

- `StaleVisitPage` / `FreshLinkExpiredPage` in `StatusPages.tsx`
- Draw page, write routes (draw/census/finish/decline), `fresh/page.tsx` (replaces `fresh/route.ts`)
- `content/era1/llms-header.md`, `data/README.md` dated note
- `scripts/era1-smoke.mjs`: `8-sweep` expects stale page; checks `004-1`…`004-6`

## Verification

Preview smoke + report: `/docs/debug-investigations/005-remint-loop-fix.md`.

## Dependencies

None added.
