import { and, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { canvasState, drawings } from "@/db/schema";
import { patternGlyph, loadEra1Vocab } from "./era1-vocab";

/** Db or transaction handle (drizzle tx has the same query API). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryDb = Db | any;

export type CellCoord = { x: number; y: number };

export type CanvasCell = {
  x: number;
  y: number;
  pattern: string;
  kind: string;
};

export type RenderOptions = {
  frameSize: number;
  cells: CanvasCell[];
  /** Absolute coords of the visitor's assigned (unfilled) cell — shown as `?`. */
  assigned?: CellCoord | null;
  /** When true, include "? your cell" in the legend. */
  showAssignedLegend?: boolean;
};

/** Half-extent from centre for frame side `s` (odd). */
export function frameHalf(s: number): number {
  return (s - 1) / 2;
}

export function fillableCount(s: number): number {
  return s * s - 1;
}

export function growthThreshold(s: number): number {
  return Math.ceil(fillableCount(s) / 2);
}

/** Absolute coords of every cell in the frame, including the seed. */
export function frameCoords(s: number): CellCoord[] {
  const h = frameHalf(s);
  const out: CellCoord[] = [];
  for (let y = -h; y <= h; y++) {
    for (let x = -h; x <= h; x++) {
      out.push({ x, y });
    }
  }
  return out;
}

export function isSeed(x: number, y: number): boolean {
  return x === 0 && y === 0;
}

export function absToRowCol(
  x: number,
  y: number,
  s: number,
): { row: number; col: number } {
  const h = frameHalf(s);
  return { row: y + h, col: x + h };
}

export function rowColToAbs(
  row: number,
  col: number,
  s: number,
): CellCoord {
  const h = frameHalf(s);
  return { x: col - h, y: row - h };
}

/** Digit width for index labels / cell fields (R12). */
export function indexWidth(s: number): number {
  return String(s - 1).length;
}

function padField(text: string, w: number): string {
  return text.padStart(w, " ");
}

/**
 * Plain-text canvas. For s ≤ 10 this matches the perception-test format.
 * For larger frames, each field is `w` chars wide with a single space between.
 */
export function renderCanvasText(opts: RenderOptions): string {
  const { frameSize: s, cells, assigned } = opts;
  const w = indexWidth(s);
  const h = frameHalf(s);
  const byKey = new Map(cells.map((c) => [`${c.x},${c.y}`, c]));

  const headerParts: string[] = [];
  for (let col = 0; col < s; col++) {
    headerParts.push(padField(String(col), w));
  }
  // Leading spaces so the header aligns with the cell grid (row label + gap).
  const rowLabelW = w;
  const lines: string[] = [
    `${" ".repeat(rowLabelW)} ${headerParts.join(" ")}`,
  ];

  for (let row = 0; row < s; row++) {
    const y = row - h;
    const parts: string[] = [];
    for (let col = 0; col < s; col++) {
      const x = col - h;
      let glyph: string;
      if (assigned && assigned.x === x && assigned.y === y) {
        glyph = "?";
      } else {
        const cell = byKey.get(`${x},${y}`);
        glyph = cell ? patternGlyph(cell.pattern) : "·";
      }
      parts.push(padField(glyph, w));
    }
    lines.push(`${padField(String(row), rowLabelW)} ${parts.join(" ")}`);
  }

  return lines.join("\n");
}

export function canvasLegend(showAssigned: boolean): string {
  const base =
    "· not yet drawn   ▢ deliberately left empty (the centre was left empty by the author)";
  return showAssigned ? `${base}   ? your cell` : base;
}

export async function getFrameSize(db: QueryDb = getDb()): Promise<number> {
  const rows = await db
    .select()
    .from(canvasState)
    .where(eq(canvasState.id, 1))
    .limit(1);
  return rows[0]?.frameSize ?? 5;
}

export async function loadValidCells(
  db: QueryDb = getDb(),
): Promise<CanvasCell[]> {
  const rows = await db
    .select({
      x: drawings.x,
      y: drawings.y,
      pattern: drawings.pattern,
      kind: drawings.kind,
    })
    .from(drawings)
    .where(eq(drawings.status, "valid"));
  return rows;
}

export async function countValidVisitorDrawings(
  db: QueryDb = getDb(),
): Promise<number> {
  const result = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(drawings)
    .where(
      and(eq(drawings.status, "valid"), eq(drawings.kind, "visitor")),
    );
  return result[0]?.n ?? 0;
}

/**
 * Apply growth rule inside an open transaction. Locks canvas_state.
 * Returns the (possibly new) frame size.
 */
export async function applyGrowthRule(tx: QueryDb): Promise<number> {
  const stateRows = await tx
    .select()
    .from(canvasState)
    .where(eq(canvasState.id, 1))
    .for("update");
  let s = stateRows[0]?.frameSize ?? 5;
  const count = await countValidVisitorDrawings(tx);
  while (count >= growthThreshold(s)) {
    s = s + 2;
  }
  if (stateRows[0] && stateRows[0].frameSize !== s) {
    await tx
      .update(canvasState)
      .set({ frameSize: s })
      .where(eq(canvasState.id, 1));
  }
  return s;
}

/** Unfilled absolute coords in the current frame (seed excluded). */
export function unfilledInFrame(
  s: number,
  validCells: CanvasCell[],
): CellCoord[] {
  const filled = new Set(validCells.map((c) => `${c.x},${c.y}`));
  return frameCoords(s).filter(
    (c) => !isSeed(c.x, c.y) && !filled.has(`${c.x},${c.y}`),
  );
}

/** Uniform random unfilled cell; grows the frame in-memory if somehow full. */
export function pickRandomUnfilled(
  s: number,
  validCells: CanvasCell[],
  rand: () => number = Math.random,
): { cell: CellCoord; frameSize: number } {
  let frame = s;
  let candidates = unfilledInFrame(frame, validCells);
  while (candidates.length === 0) {
    frame = frame + 2;
    candidates = unfilledInFrame(frame, validCells);
  }
  const idx = Math.floor(rand() * candidates.length);
  return { cell: candidates[idx]!, frameSize: frame };
}

/** Ensure vocab glyphs are loaded (side effect for render). */
export function ensureVocabLoaded(): void {
  loadEra1Vocab();
}
