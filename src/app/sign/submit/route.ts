import { NextResponse } from "next/server";
import { commitSigned, writeAnswer } from "@/lib/answers";
import { checkRateLimit } from "@/lib/rate-limit";
import { markRateLimited } from "@/lib/tokens";
import { activeFields, isValidOption, loadVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";

function redirect(url: string, status = 302) {
  const res = NextResponse.redirect(url, status);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}

function html(body: string, status: number) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const tokenId = String(form.get("t") ?? "");
  if (!tokenId) {
    return html("<h1>Missing token</h1>", 400);
  }

  const answerLimit = await checkRateLimit("answer");
  const commitLimit = await checkRateLimit("commit");
  if (!answerLimit.success || !commitLimit.success) {
    await markRateLimited(tokenId).catch(() => undefined);
    return redirect(new URL("/rate-limited", request.url).toString(), 429);
  }

  const vocab = loadVocab();
  for (const field of activeFields(vocab)) {
    const raw = form.get(field.id);
    if (raw == null || raw === "") continue;
    const value = String(raw);
    if (!isValidOption(field.id, value, vocab) || value === vocab.skip_value) {
      return html("<h1>Invalid option</h1>", 400);
    }
    const result = await writeAnswer({
      tokenId,
      field: field.id,
      value,
      path: "form",
      countSweep: false,
    });
    if (!result.ok) {
      if (result.reason === "terminal" || result.reason === "expired") {
        return redirect(new URL(`/s/${tokenId}/thanks`, request.url).toString());
      }
      if (result.reason === "not_found") {
        return redirect(new URL("/", request.url).toString());
      }
      return html("<h1>Could not record answer</h1>", 400);
    }
    if (result.token.status === "branched") {
      return redirect(new URL(`/s/${tokenId}/thanks`, request.url).toString());
    }
  }

  await commitSigned(tokenId);
  return redirect(new URL(`/s/${tokenId}/thanks`, request.url).toString());
}

export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
