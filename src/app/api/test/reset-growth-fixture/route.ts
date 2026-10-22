import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { canvasState, drawings } from "@/db/schema";
import { refuseProductionTestRoute } from "@/lib/test-routes";
import { testHooksAllowed } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

/**
 * Preview-only: put growth back to a clean 5×5 seed so §13.7 can assert
 * frameSize === 7 after crossing 12 valid visitor drawings.
 * Excludes existing visitor drawings (does not delete rows).
 */
export async function POST(request: NextRequest) {
  const refused = refuseProductionTestRoute();
  if (refused) return refused;
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getDb();
  const now = new Date();
  await db
    .update(drawings)
    .set({
      status: "excluded",
      excludedReason: "test_fixture",
      updatedAt: now,
    })
    .where(
      and(eq(drawings.kind, "visitor"), eq(drawings.status, "valid")),
    );
  await db
    .update(canvasState)
    .set({ frameSize: 5, updatedAt: now })
    .where(eq(canvasState.id, 1));

  return NextResponse.json({ ok: true, frameSize: 5, visitorValid: 0 });
}
