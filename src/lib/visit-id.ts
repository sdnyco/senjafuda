import { generateTokenId } from "./token-id";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** 128-bit base32 → 26 characters with the generator in token-id.ts. */
const VISIT_ID_LENGTH = 26;

export function generateVisitId(): string {
  return generateTokenId();
}

/** Validate format before any DB/Redis access (§12). */
export function isValidVisitIdFormat(id: string): boolean {
  if (id.length !== VISIT_ID_LENGTH) return false;
  for (const ch of id) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
