import { NextResponse, type NextRequest } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { census } from "@/db/schema";
import { refuseProductionTestRoute } from "@/lib/test-routes";
import { testHooksAllowed } from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";

export const dynamic = "force-dynamic";

/**
 * Preview-only §13.12: confirm a superseded census row exists for a visit/field.
 */
export async function GET(request: NextRequest) {
  const refused = refuseProductionTestRoute();
  if (refused) return refused;
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const visitId = request.nextUrl.searchParams.get("v") ?? "";
  const field = request.nextUrl.searchParams.get("field") ?? "arrival";
  if (!isValidVisitIdFormat(visitId)) {
    return NextResponse.json({ error: "bad visit" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db
    .select({
      n: sql<number>`count(*)::int`,
    })
    .from(census)
    .where(
      and(
        eq(census.visitId, visitId),
        eq(census.field, field),
        eq(census.superseded, true),
      ),
    );

  return NextResponse.json({
    ok: true,
    visitId,
    field,
    supersededCount: rows[0]?.n ?? 0,
  });
}