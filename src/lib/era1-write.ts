import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  canvasState,
  census,
  drawings,
  visits,
  type Drawing,
  type Visit,
} from "@/db/schema";
import {
  applyGrowthRule,
  loadValidCells,
  pickRandomUnfilled,
  getFrameSize,
  absToRowCol,
  type CellCoord,
} from "./canvas";
import {
  censusOptionOrder,
  censusOptionPosition,
  patternOptionOrder,
} from "./era1-shuffle";
import {
  getCensusField,
  isValidCensusOption,
  isValidDeclineReason,
  isValidPatternId,
  loadEra1Vocab,
  nextCensusFieldId,
} from "./era1-vocab";
import { noteSweepHit } from "./rate-limit";
import { getVisit, getVisitDrawing } from "./visits";

const SWEEP_AFTER_COMPLETE_MS = 10_000;
const CORRECTION_MS = 30_000;

export type WritePath = "link" | "form";

export type SweepMark = "none" | "branched" | "swept" | "unavailable";

export async function assignCellForVisit(
  force?: CellCoord | null,
): Promise<{ cell: CellCoord; frameSize: number }> {
  const db = getDb();
  let s = await getFrameSize(db);
  const cells = await loadValidCells(db);
  if (force) {
    // Preview test hooks may force a cell even when filled (§13.5 race):
    // the page still shows that cell; the write path returns note=taken.
    if (!(force.x === 0 && force.y === 0)) {
      return { cell: force, frameSize: s };
    }
  }
  const picked = pickRandomUnfilled(s, cells);
  if (picked.frameSize !== s) {
    await db
      .update(canvasState)
      .set({ frameSize: picked.frameSize })
      .where(eq(canvasState.id, 1));
  }
  return { cell: picked.cell, frameSize: picked.frameSize };
}

export type DrawWriteResult =
  | {
      ok: true;
      visit: Visit;
      drawing: Drawing;
      frameSize: number;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "unusable"
        | "already_drawn"
        | "invalid"
        | "cell_taken"
        | "rate_limited";
      visit?: Visit;
      newCell?: CellCoord;
    };

