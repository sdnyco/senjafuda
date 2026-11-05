import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  StaleVisitPage,
  RateLimitedPage,
  NothingRecorded,
} from "@/components/StatusPages";
import { CanvasPre } from "@/components/CanvasPre";
import { getDb } from "@/db";
import { getFrameSize, loadValidCells } from "@/lib/canvas";
import { applySweepHit } from "@/lib/era1-write";
import {
  getCensusField,
  isCensusFieldId,
  loadEra1Vocab,
} from "@/lib/era1-vocab";
import { orderedCensusOptions } from "@/lib/era1-shuffle";
import {
  signCensusLink,
  signFinishLink,
  signFreshLink,
  signSkipLink,
} from "@/lib/link-sign";
import { checkSGetLimit } from "@/lib/rate-limit";
import {
  pageIfUnavailable,
  redirectTemporarilyClosedPage,
} from "@/lib/upstash-response";
import { parseTtlOverride, testHooksAllowed } from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { getVisit, isVisitUnusable } from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ v: string; field: string }>;
  searchParams: Promise<{ note?: string }>;
};

export default async function CensusPage({ params, searchParams }: Props) {
  const { v, field } = await params;
  const sp = await searchParams;

  if (!isValidVisitIdFormat(v) || !isCensusFieldId(field)) {
    notFound();
  }

  const sGet = await checkSGetLimit();
  pageIfUnavailable(sGet);
  if (!sGet.success) return <RateLimitedPage />;

  const h = await headers();
  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;

  const visit = await getVisit(v);
  // Spec 004 R1.9: any unusable / unknown → same single-fresh stale page.
  if (!visit || (await isVisitUnusable(visit))) {
    const freshN = signFreshLink({ visitId: visit?.id ?? v, ttlSec: ttl });
    return <StaleVisitPage visitId={visit?.id ?? v} freshN={freshN} />;
  }

  if (visit.status !== "drawn") {
    return (
      <NothingRecorded>
        <p>
          Draw a cell first. Nothing was recorded from this link.
        </p>
        <p>
          <a href={`/s/${visit.id}/draw`} rel="nofollow">
            → Go to your cell
          </a>
        </p>
      </NothingRecorded>
    );
  }

  const sweep = await applySweepHit(visit.id);
  if (sweep === "unavailable") {
    redirectTemporarilyClosedPage();
  }
  if (sweep === "branched" || sweep === "swept") {
    const freshN = signFreshLink({ visitId: visit.id, ttlSec: ttl });
    return <StaleVisitPage visitId={visit.id} freshN={freshN} />;
  }

  const vocab = loadEra1Vocab();
  const fieldDef = getCensusField(field, vocab);
  if (!fieldDef) notFound();

  const options = orderedCensusOptions(fieldDef, visit.id, vocab);
  const db = getDb();
  const frameSize = await getFrameSize(db);
  const cells = await loadValidCells(db);

  const finishN = signFinishLink({ visitId: visit.id, ttlSec: ttl });
  const skipN = signSkipLink({
    visitId: visit.id,
    field,
    ttlSec: ttl,
  });

  return (
    <Shell>
      {sp.note === "expired" ? (
        <p className="banner">
          That link had expired, so nothing was recorded. Here is the step
          again.
        </p>
      ) : null}
      <h1>{fieldDef.question}</h1>
      <CanvasPre frameSize={frameSize} cells={cells} />
      <ul className="option-list">
        {options.map((o) => {
          const n = signCensusLink({
            visitId: visit.id,
            field,
            value: o.id,
            ttlSec: ttl,
          });
          return (
            <li key={o.id}>
              <a
                href={`/s/${visit.id}/${field}/${o.id}?n=${encodeURIComponent(n)}`}
                rel="nofollow"
              >
                {o.label}
              </a>
            </li>
          );
        })}
      </ul>
      <nav className="meta-nav">
        <a
          href={`/s/${visit.id}/${field}/${vocab.skip_value}?n=${encodeURIComponent(skipN)}`}
          rel="nofollow"
        >
          → Skip this question
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
