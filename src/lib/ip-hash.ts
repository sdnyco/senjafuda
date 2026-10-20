import { createHash } from "crypto";
import { headers } from "next/headers";

/**
 * Client IP for rate limiting only. Never persisted.
 * Prefer x-real-ip (Vercel); never trust the leftmost X-Forwarded-For (§12).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return normaliseIp(real);
  // Fallback only when x-real-ip is absent (local). Do not use XFF leftmost.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    // Rightmost is typically the closest trusted hop when behind one proxy;
    // without x-real-ip we still avoid the client-controlled leftmost entry.
    const candidate = parts[parts.length - 1] || "unknown";
    return normaliseIp(candidate);
  }
  return "unknown";
}

/** IPv6 → /64 network prefix before hashing (§12). */
export function normaliseIp(ip: string): string {
  if (ip.includes(":")) {
    const cleaned = ip.replace(/^\[|\]$/g, "");
    const halves = cleaned.split("::");
    let groups: string[];
    if (halves.length === 2) {
      const left = halves[0] ? halves[0].split(":") : [];
      const right = halves[1] ? halves[1].split(":") : [];
      const fill = 8 - left.length - right.length;
      groups = [...left, ...Array(Math.max(fill, 0)).fill("0"), ...right];
    } else {
      groups = cleaned.split(":");
    }
    while (groups.length < 8) groups.push("0");
    const prefix = groups.slice(0, 4).map((g) => g || "0");
    return prefix.join(":") + "::";
  }
  return ip;
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
