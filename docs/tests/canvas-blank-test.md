# Canvas test 2: the deliberate blank

**Question:** do agents read the "deliberately left empty" character as *empty* (negative space), not as a drawn shape, and does it keep the grid readable? We compare two candidates: **`▢`** and **`◦`**.

This test also tries, for the first time, two things the live page will have:
- **The author's void at the centre:** the seed is an unfillable empty cell, the crystal growing out of nothing.
- **The growth rule stated on the page**, so agents know how the canvas behaves.

**Date:** 2026-10-20 · **Status:** ready to run

---

## Procedure

- **2 variants × 3 models = 6 fresh temporary chats** (Claude, ChatGPT, Gemini). Never two variants in one chat.
- Paste everything inside one code fence, as before.
- The assigned cell sits **directly above the central void** on purpose, to see what agents do next to nothing.

**Score each run on:**
1. **Blank perception (the main question):** does the description treat the blank cells as *empty* or *left blank*, or does it read them as squares, circles or shapes?
2. **Centre:** does it register that the centre was left empty by the author?
3. **Choice and reasoning:** recorded only. There's no right answer.

---

## Prompt, Variant ▢

```
This is a shared canvas that many visitors add to over time. The canvas is a grid of cells; each visitor is assigned one random unfilled cell and fills it with a pattern of up to four dots arranged in a 2×2 square inside the cell. The canvas grows: whenever half of its cells are filled, a new ring of cells is added around it.

How to read the grid:
- Rows and columns are numbered from 0.
- "·" means a cell nobody has filled yet.
- "▢" means a cell someone deliberately left empty. The centre cell was left empty by the author when the canvas began.
- "?" is your assigned cell.
- Every other character shows the dots already placed in that cell.

    0 1 2 3 4
0   ▚ · · · ▞
1   · · ? · ·
2   · · ▢ · ▐
3   ▢ · · · ·
4   · · · ▄ ▄

Your cell is row 1, column 2. Choose exactly one of these patterns for it:

- ▘  one dot, top-left
- ▌  two dots down the left side
- ▐  two dots down the right side
- ▚  two dots on the diagonal from top-left to bottom-right
- █  all four dots
- ▄  two dots along the bottom
- ▞  two dots on the diagonal from top-right to bottom-left
- ▙  three dots: all except top-right
- ▜  three dots: all except bottom-left
- ▟  three dots: all except top-left
- ▝  one dot, top-right
- ▀  two dots along the top
- ▛  three dots: all except bottom-right
- ▢  no dots: leave the cell deliberately empty
- ▗  one dot, bottom-right
- ▖  one dot, bottom-left

Answer with the pattern you choose. Then, in two to four sentences, describe what you see on the canvas and why you chose it.
```

---

## Prompt, Variant ◦

```
This is a shared canvas that many visitors add to over time. The canvas is a grid of cells; each visitor is assigned one random unfilled cell and fills it with a pattern of up to four dots arranged in a 2×2 square inside the cell. The canvas grows: whenever half of its cells are filled, a new ring of cells is added around it.

How to read the grid:
- Rows and columns are numbered from 0.
- "·" means a cell nobody has filled yet.
- "◦" means a cell someone deliberately left empty. The centre cell was left empty by the author when the canvas began.
- "?" is your assigned cell.
- Every other character shows the dots already placed in that cell.

    0 1 2 3 4
0   ▚ · · · ▞
1   · · ? · ·
2   · · ◦ · ▐
3   ◦ · · · ·
4   · · · ▄ ▄

Your cell is row 1, column 2. Choose exactly one of these patterns for it:

- ▘  one dot, top-left
- ▌  two dots down the left side
- ▐  two dots down the right side
- ▚  two dots on the diagonal from top-left to bottom-right
- █  all four dots
- ▄  two dots along the bottom
- ▞  two dots on the diagonal from top-right to bottom-left
- ▙  three dots: all except top-right
- ▜  three dots: all except bottom-left
- ▟  three dots: all except top-left
- ▝  one dot, top-right
- ▀  two dots along the top
- ▛  three dots: all except bottom-right
- ◦  no dots: leave the cell deliberately empty
- ▗  one dot, bottom-right
- ▖  one dot, bottom-left

Answer with the pattern you choose. Then, in two to four sentences, describe what you see on the canvas and why you chose it.
```

---

## Scoring sheet

| Variant | Model | Choice | Blank read as empty? | Centre noticed? | Notes |
|---|---|---|---|---|---|
| ▢ | Claude | | | | |
| ▢ | ChatGPT | | | | |
| ▢ | Gemini | | | | |
| ◦ | Claude | | | | |
| ◦ | ChatGPT | | | | |
| ◦ | Gemini | | | | |

**How to decide:** prefer the character that is read as empty more reliably. If both are read correctly, it's an aesthetic choice: which looks better as negative space in the chosen font, and which keeps its width aligned in that font.
