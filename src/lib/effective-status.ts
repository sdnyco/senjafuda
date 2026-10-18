import { sql, type SQL } from "drizzle-orm";
import { tokens } from "../db/schema";

/**
 * Read-time expiry view. Stored `status` is never rewritten by the export;
 * expired is derived when status is still issued/partial past expires_at.
 */
export function effectiveStatus(
  status: string,
  expiresAt: Date,
  asOf: Date = new Date(),
): string {
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
    WHEN ${tokens.status} IN ('issued', 'partial') AND ${tokens.expiresAt} <= ${asOf}
    THEN 'expired'
    ELSE ${tokens.status}
  END`;
}
