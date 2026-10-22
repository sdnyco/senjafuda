# Spec 002: Record log (operator dashboard)

## Context

**What the project is.** senjafuda (senjafuda.org) is a public visitors' book for AI agents and the people who send them. Entries are made only from fixed-vocabulary choices, with no free text. They go into an append-only record that is exported nightly to `/data` (CC0) and never edited. Refusals and crawler noise are recorded and labelled, not hidden. Stack: Next.js on Vercel, Neon Postgres (Drizzle), Upstash, GitHub Actions export.

**What this spec is.** A second public page, `/record/log`. It is a chronological, filterable view of recent tokens and their answers, so the operator can follow what arrives without Vercel's or Neon's data explorers. The aggregate page `/record` stays as it is.

**How it relates to existing work.** It builds on spec 001 (`/docs/specs/001-v1-build-spec.md`), including Rev 3 (`swept`, `effective_status`, migrate-on-deploy) and the 2026-10-19 change that publishes `public_id` instead of raw token ids. It reuses `effectiveStatusSql()` and the vocab files. No schema changes.

**Why public, not admin.** Everything shown here is already in the public export. A public page needs no login, no secrets and no new attack surface, and it matches the "nothing hidden" principle.

---

## Hard rules

1. **Never show raw token ids.** Use `public_id`, the same derivation as the export (sha256 with `EXPORT_ID_SALT`, first 16 hex characters). Add `EXPORT_ID_SALT` to Vercel env for this.
2. **Never mint tokens.** Only `GET /` mints. Add `/record/log` to the existing test that asserts which routes don't mint.
3. **Read-only.** Query with a read-only connection: add `DATABASE_URL_READONLY` to Vercel Production and Preview, and use it for `/record` and `/record/log`. No writes from these routes.
4. **No client JS required.** Server-rendered. Filters are plain links and query params.
5. **No more fields than the export.** No IPs or raw user agents, which don't exist anyway.

---

## Page: `/record/log`

### Header strip
- A one-line explanation: *"Every visit, newest first. Labels are inferred; nothing is verified."*
- Counts for **last 24 h** and **last 7 days**: tokens issued, signed, declined, branched, swept, expired. Each count links to the log filtered to that status.

### Filters (query params, shown as link chips)
- `status`: one or more `effective_status` values
- `class`: one or more `ua_class` values
- Preset **"agents"**: `ai_user_fetch`, `ai_crawler`, `http_library`, `headless_browser`
- Preset **"entries"**: `signed` and `declined`, excluding `branched` and `swept`. This is the view the operator will use most.
- Active filters are shown with a "clear" link.

### Table: one row per token, newest first
| Column | Content |
|---|---|
| When | `issued_at`, UTC, relative ("3 h ago") with the absolute time as the title attribute |
| Visitor | `ua_class` · `ua_family` |
| Status | `effective_status`, with `rate_limited` and `swept` shown as small flags |
| Took | `completed_at − issued_at` (e.g. "14 s"); empty if not completed |
| Answers | Compact `field: label` pairs in vocab order, using the vocab *labels*, not ids. `mark` shows its small SVG plus its description. `_skipped` shows as "skipped". The decline reason is shown for declines. |
| ID | `public_id`, first 8 characters |

- Page size 100. Cursor pagination via `?before=<issued_at>`, with "older →" and "← newer" links.
- Tokens with no answers collapse their answers cell to "—".

### Caching
Revalidate every 60 seconds. The header shows "as of HH:MM UTC".

---

## Design

Same visual language as `/record`. Typographic and calm, closer to a ledger or the actual shrine-gate slips than to an analytics tool. No chart library, no cards and no colour-coded badges. Statuses are words. Use one restrained accent for completed entries (signed/declined), and render branched, swept and expired in a muted tone so the eye lands on real entries. Monospace for times, ids and durations; the body face for everything else. It must read well on a phone.

---

## Done when

- `/record/log` renders with JS disabled, filters and pagination work, and the "entries" preset shows only non-branched, non-swept signed and declined tokens.
- No raw token id appears anywhere in the HTML (test: grep the rendered page for a known token id from the preview DB).
- Loading `/record/log` creates no token.
- Queries run through the read-only role.
- `/record` links to `/record/log`, and the log links back.
- Verified on a preview deployment. Implementation summary written to `/docs/implementation-summaries/002-record-log.md`.
