import { NextResponse, type NextRequest } from "next/server";
import { resetSourceCapCounters } from "@/lib/rate-limit";
import { testHooksAllowed } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

/**
 * Preview-only: clear this source's draw/decline/write Upstash counters
 * so the §13.9 cap test can start clean.
 */
export async function POST(request: NextRequest) {
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const result = await resetSourceCapCounters();
  if (result.unavailable) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    cleared: result.cleared.length,
  });
}
