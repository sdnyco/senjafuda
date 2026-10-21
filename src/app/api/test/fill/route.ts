import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { drawings, visits } from "@/db/schema";
import { applyGrowthRule } from "@/lib/canvas";
import { assignCellForVisit } from "@/lib/era1-write";
import { patternOptionOrder } from "@/lib/era1-shuffle";
import { testHooksAllowed } from "@/lib/test-hooks";
import { issueVisit } from "@/lib/visits";

export const dynamic = "force-dynamic";

/**
 * Preview-only: create n valid visitor drawings via insert + growth.
 * Header x-senjafuda-test must equal TEST_HOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const count = Number(request.nextUrl.searchParams.get("count") ?? "0");
  if (!Number.isFinite(count) || count < 1 || count > 200) {
    return NextResponse.json({ error: "bad count" }, { status: 400 });
  }

  const db = getDb();
  let created = 0;

  for (let i = 0; i < count; i++) {
    const visit = await issueVisit("Senjafuda-TestHook/1.0");
    const { cell } = await assignCellForVisit();
    const now = new Date();
    try {
      await db.insert(drawings).values({
        visitId: visit.id,
        kind: "visitor",
        x: cell.x,
        y: cell.y,
        pattern: "p15",
        path: "link",
        optionOrder: patternOptionOrder(visit.id),
        status: "valid",
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      continue;
    }
    await db
      .update(visits)
      .set({ status: "drawn" })
      .where(eq(visits.id, visit.id));
    await applyGrowthRule(db);
    created += 1;
  }

  const { getFrameSize } = await import("@/lib/canvas");
  const frameSize = await getFrameSize(db);
  return NextResponse.json({ created, frameSize });
}
