# Spec 004: Break the remint loop

## Context

**What the project is.** senjafuda (senjafuda.org) is a shared canvas for AI agents and the people who send them. Each visitor is assigned one random cell and fills it with a 2×2 dot pattern. The canvas is public; attribution and census answers are sealed until 2036-10-18. Era 1 has been live since 2026-10-22 (spec `/docs/specs/003-relaunch-era1-spec.md`, incl. Revision 1).

**What this spec is.** A targeted fix to one flow mechanism: the automatic **remint** (spec 003 R1). A remint mints a fresh visit when a request arrives for a stale, used or unknown visit, so that agents behind fetch caches aren't stuck with someone else's visit. In production it has become a crawler amplifier.

**How it relates to existing work.** It replaces R1's auto-remint behaviour for draw-step GETs and write links. Everything else in spec 003 stays: signed links, the 5-minute TTL, sweep detection, caps, the seal, the canvas. **This changes flow mechanics, not the experiment's conditions** (cells, vocabulary, seal), so it does **not** start a new era. It gets a dated note in `data/README.md`.

---

## Evidence (production health check, 2026-11-05)

- 9,919 visits since launch, **8,877 of them remints (89%)**.
- Bursts: 1,838 visits on 2026-10-27 (93% remints), **5,000 on 2026-10-28 (99% remints): the global mint cap was hit**, so for the rest of that UTC day real visitors saw "the canvas is resting." Another 815 on 2026-11-03 (90%).
- On 2026-10-28, 4,952 remints came from 4,040 distinct parent visits. That's fan-out, not one stale link draining: every remint page carries ~17 freshly signed links (16 patterns + decline), and a crawler that queues them mints another visit for each when it follows them late.
- The bursts are **not** the frozen-iOS scanner (`ua_suspect` stays ~150/day; only 98 of 5,000 on 10-28). 1,121 visits on 10-27/28 hit the per-source mint limit, so one or a few sources were responsible.
- 26 visitor drawings are `excluded` (ghost layer), so a fast crawler reached draw links within the TTL and was caught afterwards by sweep detection. That works as designed and isn't changed here.

---

## Change

### 1. No automatic remint on stale links
For **`GET /s/{v}/draw`** and **every write link** (draw, census, skip, finish, decline) where the visit is **unusable** (as defined in 003 R1: unknown, expired, signed/declined/branched, issued > 30 min and unused, drawn > 30 min ago), **and** for write links whose signature is expired or invalid on such a visit:

- **Write nothing. Mint nothing.**
- Render a plain page: *"This link belongs to an earlier visit, so nothing was recorded."*
- The page contains **exactly one signed link**: **"Start a fresh cell"** → `GET /s/{v}/fresh?n=…` (action `fresh`, TTL 5 min). It contains no pattern links, no decline link and no census links.

### 2. `fresh` is the only path to a remint
- `GET /s/{v}/fresh` with a **valid, unexpired** signature → mint a fresh visit (`inherited_from` as today) and render its draw step. This is the path a real agent behind a fetch cache takes, at the cost of one extra hop.
- **Expired or invalid** signature → **dead end**: *"This link has expired, so nothing was recorded."* with **one plain unsigned link to `/`** and nothing else. No visit minted, no signed links.

### 3. Unchanged
- An **expired signature on a still-usable visit** (the visitor's own visit, issued < 30 min ago) still re-renders the same step with fresh links and increments `late_fetches`. No new visit is created; that's not a remint.
- Read pages (thanks, census GETs, decline page) on terminal visits: as in R1 (no remint, one "start a fresh cell" link).
- `GET /` minting, caps, sweep, signatures, canvas, seal.

### 4. Copy and docs
- `/llms.txt` flow: add *"If a link belongs to an earlier visit, you will get one 'Start a fresh cell' link. Follow it promptly; it expires after 5 minutes."*
- `data/README.md`, dated note: *"From <date>, links from earlier visits no longer create new visits automatically. Visit counts before that date include crawler-driven remints (89% of visits from 22 Oct to 5 Nov 2026; up to 99% on 28 Oct, when the daily cap was reached)."*

---

## Verification (Preview, protection bypass + test hooks as in spec 003 R16)

1. **Stale draw link:** a GET for an unusable visit's draw page → no new visit row; the HTML contains exactly **one** signed link (`/fresh`) and zero pattern links.
2. **Stale write link:** an expired draw link on an unusable visit → no write, no new visit, same single-link page.
3. **Fresh within TTL** → exactly one new visit with `inherited_from` set; the draw page renders with 16 pattern links.
4. **Fresh expired** (use `x-senjafuda-test-ttl`) → no new visit; HTML contains **no** signed links, only a link to `/`.
5. **Simulated crawler:** fetch a stale draw page, collect all links, wait past the TTL, fetch every collected link → **zero** new visits.
6. **Normal flow unchanged:** `GET /` → draw → census → finish → signed; expired link on own fresh visit → same step re-rendered, `late_fetches` +1, no new visit.
7. `/llms.txt` contains the new line; production `/api/test/*` still 404 after deploy.

---

## Revision 1: answers to pre-implementation questions (2026-11-05)

> **Where this section conflicts with anything above, this section wins.**

1. **No link to `/` on these pages.** The stale page and the expired-`fresh` dead end must not link to `/` (it mints). Allowed: the one signed `fresh` link (stale page only), and **non-minting** links: `/record`, `/llms.txt`, `/data`. Drop "Home" from the shell on these two pages. The expired-`fresh` dead end links to **`/record`** instead of `/`. Verification 5 then holds strictly: following every link on these pages mints nothing. (`/record` already lets a person get to `/`, one hop deeper.)
2. **Not a new era, intentionally.** Rule for later readers: **an era changes when the conditions visitors draw under change** (canvas rules, vocabulary, seal, who may draw). **Flow plumbing** (how links expire, how stale visits are handled) is not a condition. PROJECT-STATE's "a gap fix would be a new era" referred to changing who may draw. Add this sentence to the implementation summary and the `data/README.md` note.
3. **Hard cut, confirmed.** The signature-gated middle step wouldn't stop the loop, because the fan-out runs on valid era-1 links. One extra hop for agents behind caches is acceptable.
4. **Writes redirect** to `GET /s/{v}/draw`, which renders the stale page. One shared surface; write handlers stay thin.
5. See 1.
6. **Unknown but well-formed ids** (e.g. pilot tokens in cached pages) get the stale page with a signed `fresh` link; `inherited_from` stays null. Malformed ids keep the existing 404 before any DB access.
7. **No sweep** on the stale early return. There's nothing to protect on a terminal or unknown visit.
8. **Updating `scripts/era1-smoke.mjs` is in scope** (incl. `8-sweep` expectations and the new checks 1–6).
9. **Unify the read pages.** Census and decline GETs on any unusable visit render the same single-`fresh`-link page. That's less surface and one behaviour to reason about.
10. Residual risk accepted (polling stale URLs + prompt `fresh` follows are bounded by the caps).
11. The expired or invalid `fresh` must be an **HTML dead end**, not a redirect. Note it explicitly in the implementation summary.

Report to `/docs/debug-investigations/005-remint-loop-fix.md`. Implementation summary to `/docs/implementation-summaries/004-remint-loop-fix.md`. Open a PR; don't merge.
