import { NextResponse, type NextRequest } from "next/server";
import {
  activeCensusFields,
  isValidCensusOption,
  isValidPatternId,
  loadEra1Vocab,
} from "@/lib/era1-vocab";
import { writeCensusAnswer, writeDrawing } from "@/lib/era1-write";
import { verifySignature } from "@/lib/link-sign";
import {
  checkDrawLimit,
  checkWriteLimit,
} from "@/lib/rate-limit";
import { redirectIfUnavailable } from "@/lib/upstash-response";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import {
  getVisit,
  incrementLateFetches,
  isVisitUnusable,
  markVisitRateLimited,
} from "@/lib/visits";
import { finishVisit } from "@/lib/era1-write";

export const dynamic = "force-dynamic";

function redirectTo(url: string) {
  const res = NextResponse.redirect(url, 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const form = await request.formData();
  const v = String(form.get("v") ?? "");
  const n = String(form.get("n") ?? "");
  const pattern = String(form.get("pattern") ?? "");
  const x = Number(form.get("x"));
  const y = Number(form.get("y"));

  if (
    !isValidVisitIdFormat(v) ||
    !isValidPatternId(pattern) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  const writeLim = await checkWriteLimit();
  const closed = redirectIfUnavailable(origin, writeLim);
  if (closed) return closed;
  if (!writeLim.success) {
    await markVisitRateLimited(v).catch(() => {});
    return redirectTo(`${origin}/rate-limited`);
  }
  const drawLim = await checkDrawLimit();
  const closedDraw = redirectIfUnavailable(origin, drawLim);
  if (closedDraw) return closedDraw;
  if (!drawLim.success) {
    return redirectTo(`${origin}/source-cap`);
  }

  const visit = await getVisit(v);
  if (!visit || (await isVisitUnusable(visit))) {
    return redirectTo(`${origin}/`);
  }

  const verified = verifySignature(n, {
    visitId: visit.id,
    action: "form",
    target: "",
    x: String(x),
    y: String(y),
  });
  if (!verified.ok) {
    await incrementLateFetches(visit.id);
    return redirectTo(`${origin}/sign?v=${visit.id}&note=expired`);
  }

  const drawn = await writeDrawing({
    visitId: visit.id,
    patternId: pattern,
    x,
    y,
    path: "form",
  });
  if (!drawn.ok) {
    if (drawn.reason === "cell_taken") {
      const q = new URLSearchParams({ v: visit.id, note: "taken" });
      const vocab = loadEra1Vocab();
      for (const field of activeCensusFields(vocab)) {
        const raw = form.get(field.id);
        if (raw != null && String(raw) !== "") {
          q.set(field.id, String(raw));
        }
      }
      if (pattern) q.set("pattern", pattern);
      return redirectTo(`${origin}/sign?${q.toString()}`);
    }
    return redirectTo(`${origin}/sign?v=${visit.id}&note=expired`);
  }

  const vocab = loadEra1Vocab();
  for (const field of activeCensusFields(vocab)) {
    const raw = form.get(field.id);
    if (raw == null || String(raw) === "") continue;
    const value = String(raw);
    if (!isValidCensusOption(field.id, value, vocab)) continue;
    const ans = await writeCensusAnswer({
      visitId: visit.id,
      field: field.id,
      value,
      path: "form",
    });
    if (ans.ok && ans.visit.status === "branched") {
      return redirectTo(`${origin}/s/${visit.id}/thanks`);
    }
  }

  const finished = await finishVisit(visit.id);
  if (!finished.ok) {
    return redirectTo(`${origin}/s/${visit.id}/thanks`);
  }
  return redirectTo(`${origin}/s/${visit.id}/thanks`);
}
