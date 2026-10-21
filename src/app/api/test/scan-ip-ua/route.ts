import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { refuseProductionTestRoute } from "@/lib/test-routes";
import { testHooksAllowed } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

/**
 * Preview-only §15: scan era-1 tables for IP- or raw-UA-like strings.
 */
export async function GET(request: NextRequest) {
  const refused = refuseProductionTestRoute();
  if (refused) return refused;
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getDb();
  const tables = ["visits", "drawings", "census", "canvas_state"] as const;
  const ipRe =
    /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/;
  const uaRe = /Mozilla\/|Chrome\/|Safari\/|AppleWebKit|User-Agent/i;
  const hits: string[] = [];

  for (const t of tables) {
    const result = await db.execute(
      sql.raw(`select row_to_json(t)::text as j from ${t} t`),
    );
    const rows = (
      Array.isArray(result) ? result : (result.rows ?? [])
    ) as Record<string, unknown>[];
    for (const r of rows) {
      const j = String(r.j ?? "");
      if (ipRe.test(j) || uaRe.test(j)) hits.push(t);
    }
  }

  return NextResponse.json({
    ok: true,
    hits: [...new Set(hits)],
  });
}
