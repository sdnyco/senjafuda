import { NextResponse } from "next/server";

/**
 * First gate for every `/api/test/*` route: refuse in production before reading
 * any request header or other env (spec R16 / deploy gate).
 */
export function refuseProductionTestRoute(): NextResponse | null {
  if (process.env.VERCEL_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }
  return null;
}
