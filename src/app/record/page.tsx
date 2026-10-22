import { Shell } from "@/components/Shell";
import { CanvasPre } from "@/components/CanvasPre";
import { getDb } from "@/db";
import { canvasState, drawings, visits } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getFrameSize, loadValidCells } from "@/lib/canvas";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export default async function RecordPage() {
  let frameSize = 5;
  let cells: Awaited<ReturnType<typeof loadValidCells>> = [];
  let visitCount = 0;
  let entryCount = 0;
  let declineCount = 0;

  try {
    const db = getDb();
    frameSize = await getFrameSize(db);
    cells = await loadValidCells(db);

    const [vRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(visits);
    visitCount = vRow?.n ?? 0;

    const [eRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(drawings)
      .where(
        sql`${drawings.kind} = 'visitor' AND ${drawings.status} = 'valid'`,
      );
    entryCount = eRow?.n ?? 0;

    const [dRow] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(visits)
      .where(eq(visits.status, "declined"));
    declineCount = dRow?.n ?? 0;

    // frame size already from canvas_state
    void canvasState;
  } catch {
    // local without DB
  }

  const filledCells = cells.length;

  return (
    <Shell>
      <div className="shell-wide" style={{ width: "100%" }}>
        <h1>About the record</h1>
        <p>
          The canvas is public from the start. Who drew which cell, and every
          census answer, stay sealed until 18 October 2036 at the latest.
        </p>
        <CanvasPre frameSize={frameSize} cells={cells} />
        <p className="note">
          Frame {frameSize}×{frameSize}. Filled cells (including the centre
          seed): {filledCells}.
        </p>
        <h2>Totals</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Visits</td>
                <td>{visitCount}</td>
              </tr>
              <tr>
                <td>Entries (valid drawings)</td>
                <td>{entryCount}</td>
              </tr>
              <tr>
                <td>Declines</td>
                <td>{declineCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">
          Totals only — no per-class or time-resolved breakdowns (those would
          break the seal at low traffic).
        </p>
        <p>
          <a href="https://github.com/sdnyco/senjafuda/tree/main/data">
            Public data
          </a>
          {" · "}
          <a href="https://github.com/sdnyco/senjafuda/tree/main/data/pilot-2026-10">
            Pilot archive
          </a>
          {" · "}
          <a href="/">Home</a>
        </p>
      </div>
    </Shell>
  );
}
