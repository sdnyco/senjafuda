import { sql, type SQL } from "drizzle-orm";
import { tokens } from "../db/schema";

/**
 * Read-time view. Stored `status` is never rewritten by the export.
 * Precedence: `branched`, then `swept`, then derived `expired`, else stored status.
 */
export function effectiveStatus(
  status: string,
  expiresAt: Date,
  asOf: Date = new Date(),
  swept = false,
): string {
  if (status === "branched") return "branched";
  if (swept) return "swept";
  if (
    (status === "issued" || status === "partial") &&
    expiresAt.getTime() <= asOf.getTime()
  ) {
    return "expired";
  }
  return status;
}

/** Same derivation as SQL (Postgres `now()` unless overridden). */
export function effectiveStatusSql(asOf: SQL = sql`now()`): SQL<string> {
  return sql<string>`CASE
    WHEN ${tokens.status} = 'branched' THEN 'branched'
    WHEN ${tokens.swept} THEN 'swept'
    WHEN ${tokens.status} IN ('issued', 'partial') AND ${tokens.expiresAt} <= ${asOf}
    THEN 'expired'
    ELSE ${tokens.status}
  END`;
}
