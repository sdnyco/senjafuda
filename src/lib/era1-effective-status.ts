/**
 * Read-time view for era-1 visits. Stored status is never rewritten by export.
 * Precedence: branched → swept → derived expired → stored status.
 * Expired when status is issued/drawn and past expires_at (R8).
 */
export function era1EffectiveStatus(
  status: string,
  expiresAt: Date,
  asOf: Date = new Date(),
  swept = false,
): string {
  if (status === "branched") return "branched";
  if (swept) return "swept";
  if (
    (status === "issued" || status === "drawn") &&
    expiresAt.getTime() <= asOf.getTime()
  ) {
    return "expired";
  }
  return status;
}

export function isEra1TerminalStored(status: string): boolean {
  return (
    status === "signed" || status === "declined" || status === "branched"
  );
}
