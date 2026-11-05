import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { CanvasPre } from "@/components/CanvasPre";
import {
  RateLimitedPage,
  StaleVisitPage,
} from "@/components/StatusPages";
import { absToRowCol } from "@/lib/canvas";
import { assignCellForVisit, applySweepHit } from "@/lib/era1-write";
import { orderedPatterns } from "@/lib/era1-shuffle";
import { loadValidCells, getFrameSize } from "@/lib/canvas";
import { getDb } from "@/db";
import {
  signDrawLink,
  signFinishLink,
  signFreshLink,
} from "@/lib/link-sign";
import { unansweredCensusField } from "@/lib/era1-write";
import { checkSGetLimit } from "@/lib/rate-limit";
import { pageIfUnavailable, redirectTemporarilyClosedPage } from "@/lib/upstash-response";
import {
  parseForcedCell,
  parseTtlOverride,
  testHooksAllowed,
} from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import {
  getVisit,
  isRecentlyDrawn,
  isVisitUnusable,
} from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ v: string }>;
  searchParams: Promise<{ note?: string }>;
};

export default async function DrawPage({ params, searchParams }: Props) {
  const { v } = await params;
  const sp = await searchParams;
  const h = await headers();

  if (!isValidVisitIdFormat(v)) {
    notFound();
  }

  const sGet = await checkSGetLimit();
  pageIfUnavailable(sGet);
  if (!sGet.success) {
    return <RateLimitedPage />;
  }

  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;

  const visit = await getVisit(v);
  if (!visit || (await isVisitUnusable(visit))) {
    // Spec 004: no auto-remint, no sweep on stale early return.
    const freshN = signFreshLink({ visitId: visit?.id ?? v, ttlSec: ttl });
    return <StaleVisitPage visitId={visit?.id ?? v} freshN={freshN} />;
  }

  let note: string | null =
    sp.note === "expired"
      ? "That link had expired, so nothing was recorded. Here is the step again."
      : sp.note === "taken"
        ? "Someone filled that cell a moment ago, so nothing was recorded. Here is another cell."
        : sp.note === "stale"
          ? "The link you followed belonged to an earlier visit, so nothing was recorded from it. Here is a fresh cell for you."
          : null;

  if (visit.status === "drawn") {
    const { recent, drawing } = await isRecentlyDrawn(visit);
    if (recent && drawing) {
      const db = getDb();
      const frameSize = await getFrameSize(db);
      const { row, col } = absToRowCol(drawing.x, drawing.y, frameSize);
      const nextField =
        (await unansweredCensusField(visit.id)) ?? "arrival";
      const finishN = signFinishLink({ visitId: visit.id });
      return (
        <Shell>
          <h1>Nothing was recorded</h1>
          <p>
            You have already drawn your cell (row {row}, column {col}). Nothing
            further was written for this draw request.
          </p>
          <nav className="actions">
            <a href={`/s/${visit.id}/${nextField}`} rel="nofollow">
              → Continue to the next question
            </a>
            <a
              href={`/s/${visit.id}/finish?n=${encodeURIComponent(finishN)}`}
              rel="nofollow"
            >
              → Finish now
            </a>
          </nav>
        </Shell>
      );
    }
  }

  const sweep = await applySweepHit(visit.id);
  if (sweep === "unavailable") {
    redirectTemporarilyClosedPage();
  }
  if (sweep === "branched" || sweep === "swept") {
    const freshN = signFreshLink({ visitId: visit.id, ttlSec: ttl });
    return <StaleVisitPage visitId={visit.id} freshN={freshN} />;
  }

  const forced = hooks ? parseForcedCell(h.get("x-senjafuda-test-cell")) : null;

  const { cell, frameSize } = await assignCellForVisit(forced);
  const db = getDb();
  const cells = await loadValidCells(db);
  const { row, col } = absToRowCol(cell.x, cell.y, frameSize);
  const patterns = orderedPatterns(visit.id);

  return (
    <Shell>
      {note ? <p className="banner">{note}</p> : null}
      <h1>
        Your cell is row {row}, column {col}. Choose what it should hold.
      </h1>
      <CanvasPre frameSize={frameSize} cells={cells} assigned={cell} />
      <ul className="option-list">
        {patterns.map((p) => {
          const n = signDrawLink({
            visitId: visit.id,
            patternId: p.id,
            x: cell.x,
            y: cell.y,
            ttlSec: ttl,
          });
          return (
            <li key={p.id}>
              <a
                href={`/s/${visit.id}/draw/${p.id}?n=${encodeURIComponent(n)}&x=${cell.x}&y=${cell.y}`}
                rel="nofollow"
              >
                <span className="mono">{p.glyph}</span>
                <span>{p.description}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <nav className="meta-nav">
        <a href={`/s/${visit.id}/decline`} rel="nofollow">
          → Decline instead
        </a>
        <a href="/">Home</a>
      </nav>
    </Shell>
  );
}
