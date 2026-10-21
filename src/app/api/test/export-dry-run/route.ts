import { createHash, randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { canvasState, census, drawings, visits } from "@/db/schema";
import { renderCanvasText, type CanvasCell } from "@/lib/canvas";
import { publicId } from "@/lib/public-id";
import { era1EffectiveStatus } from "@/lib/era1-effective-status";
import { testHooksAllowed } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Preview-only §14 helper: build public export blobs + sealed delta plaintext
 * for the smoke runner to age-encrypt/decrypt locally with a throwaway key.
 */
export async function POST(request: NextRequest) {
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const salt = process.env.EXPORT_ID_SALT || randomBytes(16).toString("hex");
  const db = getDb();
  const exportedAt = new Date();
  const day = exportedAt.toISOString().slice(0, 10);

  const frameRows = await db
    .select()
    .from(canvasState)
    .where(eq(canvasState.id, 1));
  const frameSize = frameRows[0]?.frameSize ?? 5;
  const validDrawings = await db
    .select()
    .from(drawings)
    .where(eq(drawings.status, "valid"));
  const cells: CanvasCell[] = validDrawings.map((d) => ({
    x: d.x,
    y: d.y,
    pattern: d.pattern,
    kind: d.kind,
  }));

  const canvasTxt = renderCanvasText({ frameSize, cells });
  const canvasJson = JSON.stringify({
    frame_size: frameSize,
    cells: validDrawings.map((d) => ({
      x: d.x,
      y: d.y,
      pattern: d.pattern,
      seed: d.kind === "seed",
    })),
  });
  const visitRows = await db.select().from(visits);
  const visitorValid = validDrawings.filter((d) => d.kind === "visitor").length;
  const declines = visitRows.filter((v) => v.status === "declined").length;
  const totals = JSON.stringify({
    visits: visitRows.length,
    entries: visitorValid,
    declines,
  });

  const publicBlob = canvasTxt + canvasJson + totals;
  const hasVisitId = /[A-Z2-7]{26}/.test(publicBlob);
  const hasIsoTs = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(publicBlob);
  const hasUa =
    /ua_class|ua_family|Mozilla\/|Chrome\/|User-Agent/i.test(publicBlob);

  const start = new Date(
    Date.UTC(
      exportedAt.getUTCFullYear(),
      exportedAt.getUTCMonth(),
      exportedAt.getUTCDate(),
    ),
  );
  const lines: string[] = [];
  for (const r of visitRows.filter(
    (r) => r.issuedAt >= start || r.updatedAt >= start,
  )) {
    lines.push(
      JSON.stringify({
        table: "visits",
        public_id: publicId(r.id, salt),
        era: r.era,
        issued_at: r.issuedAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
        vocab_version: r.vocabVersion,
        ua_rules_version: r.uaRulesVersion,
        ua_class: r.uaClass,
        ua_family: r.uaFamily,
        ua_suspect: r.uaSuspect,
        status: r.status,
        effective_status: era1EffectiveStatus(
          r.status,
          r.expiresAt,
          exportedAt,
          r.swept,
        ),
        swept: r.swept,
        rate_limited: r.rateLimited,
        late_fetches: r.lateFetches,
        inherited_from: r.inheritedFrom,
        completed_at: r.completedAt ? r.completedAt.toISOString() : null,
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }
  for (const r of (
    await db.select().from(drawings)
  ).filter((r) => r.createdAt >= start || r.updatedAt >= start)) {
    lines.push(
      JSON.stringify({
        table: "drawings",
        id: r.id,
        public_id: r.visitId ? publicId(r.visitId, salt) : null,
        kind: r.kind,
        x: r.x,
        y: r.y,
        pattern: r.pattern,
        path: r.path,
        option_order: r.optionOrder,
        status: r.status,
        excluded_reason: r.excludedReason,
        created_at: r.createdAt.toISOString(),
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }
  for (const r of (
    await db.select().from(census)
  ).filter((r) => r.answeredAt >= start || r.updatedAt >= start)) {
    lines.push(
      JSON.stringify({
        table: "census",
        id: r.id,
        public_id: publicId(r.visitId, salt),
        field: r.field,
        value: r.value,
        answered_at: r.answeredAt.toISOString(),
        path: r.path,
        position: r.position,
        option_order: r.optionOrder,
        superseded: r.superseded,
        updated_at: r.updatedAt.toISOString(),
      }),
    );
  }

  const plaintext = lines.join("\n") + (lines.length ? "\n" : "");
  const deltaHash = sha256Hex(plaintext);
  const chainLine = `${day}  ${deltaHash}  ${"0".repeat(64)}`;

  return NextResponse.json({
    ok: true,
    publicClean: !hasVisitId && !hasIsoTs && !hasUa,
    hasVisitId,
    hasIsoTs,
    hasUa,
    deltaHash,
    chainLine,
    day,
    plaintextBase64: Buffer.from(plaintext, "utf8").toString("base64"),
  });
}
