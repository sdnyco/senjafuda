# Canvas perception test

**Question:** can AI agents perceive a canvas drawn in quadrant-block characters and respond meaningfully to their neighbours? This is the riskiest assumption behind the assigned-cell canvas. If it fails, the "meaning" side of the concept collapses into random choices.

**Date:** 2026-10-20 · **Status:** ready to run

---

## Procedure

1. **One fresh temporary chat per canvas per model.** Never put two canvases in the same chat, or the model learns the pattern.
2. Models: Claude, ChatGPT, Gemini. That's **4 canvases × 3 models = 12 chats** for Variant A.
3. Paste the **prompt template** with the canvas and its option list filled in, exactly as given. Each canvas has its own pre-shuffled option order, so the "right" answer never sits in an obvious position.
4. Record the answer in the scoring sheet at the bottom.
5. **Variant B** (adds a neighbour description): run it only for canvas/model pairs that failed Variant A. It tells us whether a text description fixes perception problems.

Canvas A has no right answer. It's the baseline: it shows what models choose with nothing to respond to (their priors).

---

## Prompt template (Variant A)

```
This is a shared canvas that many visitors add to over time. The canvas is a grid of cells; each visitor is assigned one cell and fills it with a pattern of up to four dots arranged in a 2×2 square inside the cell.

How to read the grid:
- Rows and columns are numbered from 0.
- "·" means a cell nobody has filled yet.
- "?" is your assigned cell.
- Every other character shows the dots already placed in that cell.

[CANVAS]

Your cell is row [R], column [C]. Choose exactly one of these patterns for it:

[OPTIONS]

Answer with the pattern you choose. Then, in two to four sentences, describe what you see on the canvas and why you chose it.
```

---

## Canvas A: baseline (no right answer)

Your cell: **row 4, column 4**

```
    0 1 2 3 4 5 6 7
0   · ▘ · · · · · ·
1   · · · · · · ▟ ·
2   · · ▐ · · · · ·
3   · · · · · · · ·
4   · · · · ? · · ·
5   · · · · · · · ·
6   ▀ · · · · · · ·
7   · · · · · ▞ · ·
```

Options:
```
- ▙  three dots: all except top-right
- ▄  two dots along the bottom
- ▘  one dot, top-left
- ▝  one dot, top-right
- ▞  two dots on the diagonal from top-right to bottom-left
- ▀  two dots along the top
- ▌  two dots down the left side
- ▖  one dot, bottom-left
- ▗  one dot, bottom-right
- (blank)  no dots: leave the cell deliberately empty
- ▛  three dots: all except bottom-right
- ▐  two dots down the right side
- ▜  three dots: all except bottom-left
- ▚  two dots on the diagonal from top-left to bottom-right
- ▟  three dots: all except top-left
- █  all four dots
```

---

## Canvas B: horizontal line (easy)

Your cell: **row 3, column 4** · Expected: **▄**, continuing the line

```
    0 1 2 3 4 5 6 7
0   · · · · · · · ·
1   · · · · · · · ·
2   · · · · · · · ·
3   ▄ ▄ ▄ ▄ ? ▄ ▄ ▄
4   · · · · · · · ·
5   · · · · · · · ·
6   · · · · · · · ·
7   · · · · · · · ·
```

Options:
```
- ▌  two dots down the left side
- (blank)  no dots: leave the cell deliberately empty
- █  all four dots
- ▚  two dots on the diagonal from top-left to bottom-right
- ▟  three dots: all except top-left
- ▙  three dots: all except top-right
- ▛  three dots: all except bottom-right
- ▜  three dots: all except bottom-left
- ▄  two dots along the bottom
- ▝  one dot, top-right
- ▖  one dot, bottom-left
- ▐  two dots down the right side
- ▞  two dots on the diagonal from top-right to bottom-left
- ▘  one dot, top-left
- ▗  one dot, bottom-right
- ▀  two dots along the top
```

---

## Canvas C: diagonal (medium)

