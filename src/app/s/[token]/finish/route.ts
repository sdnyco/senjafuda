import { NextResponse } from "next/server";
import { commitSigned, recordSweepGet } from "@/lib/answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { markRateLimited } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function redirect(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const commitLimit = await checkRateLimit("commit");
  if (!commitLimit.success) {
    await markRateLimited(token).catch(() => undefined);
    await recordSweepGet(token);
    return redirect(new URL("/rate-limited", request.url).toString());
  }

  const result = await commitSigned(token);
  await recordSweepGet(token);
  if (!result.ok && result.reason === "not_found") {
    return redirect(new URL("/", request.url).toString());
  }
  return redirect(new URL(`/s/${token}/thanks`, request.url).toString());
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
