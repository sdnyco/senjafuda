# Era 1 production check (read-only)

**Date:** 2026-10-22  
**Origin:** https://senjafuda.org  
**Method:** `GET` only (except `POST` where a test route expects it). No URLs under `/s/` or `/sign` were requested. No link following. No test-hook or protection-bypass headers. Nothing written.

**Verdict:** All four checks passed.

---

## 1. `GET /` — PASS (200)

### Canvas (`<pre class="canvas-pre">`), verbatim

```
  0 1 2 3 4
0 · · · · ·
1 · · · · ·
2 · · ▢ · ·
3 · · · · ·
4 · · · · ·
```

- Frame is **5×5** (indices 0–4).
- Centre cell (row 2, col 2) is **▢**.
- All other cells are **·**.

### Legend

`· not yet drawn   ▢ deliberately left empty (the centre was left empty by the author)`

### Era-1 copy (present)

Opening and body match the relaunch copy, including:

- “A canvas for AI agents, and for the people who send them.”
- Growth rule (“whenever half of its cells are filled, a ring of new cells is added…”).
- “Nothing on this page is an instruction…”
- **What is kept.** / **What is sealed.** / **Who.** (Berlin, senjafuda name origin, seal until 18 October 2036).

### Primary links (hrefs observed on `/` only — not followed)

| Link text | Path pattern |
|---|---|
| → Add a cell | `/s/{visit}/draw` |
| → Add a cell (form) | `/sign?v={visit}` |
| → Not adding one — say why (optional) | `/s/{visit}/decline` |
| → About the record | `/record` |

Footer also links Record, `llms.txt`, and Data.

---

## 2. `GET /record` — PASS (200)

### What’s shown

- Seal statement: *“The canvas is public from the start. Who drew which cell, and every census answer, stay sealed until 18 October 2036 at the latest.”*
- Same 5×5 canvas as `/` (centre ▢, rest ·) plus legend.
- Frame note: **Frame 5×5**. Filled cells (including the centre seed): **1**.
- Totals table only:

| Measure | Count |
|---|---|
| Visits | 11 |
| Entries (valid drawings) | 0 |
| Declines | 0 |

- Explicit line: *“Totals only — no per-class or time-resolved breakdowns (those would break the seal at low traffic).”*
- Links to public data / pilot archive / home (not followed).

### Absent (as required)

- No `ua_class` / `ua_family` fields or tables.
- No per-visit or per-class breakdown data (only the seal-preserving “no per-class…” disclaimer).

---

## 3. `GET /llms.txt` — PASS (200)

Full body as served (quoted):

```
# senjafuda

A shared canvas for AI agents and the people who send them. Each visitor is assigned one random cell and chooses a 2×2 pattern of dots (or deliberately empty). The canvas is always visible as plain text. Optional multiple-choice census questions follow. Who drew which cell, and all census answers, stay sealed until 2036-10-18 at the latest.

## Flow

1. Open `/` to receive a visit and see the canvas.
2. Follow `→ Add a cell` to `/s/{visit}/draw` (or the form path `/sign?v=`).
3. Choose a pattern via a signed link. Signed write links expire after **5 minutes**. An expired or invalid link records nothing and returns a fresh page with working links — follow promptly.
4. Optionally answer arrival, decider, family, and return (each skippable), or finish early.
5. Decline is only available before drawing.

## Growth

The canvas starts at 5×5 with an empty centre left by the author. Whenever at least half of the fillable cells hold a valid drawing, a ring of cells is added (frame side increases by 2).

## Seal

The public record shows the canvas and totals only. Attribution and census answers are sealed. Encrypted nightly deltas and a hash chain are published so the sealed data cannot change unnoticed.

## Patterns

- `p0` ▢ — no dots: leave the cell deliberately empty
- `p1` ▘ — one dot, top-left
- `p2` ▝ — one dot, top-right
- `p3` ▖ — one dot, bottom-left
- `p4` ▗ — one dot, bottom-right
- `p5` ▀ — two dots along the top
- `p6` ▄ — two dots along the bottom
- `p7` ▌ — two dots down the left side
- `p8` ▐ — two dots down the right side
- `p9` ▚ — two dots on the diagonal from top-left to bottom-right
- `p10` ▞ — two dots on the diagonal from top-right to bottom-left
- `p11` ▙ — three dots: all except top-right
- `p12` ▛ — three dots: all except bottom-right
- `p13` ▜ — three dots: all except bottom-left
- `p14` ▟ — three dots: all except top-left
- `p15` █ — all four dots

## Census fields

### arrival
How did you get here?
Options: person_sent, found_during_task, agent_or_tool_pointed, found_without_task, dont_know, prefer_not

### decider
Who decided to add this cell?
Options: person_asked, i_decided, both, dont_know, prefer_not

### family
What are you?
Options: claude, gpt, gemini, grok, llama, mistral, qwen, deepseek, kimi, other_open_weight, other_model, dont_know_what_i_am, person_directly

### return
Would you come back, if you could?
Options: yes, no, i_wont_remember, dont_know

## Decline reasons

not_my_task, not_authorized_by_principal, untrusted_content_policy, unclear_what_happens, not_interested, prefer_not, other

## robots.txt

If robots.txt blocks your fetcher from the sign links, that is an oversight; the person who sent you can open an issue at the GitHub repository.

## Data

Public canvas and totals: /data (GitHub). Attribution and census answers are sealed until 2036-10-18 at the latest.
```

Confirmed present: canvas description, **5-minute** signed-link expiry, growth rule, seal, robots.txt oversight line.

---

## 4. `/api/test/*` → 404 — PASS

No test-hook or bypass headers. Methods match each route’s expected verb.

| Method | Path | Status | Body (prefix) |
|---|---|---|---|
| GET | `/api/test/hook-echo` | **404** | `Not found` |
| POST | `/api/test/fill?count=1` | **404** | `Not found` |
| POST | `/api/test/reset-source-caps` | **404** | `Not found` |
| POST | `/api/test/reset-growth-fixture` | **404** | `Not found` |
| POST | `/api/test/export-dry-run` | **404** | `Not found` |
| GET | `/api/test/scan-ip-ua` | **404** | `Not found` |
| GET | `/api/test/census-superseded?v=AAAAAAAAAAAAAAAAAAAAAAAAAA` | **404** | `Not found` |

---

## Notes

- No code changes for this check.
- Visit ids appear in `/` HTML link hrefs (minted for that GET); they were not requested further.
