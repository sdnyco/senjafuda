import { NextResponse, type NextRequest } from "next/server";
import { testHooksAllowed } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

/**
 * Preview-only: confirm x-senjafuda-test reaches the app (protection bypass
 * must be used by the client). Returns 404 when hooks are refused.
 */
export async function GET(request: NextRequest) {
  if (!testHooksAllowed(request.headers.get("x-senjafuda-test"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    hooks: true,
    env: process.env.VERCEL_ENV ?? null,
  });
}
