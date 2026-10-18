import { createHash } from "crypto";
import { headers } from "next/headers";

/** Client IP for rate limiting only. Never persisted. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return h.get("x-real-ip") || "unknown";
}

export function rateLimitKey(ip: string, utcDate = utcDateString()): string {
  const pepper = process.env.IP_HASH_PEPPER;
  if (!pepper) {
    throw new Error("IP_HASH_PEPPER is not set");
  }
  return createHash("sha256").update(`${ip}${pepper}${utcDate}`).digest("hex");
}

export function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
