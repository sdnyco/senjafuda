import { headers } from "next/headers";
import { Shell } from "@/components/Shell";
import { CanvasPre } from "@/components/CanvasPre";
import { NothingRecorded, RateLimitedPage } from "@/components/StatusPages";
import { getDb } from "@/db";
import { absToRowCol, getFrameSize, loadValidCells } from "@/lib/canvas";
import { assignCellForVisit } from "@/lib/era1-write";
import {
  activeCensusFields,
  loadEra1Vocab,
} from "@/lib/era1-vocab";
import { orderedCensusOptions, orderedPatterns } from "@/lib/era1-shuffle";
import { signForm } from "@/lib/link-sign";
import { checkSGetLimit } from "@/lib/rate-limit";
import { pageIfUnavailable } from "@/lib/upstash-response";
import {
  parseForcedCell,
  parseTtlOverride,
  testHooksAllowed,
} from "@/lib/test-hooks";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { getVisit, isVisitUnusable } from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function SignFormPage({ searchParams }: Props) {
  const sp = await searchParams;
  const v = sp.v ?? "";
  if (!isValidVisitIdFormat(v)) {
    return (
      <NothingRecorded>
        <p>Nothing was recorded from this link.</p>
      </NothingRecorded>
    );
  }

  const sGet = await checkSGetLimit();
  pageIfUnavailable(sGet);
  if (!sGet.success) return <RateLimitedPage />;

  const visit = await getVisit(v);
  if (!visit || visit.status !== "issued" || (await isVisitUnusable(visit))) {
    return (
      <NothingRecorded>
        <p>
          This visit is not open for the form path. Nothing was recorded from
          this link.
        </p>
        <p>
          <a href="/">Start from the home page</a>
        </p>
      </NothingRecorded>
    );
  }

  const h = await headers();
  const hooks = testHooksAllowed(h.get("x-senjafuda-test"));
  const forced = hooks ? parseForcedCell(h.get("x-senjafuda-test-cell")) : null;
  const ttl = hooks
    ? parseTtlOverride(h.get("x-senjafuda-test-ttl"))
    : undefined;

  const { cell, frameSize } = await assignCellForVisit(forced);
  const db = getDb();
  const cells = await loadValidCells(db);
  const { row, col } = absToRowCol(cell.x, cell.y, frameSize);
  const patterns = orderedPatterns(visit.id);
  const vocab = loadEra1Vocab();
  const fields = activeCensusFields(vocab);
  const n = signForm({
    visitId: visit.id,
    x: cell.x,
    y: cell.y,
    ttlSec: ttl,
  });
  const note =
    sp.note === "taken"
      ? "Someone filled that cell a moment ago, so nothing was recorded. Here is another cell. Your census selections are preserved when possible."
      : sp.note === "expired"
        ? "That form had expired, so nothing was recorded. Here is the form again."
        : null;

  return (
    <Shell>
      {note ? <p className="banner">{note}</p> : null}
      <h1>
        Your cell is row {row}, column {col}. Choose what it should hold.
      </h1>
      <CanvasPre frameSize={frameSize} cells={cells} assigned={cell} />
      <form method="post" action="/sign/submit">
        <input type="hidden" name="v" value={visit.id} />
        <input type="hidden" name="n" value={n} />
        <input type="hidden" name="x" value={cell.x} />
        <input type="hidden" name="y" value={cell.y} />

        <fieldset className="form-field">
          <legend>Pattern</legend>
          <div className="form-options">
            {patterns.map((p) => (
              <label key={p.id}>
                <input
                  type="radio"
                  name="pattern"
                  value={p.id}
                  required
                  defaultChecked={sp.pattern === p.id}
                />
                <span className="mono">{p.glyph}</span> {p.description}
              </label>
            ))}
          </div>
        </fieldset>

        {fields.map((f) => {
          const options = orderedCensusOptions(f, visit.id, vocab);
          const preserved = sp[f.id];
          return (
            <fieldset key={f.id} className="form-field">
              <legend>{f.question}</legend>
              <div className="form-options">
                {options.map((o) => (
                  <label key={o.id}>
                    <input
                      type="radio"
                      name={f.id}
                      value={o.id}
                      defaultChecked={preserved === o.id}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <button className="btn" type="submit">
          Submit
        </button>
      </form>
      <nav className="meta-nav">
        <a href={`/s/${visit.id}/draw`} rel="nofollow">
          → Use the link path instead
        </a>
        <a href="/">Home</a>
      </nav>
    </Shell>
  );
}