export async function writeDrawing(opts: {
  visitId: string;
  patternId: string;
  x: number;
  y: number;
  path: WritePath;
}): Promise<DrawWriteResult> {
  if (!isValidPatternId(opts.patternId)) {
    return { ok: false, reason: "invalid" };
  }

  const db = getDb();

  try {
    return await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(visits)
        .where(eq(visits.id, opts.visitId))
        .for("update")
        .limit(1);
      const visit = locked[0];
      if (!visit) return { ok: false, reason: "not_found" };

      if (visit.status !== "issued") {
        if (visit.status === "drawn") {
          return { ok: false, reason: "already_drawn", visit };
        }
        return { ok: false, reason: "unusable", visit };
      }
      if (visit.expiresAt.getTime() <= Date.now()) {
        return { ok: false, reason: "unusable", visit };
      }

      const existing = await tx
        .select()
        .from(drawings)
        .where(
          and(
            eq(drawings.visitId, visit.id),
            eq(drawings.kind, "visitor"),
          ),
        )
        .limit(1);
      if (existing[0]) {
        return { ok: false, reason: "already_drawn", visit };
      }

      const optionOrder = patternOptionOrder(visit.id);
      const now = new Date();
      try {
        const inserted = await tx
          .insert(drawings)
          .values({
            visitId: visit.id,
            kind: "visitor",
            x: opts.x,
            y: opts.y,
            pattern: opts.patternId,
            path: opts.path,
            optionOrder,
            status: "valid",
            excludedReason: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx
          .update(visits)
          .set({ status: "drawn" })
          .where(eq(visits.id, visit.id));
        const frameSize = await applyGrowthRule(tx);
        return {
          ok: true,
          visit: { ...visit, status: "drawn" },
          drawing: inserted[0]!,
          frameSize,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/unique|duplicate/i.test(msg)) {
          return { ok: false, reason: "cell_taken", visit };
        }
        throw err;
      }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(msg)) {
      const visit = await getVisit(opts.visitId);
      return { ok: false, reason: "cell_taken", visit: visit ?? undefined };
    }
    throw err;
  }
}

export type CensusWriteResult =
  | {
      ok: true;
      visit: Visit;
      nextFieldId: string | null;
      signed: boolean;
    }
  | {
      ok: false;
      reason: "not_found" | "unusable" | "invalid" | "not_drawn";
      visit?: Visit;
    };

export async function writeCensusAnswer(opts: {
  visitId: string;
  field: string;
  value: string;
  path: WritePath;
}): Promise<CensusWriteResult> {
  const vocab = loadEra1Vocab();
  if (!isValidCensusOption(opts.field, opts.value, vocab)) {
    return { ok: false, reason: "invalid" };
  }
  const fieldDef = getCensusField(opts.field, vocab);
  if (!fieldDef && opts.value !== vocab.skip_value) {
    return { ok: false, reason: "invalid" };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(visits)
      .where(eq(visits.id, opts.visitId))
      .for("update")
      .limit(1);
    let visit = locked[0];
    if (!visit) return { ok: false, reason: "not_found" };
    if (visit.status !== "drawn") {
      if (isEra1Closed(visit.status)) {
        return { ok: false, reason: "unusable", visit };
      }
      return { ok: false, reason: "not_drawn", visit };
    }

    const now = new Date();
    const existing = await tx
      .select()
      .from(census)
      .where(
        and(
          eq(census.visitId, visit.id),
          eq(census.field, opts.field),
          eq(census.superseded, false),
        ),
      )
      .orderBy(desc(census.answeredAt));

    const latest = existing[0];
    if (latest && latest.value === opts.value) {
      const age = now.getTime() - latest.answeredAt.getTime();
      if (age < CORRECTION_MS) {
        const next = nextCensusFieldId(opts.field, vocab);
        return { ok: true, visit, nextFieldId: next, signed: false };
      }
    }

    if (latest && latest.value !== opts.value) {
      const age = now.getTime() - latest.answeredAt.getTime();
      if (age < CORRECTION_MS) {
        await tx.insert(census).values({
          visitId: visit.id,
          field: opts.field,
          value: opts.value,
          answeredAt: now,
          path: opts.path,
          position: fieldDef
            ? censusOptionPosition(fieldDef, visit.id, opts.value, vocab)
            : null,
          optionOrder: fieldDef
            ? censusOptionOrder(fieldDef, visit.id, vocab)
            : null,
          superseded: false,
          updatedAt: now,
        });
        const completedAt = now;
        await tx
          .update(visits)
          .set({ status: "branched", completedAt })
          .where(eq(visits.id, visit.id));
        await excludeVisitDrawing(tx, visit.id, "branched");
        return {
          ok: true,
          visit: { ...visit, status: "branched", completedAt },
          nextFieldId: null,
          signed: false,
        };
      }
      // Correction ≥ 30 s: supersede all earlier non-superseded rows
      await tx
        .update(census)
        .set({ superseded: true })
        .where(
          and(
            eq(census.visitId, visit.id),
            eq(census.field, opts.field),
            eq(census.superseded, false),
          ),
        );
    }

    await tx.insert(census).values({
      visitId: visit.id,
      field: opts.field,
      value: opts.value,
      answeredAt: now,
      path: opts.path,
      position: fieldDef
        ? censusOptionPosition(fieldDef, visit.id, opts.value, vocab)
        : null,
      optionOrder: fieldDef
        ? censusOptionOrder(fieldDef, visit.id, vocab)
        : null,
      superseded: false,
      updatedAt: now,
    });

    const next = nextCensusFieldId(opts.field, vocab);
    if (!next) {
      const completedAt = now;
      await tx
        .update(visits)
        .set({ status: "signed", completedAt })
        .where(eq(visits.id, visit.id));
      return {
        ok: true,
        visit: { ...visit, status: "signed", completedAt },
        nextFieldId: null,
        signed: true,
      };
    }
    return { ok: true, visit, nextFieldId: next, signed: false };
  });
}

