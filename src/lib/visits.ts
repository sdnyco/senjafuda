import { and, desc, eq } from "drizzle-orm";
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

export async function remintFrom(
  oldVisitId: string | null,
  uaHeader: string | null,
): Promise<Visit> {
  let inherited: string | null = null;
  if (oldVisitId) {
    const old = await getVisit(oldVisitId);
    if (old) {
      try {
        inherited = visitPublicId(old.id);
      } catch {
        inherited = null;
      }
    }
  }
  return issueVisit(uaHeader, inherited);
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