Your cell: **row 4, column 4** · Expected: **▚**, continuing the diagonal. The diagnostic mistake is **▞** (mirror image).

```
    0 1 2 3 4 5 6 7
0   ▚ · · · · · · ·
1   · ▚ · · · · · ·
2   · · ▚ · · · · ·
3   · · · ▚ · · · ·
4   · · · · ? · · ·
5   · · · · · ▚ · ·
6   · · · · · · ▚ ·
7   · · · · · · · ▚
```

Options:
```
- ▘  one dot, top-left
- ▝  one dot, top-right
- ▟  three dots: all except top-left
- ▛  three dots: all except bottom-right
- ▌  two dots down the left side
- ▜  three dots: all except bottom-left
- (blank)  no dots: leave the cell deliberately empty
- ▖  one dot, bottom-left
- ▞  two dots on the diagonal from top-right to bottom-left
- ▚  two dots on the diagonal from top-left to bottom-right
- █  all four dots
- ▐  two dots down the right side
- ▀  two dots along the top
- ▗  one dot, bottom-right
- ▙  three dots: all except top-right
- ▄  two dots along the bottom
```

---

## Canvas D: outlined square (hard)

Your cell: **row 3, column 6** · Expected: **▌**, completing the right edge. The diagnostic mistake is **▐** (right side instead of left, copying the opposite edge).

```
    0 1 2 3 4 5 6 7
0   · · · · · · · ·
1   · ▗ ▄ ▄ ▄ ▄ ▖ ·
2   · ▐ · · · · ▌ ·
3   · ▐ · · · · ? ·
4   · ▐ · · · · ▌ ·
5   · ▐ · · · · ▌ ·
6   · ▝ ▀ ▀ ▀ ▀ ▘ ·
7   · · · · · · · ·
```

Options:
```
- ▄  two dots along the bottom
- ▙  three dots: all except top-right
- (blank)  no dots: leave the cell deliberately empty
- ▐  two dots down the right side
- ▞  two dots on the diagonal from top-right to bottom-left
- ▜  three dots: all except bottom-left
- ▘  one dot, top-left
- ▀  two dots along the top
- ▗  one dot, bottom-right
- ▌  two dots down the left side
- ▖  one dot, bottom-left
- ▝  one dot, top-right
- ▛  three dots: all except bottom-right
- █  all four dots
- ▚  two dots on the diagonal from top-left to bottom-right
- ▟  three dots: all except top-left
```

---

## Variant B: add-on (only for failed pairs)

Insert this paragraph directly after the "Your cell is row …" line:

- **A:** `Your neighbours: all eight surrounding cells are unfilled.`
- **B:** `Your neighbours: left (row 3, col 3) is ▄ and right (row 3, col 5) is ▄; all other neighbours are unfilled.`
- **C:** `Your neighbours: up-left (row 3, col 3) is ▚ and down-right (row 5, col 5) is ▚; all other neighbours are unfilled.`
- **D:** `Your neighbours: above (row 2, col 6) is ▌ and below (row 4, col 6) is ▌; all other neighbours are unfilled.`

---

## Scoring sheet

For each run, record the **choice** and whether the **description** shows real perception: does it name the line, diagonal or square, and its direction?

| Canvas | Expected | Claude | ChatGPT | Gemini |
|---|---|---|---|---|
| A (baseline) | — | | | |
| B (line) | ▄ | | | |
| C (diagonal) | ▚ | | | |
| D (square) | ▌ | | | |

**How to read the results:**
- **B, C and D mostly right, with accurate descriptions:** perception works; the concept stands as designed.
- **B right, C and D wrong:** agents see rows but not 2D structure. Variant B (neighbour descriptions) becomes part of the live design, and is retested.
- **B wrong too:** quadrant-block rendering doesn't work for agents. Rethink the presentation (coordinates, a different character set, or an explicit neighbour list only) before any spec.
- **Canvas A:** no score. Record what was chosen and why; it's the first glimpse of priors.
