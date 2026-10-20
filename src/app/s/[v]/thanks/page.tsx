import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { CanvasPre } from "@/components/CanvasPre";
import { NothingRecorded } from "@/components/StatusPages";
import { getDb } from "@/db";
import { absToRowCol, getFrameSize, loadValidCells } from "@/lib/canvas";
import { getVisitDrawing } from "@/lib/era1-write";
import { visitPublicId } from "@/lib/public-id-env";
import { isValidVisitIdFormat } from "@/lib/visit-id";
import { getVisit } from "@/lib/visits";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ v: string }> };

export default async function ThanksPage({ params }: Props) {
  const { v } = await params;
  if (!isValidVisitIdFormat(v)) {
    return (
      <NothingRecorded>
        <p>Nothing was recorded from this link.</p>
      </NothingRecorded>
    );
  }

  const visit = await getVisit(v);
  if (!visit) {
    return (
      <NothingRecorded>
        <p>This visit was not found. Nothing was recorded from this link.</p>
      </NothingRecorded>
    );
  }

  const drawing = await getVisitDrawing(visit.id);
  const db = getDb();
  const frameSize = await getFrameSize(db);
  const cells = await loadValidCells(db);

  let receipt: ReactNode = null;
  if (
    drawing &&
    (visit.status === "signed" ||
      visit.status === "drawn" ||
      visit.status === "declined")
  ) {
    const { row, col } = absToRowCol(drawing.x, drawing.y, frameSize);
    let publicId = visit.id.slice(0, 8);
    try {
      publicId = visitPublicId(visit.id);
    } catch {
      // salt missing in local — show truncated id only for debug
    }
    receipt = (
      <>
        <CanvasPre frameSize={frameSize} cells={cells} />
        {drawing.status === "valid" ? (
          <p className="receipt">
            your cell: row {row}, column {col}
          </p>
        ) : null}
        <p className="receipt">
          receipt: {publicId}
          {drawing.status === "valid"
            ? ` · absolute (${drawing.x}, ${drawing.y})`
            : ""}
        </p>
      </>
    );
  } else {
    receipt = <CanvasPre frameSize={frameSize} cells={cells} />;
  }

  const heading =
    visit.status === "declined"
      ? "Thank you"
      : visit.status === "branched"
        ? "Nothing further was recorded"
        : "Thank you";

  const body =
    visit.status === "declined"
      ? "Your decline was recorded. Thank you for visiting."
      : visit.status === "branched"
        ? "Conflicting answers were detected, so this visit was closed. Nothing further was recorded."
        : visit.status === "signed" || visit.status === "drawn"
          ? "Your cell is on the canvas."
          : `Status: ${visit.status}.`;

  return (
    <Shell>
      <h1>{heading}</h1>
      <p>{body}</p>
      {receipt}
      <p>
        Who drew which cell is sealed until 2036-10-18 at the latest.
      </p>
      <p>
        <a href="/record">About the record</a>
        {" · "}
        <a href="/">Home</a>
      </p>
    </Shell>
  );
}