function isEra1Closed(status: string): boolean {
  return (
    status === "signed" ||
    status === "declined" ||
    status === "branched"
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function excludeVisitDrawing(
  tx: any,
  visitId: string,
  reason: string,
): Promise<void> {
  await tx
    .update(drawings)
    .set({ status: "excluded", excludedReason: reason })
    .where(
      and(
        eq(drawings.visitId, visitId),
        eq(drawings.kind, "visitor"),
        eq(drawings.status, "valid"),
      ),
    );
}

export async function finishVisit(
  visitId: string,
): Promise<CensusWriteResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(visits)
      .where(eq(visits.id, visitId))
      .for("update")
      .limit(1);
    const visit = locked[0];
    if (!visit) return { ok: false, reason: "not_found" };
    if (visit.status !== "drawn") {
      return { ok: false, reason: "unusable", visit };
    }
    const completedAt = new Date();
    await tx
      .update(visits)
      .set({ status: "signed", completedAt })
      .where(eq(visits.id, visit.id));
    return {
      ok: true,
      visit: { ...visit, status: "signed", completedAt },
      nextFieldId: null,
      signed: true,
    };
  });
}

export async function writeDecline(opts: {
  visitId: string;
  reasonId: string;
  path: WritePath;
}): Promise<CensusWriteResult> {
  if (!isValidDeclineReason(opts.reasonId)) {
    return { ok: false, reason: "invalid" };
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(visits)
      .where(eq(visits.id, opts.visitId))
      .for("update")
      .limit(1);
    const visit = locked[0];
    if (!visit) return { ok: false, reason: "not_found" };
    if (visit.status !== "issued") {
      return { ok: false, reason: "unusable", visit };
    }
    const now = new Date();
    await tx.insert(census).values({
      visitId: visit.id,
      field: "decline_reason",
      value: opts.reasonId,
      answeredAt: now,
      path: opts.path,
      position: null,
      optionOrder: null,
      superseded: false,
      updatedAt: now,
    });
    await tx
      .update(visits)
      .set({ status: "declined", completedAt: now })
      .where(eq(visits.id, visit.id));
    return {
      ok: true,
      visit: { ...visit, status: "declined", completedAt: now },
      nextFieldId: null,
      signed: false,
    };
  });
}

/**
 * Fast-sweep: every /s/ GET counts.
 * Pre-terminal → branched + exclude drawing.
 * Post signed/declined within 10s → swept + exclude drawing.
 */
export async function applySweepHit(visitId: string): Promise<SweepMark> {
  const hit = await noteSweepHit(visitId);
  if (hit.unavailable) return "unavailable";
  if (!hit.tripped) return "none";

  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(visits)
      .where(eq(visits.id, visitId))
      .for("update")
      .limit(1);
    const visit = locked[0];
    if (!visit) return "none";

    if (visit.status === "issued" || visit.status === "drawn") {
      const completedAt = new Date();
      await tx
        .update(visits)
        .set({ status: "branched", completedAt })
        .where(eq(visits.id, visit.id));
      await excludeVisitDrawing(tx, visit.id, "branched");
      return "branched";
    }

    if (
      (visit.status === "signed" || visit.status === "declined") &&
      visit.completedAt &&
      Date.now() - visit.completedAt.getTime() <= SWEEP_AFTER_COMPLETE_MS
    ) {
      await tx
        .update(visits)
        .set({ swept: true })
        .where(eq(visits.id, visit.id));
      await excludeVisitDrawing(tx, visit.id, "swept");
      return "swept";
    }
    return "none";
  });
}

export async function unansweredCensusField(
  visitId: string,
): Promise<string | null> {
  const vocab = loadEra1Vocab();
  const db = getDb();
  const rows = await db
    .select()
    .from(census)
    .where(
      and(eq(census.visitId, visitId), eq(census.superseded, false)),
    );
  const answered = new Set(rows.map((r) => r.field));
  for (const f of vocab.fields.filter((x) => x.enabled)) {
    if (!answered.has(f.id)) return f.id;
  }
  return null;
}

export function drawingRowCol(drawing: Drawing, frameSize: number) {
  return absToRowCol(drawing.x, drawing.y, frameSize);
}

export { getVisitDrawing };
