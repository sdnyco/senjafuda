import { Shell } from "@/components/Shell";
import { markInnerSvg } from "@/lib/marks";
import { loadRecordData } from "@/lib/record";
import { activeFields, loadVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";
// CDN/browser hint; page itself is dynamic so builds without DB do not bake empty HTML.
export const revalidate = 300;

const STATUS_ORDER = [
  "issued",
  "partial",
  "signed",
  "declined",
  "branched",
  "expired",
] as const;

export default async function RecordPage() {
  let data: Awaited<ReturnType<typeof loadRecordData>> | null = null;
  try {
    data = await loadRecordData();
  } catch {
    return (
      <Shell>
        <h1>Public record</h1>
        <p className="note">The database is not configured yet.</p>
      </Shell>
    );
  }

  const vocab = loadVocab();
  const markIds = activeFields(vocab).find((f) => f.id === "mark")?.options.map((o) => o.id) ?? [];
  const cell = 12;
  const cols = 64;
  const rows = Math.max(1, Math.ceil(data.mosaic.length / cols));

  const symbols = markIds
    .map(
      (id) =>
        `<symbol id="m-${id}" viewBox="0 0 48 48">${markInnerSvg(id)}</symbol>`,
    )
    .join("");

  const uses = data.mosaic
    .map((entry, i) => {
      const x = (i % cols) * cell;
      const y = Math.floor(i / cols) * cell;
      return `<use href="#m-${entry.value}" x="${x}" y="${y}" width="${cell}" height="${cell}" />`;
    })
    .join("");

  const mosaicSvg = `<svg class="mosaic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${rows * cell}" role="img" aria-label="Mosaic of signed marks"><defs>${symbols}</defs>${uses}</svg>`;

  return (
    <Shell>
      <h1>Public record</h1>
      <p className="note">
        Last updated {data.updatedAt.toISOString()} (page revalidates about every
        five minutes). Field distributions and the mosaic exclude branched
        tokens. Rate-limited tokens remain included where they signed.
      </p>

      <h2>Totals</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>All tokens ever issued</td>
              <td>{data.issued}</td>
            </tr>
            {STATUS_ORDER.map((status) => (
              <tr key={status}>
                <td>
                  <code>{status}</code>
                  {status === "issued"
                    ? " — looked, did nothing; includes crawlers"
                    : ""}
                </td>
                <td>{data.byStatus[status] ?? 0}</td>
              </tr>
            ))}
            <tr>
              <td>
                <code>rate_limited</code> flag (any status)
              </td>
              <td>{data.rateLimitedCount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>By user-agent class</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {data.uaRows.map((row) => (
              <tr key={`${row.uaClass}-${row.status}`}>
                <td>
                  <code>{row.uaClass}</code>
                </td>
                <td>
                  <code>{row.status}</code>
                </td>
                <td>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Field distributions</h2>
      {data.distributions.map((dist) => (
        <section key={dist.field}>
          <h3>
            <code>{dist.field}</code> — all time
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Value</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {dist.allTime.map((row) => (
                  <tr key={row.value}>
                    <td>
                      <code>{row.value}</code>
                    </td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>
            <code>{dist.field}</code> — by month
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Value</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {dist.byMonth.map((row) => (
                  <tr key={`${row.month}-${row.value}`}>
                    <td>{row.month}</td>
                    <td>
                      <code>{row.value}</code>
                    </td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>Mosaic</h2>
      <p className="note">
        Every signed entry that chose a mark, in arrival order. Grid width 64.
        Entries that skipped mark are omitted. {data.mosaic.length} cell
        {data.mosaic.length === 1 ? "" : "s"}.
      </p>
      <div dangerouslySetInnerHTML={{ __html: mosaicSvg }} />
    </Shell>
  );
}
