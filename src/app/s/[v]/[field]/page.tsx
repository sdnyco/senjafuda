import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { VisitClosed, RateLimitedPage, NothingRecorded } from "@/components/StatusPages";
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

  const visit = await getVisit(v);
  if (!visit) {
    return (
      <NothingRecorded>
        <p>
          This visit was not found. Nothing was recorded from this link.
        </p>
      </NothingRecorded>
    );
  }

  if (
    visit.status === "signed" ||
    visit.status === "declined" ||
    visit.status === "branched" ||
    (await isVisitUnusable(visit))
  ) {
    // R1: read pages on terminal/unknown → no remint; offer fresh link
    if (
      visit.status === "signed" ||
      visit.status === "declined" ||
      visit.status === "branched"
    ) {
      const fresh = signFreshLink({ visitId: visit.id });
      return <VisitClosed freshHref={`/s/${visit.id}/fresh?n=${fresh}`} />;
    }
    return (
      <NothingRecorded>
        <p>
          This visit is no longer open. Nothing was recorded from this link.
        </p>
      </NothingRecorded>
    );
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
    const fresh = signFreshLink({ visitId: visit.id });
    return <VisitClosed freshHref={`/s/${visit.id}/fresh?n=${fresh}`} />;
  }

  const vocab = loadEra1Vocab();
  const fieldDef = getCensusField(field, vocab);
  if (!fieldDef) notFound();

  const h = await headers();
  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;

  const options = orderedCensusOptions(fieldDef, visit.id, vocab);
  const db = getDb();
  const frameSize = await getFrameSize(db);
  const cells = await loadValidCells(db);
  const finishN = signFinishLink({ visitId: visit.id, ttlSec: ttl });
  const skipN = signSkipLink({ visitId: visit.id, field, ttlSec: ttl });
  const note =
    sp.note === "expired"
      ? "That link had expired, so nothing was recorded. Here is the step again."
      : null;

  return (
    <Shell>
      {note ? <p className="banner">{note}</p> : null}
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
          href={`/s/${visit.id}/${field}/_skipped?n=${encodeURIComponent(skipN)}`}
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
