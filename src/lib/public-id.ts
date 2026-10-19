import { createHash } from "crypto";

/**
 * Public join key for exports and any public per-token row.
 * Raw token ids never leave the database.
 * Salt must stay fixed (`EXPORT_ID_SALT`); rotating it breaks continuity.
 */
export function publicId(tokenId: string, salt: string): string {
  if (!salt) {
    throw new Error("EXPORT_ID_SALT is required to derive public_id");
  }
  return createHash("sha256")
    .update(tokenId + salt, "utf8")
    .digest("hex")
    .slice(0, 16);
}
