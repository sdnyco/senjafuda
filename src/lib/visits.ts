import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drawings, visits, type Drawing, type Visit } from "@/db/schema";
import {
  era1EffectiveStatus,
  isEra1TerminalStored,
} from "./era1-effective-status";
import { classifyUserAgent, isUaSuspect } from "./ua-rules";
import { generateVisitId } from "./visit-id";
import { visitPublicId } from "./public-id-env";
import { loadEra1Vocab } from "./era1-vocab";

const VISIT_TTL_MS = 24 * 60 * 60 * 1000;
const UNUSED_ISSUED_MS = 30 * 60 * 1000;
const DRAWN_USABLE_MS = 30 * 60 * 1000;

export async function issueVisit(
  uaHeader: string | null,
  inheritedFromPublicId: string | null = null,
  freshParentPublicId: string | null = null,
): Promise<Visit> {
  const db = getDb();
  const classified = classifyUserAgent(uaHeader);
  const vocab = loadEra1Vocab();
  const now = new Date();
  const row = {
    id: generateVisitId(),
    era: 1,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + VISIT_TTL_MS),
    vocabVersion: vocab.version,
    uaRulesVersion: classified.uaRulesVersion,
    uaClass: classified.uaClass,
    uaFamily: classified.uaFamily,
    uaSuspect: isUaSuspect(uaHeader),
    status: "issued" as const,
    swept: false,
    rateLimited: false,
    lateFetches: 0,
    inheritedFrom: inheritedFromPublicId,
    freshParent: freshParentPublicId,
    completedAt: null,
    updatedAt: now,
  };
  await db.insert(visits).values(row);
  return row;
}

export async function getVisit(id: string): Promise<Visit | null> {
  const db = getDb();
  const rows = await db.select().from(visits).where(eq(visits.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getVisitDrawing(
  visitId: string,
): Promise<Drawing | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(drawings)
    .where(
      and(eq(drawings.visitId, visitId), eq(drawings.kind, "visitor")),
    )
    .orderBy(desc(drawings.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function incrementLateFetches(visitId: string): Promise<void> {
  const db = getDb();
  const v = await getVisit(visitId);
  if (!v) return;
  await db
    .update(visits)
    .set({ lateFetches: v.lateFetches + 1 })
    .where(eq(visits.id, visitId));
}

export async function markVisitRateLimited(visitId: string): Promise<void> {
  const db = getDb();
  await db
    .update(visits)
    .set({ rateLimited: true })
    .where(eq(visits.id, visitId));
}

/**
 * R1: visit is unusable for write / draw-entry remint.
 * Derived expiry; terminal stored; issued >30m; drawn with drawing >30m.
 */
export async function isVisitUnusable(visit: Visit): Promise<boolean> {
  const effective = era1EffectiveStatus(
    visit.status,
    visit.expiresAt,
    new Date(),
    visit.swept,
  );
  if (effective === "expired") return true;
  if (isEra1TerminalStored(visit.status)) return true;
  if (visit.status === "issued") {
    if (Date.now() - visit.issuedAt.getTime() > UNUSED_ISSUED_MS) return true;
  }
  if (visit.status === "drawn") {
    const drawing = await getVisitDrawing(visit.id);
    if (!drawing) return true;
    if (Date.now() - drawing.createdAt.getTime() > DRAWN_USABLE_MS) return true;
  }
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      const code = (cur as { code?: string }).code;
      if (code === "23505") return true;
      cur = (cur as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return /unique|duplicate|23505/i.test(parts.join("\n"));
}

/**
 * Spec 004 R2: child of A is a visit with fresh_parent = public_id(A),
 * or (pre-R2) the earliest visit with inherited_from = public_id(A).
 */
export async function findExistingFreshChild(
  parentPublicId: string,
): Promise<Visit | null> {
  const db = getDb();
  const byFresh = await db
    .select()
    .from(visits)
    .where(eq(visits.freshParent, parentPublicId))
    .limit(1);
  if (byFresh[0]) return byFresh[0];

  const byInherited = await db
    .select()
    .from(visits)
    .where(eq(visits.inheritedFrom, parentPublicId))
    .orderBy(asc(visits.issuedAt), asc(visits.id))
    .limit(1);
  return byInherited[0] ?? null;
}

export type RemintResult =
  | { kind: "created"; visit: Visit }
  | { kind: "existing"; visit: Visit };

/**
 * Spec 004 R2: at most one child remint per parent.
 * Sets both inherited_from and fresh_parent to public_id(parent) when salt
 * is available (including unknown well-formed parent ids).
 */
export async function remintFromOrExisting(
  oldVisitId: string,
  uaHeader: string | null,
): Promise<RemintResult> {
  let parentPublicId: string | null = null;
  try {
    parentPublicId = visitPublicId(oldVisitId);
  } catch {
    parentPublicId = null;
  }

  if (parentPublicId) {
    const existing = await findExistingFreshChild(parentPublicId);
    if (existing) {
      return { kind: "existing", visit: existing };
    }
  }

  try {
    const visit = await issueVisit(
      uaHeader,
      parentPublicId,
      parentPublicId,
    );
    return { kind: "created", visit };
  } catch (err) {
    if (parentPublicId && isUniqueViolation(err)) {
      const winner = await findExistingFreshChild(parentPublicId);
      if (winner) return { kind: "existing", visit: winner };
    }
    throw err;
  }
}

/** @deprecated Prefer remintFromOrExisting (spec 004 R2). */
export async function remintFrom(
  oldVisitId: string | null,
  uaHeader: string | null,
): Promise<Visit> {
  if (!oldVisitId) {
    return issueVisit(uaHeader, null, null);
  }
  const result = await remintFromOrExisting(oldVisitId, uaHeader);
  return result.visit;
}

/** Drawing still within the 30m census window (R2). */
export async function isRecentlyDrawn(visit: Visit): Promise<{
  recent: boolean;
  drawing: Drawing | null;
}> {
  if (visit.status !== "drawn") {
    return { recent: false, drawing: null };
  }
  const drawing = await getVisitDrawing(visit.id);
  if (!drawing) return { recent: false, drawing: null };
  const recent =
    Date.now() - drawing.createdAt.getTime() <= DRAWN_USABLE_MS;
  return { recent, drawing };
}
