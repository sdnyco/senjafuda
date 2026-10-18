import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tokens, type Token, type TokenStatus } from "@/db/schema";
import { generateTokenId } from "./token-id";
import { classifyUserAgent } from "./ua-rules";
import { loadVocab } from "./vocab";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function issueToken(uaHeader: string | null): Promise<Token> {
  const db = getDb();
  const classified = classifyUserAgent(uaHeader);
  const vocab = loadVocab();
  const now = new Date();
  const row = {
    id: generateTokenId(),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
    vocabVersion: vocab.version,
    uaRulesVersion: classified.uaRulesVersion,
    uaClass: classified.uaClass,
    uaFamily: classified.uaFamily,
    status: "issued" as TokenStatus,
    completedAt: null,
    rateLimited: false,
    swept: false,
  };
  await db.insert(tokens).values(row);
  return row;
}

export async function getToken(id: string): Promise<Token | null> {
  const db = getDb();
  const rows = await db.select().from(tokens).where(eq(tokens.id, id)).limit(1);
  return rows[0] ?? null;
}

export function isTerminal(status: string): boolean {
  return (
    status === "signed" ||
    status === "declined" ||
    status === "branched" ||
    status === "expired"
  );
}

/** Lazy expiry: if past expires_at and still issued/partial, mark expired. */
export async function ensureNotExpired(token: Token): Promise<Token> {
  if (token.status !== "issued" && token.status !== "partial") return token;
  if (token.expiresAt.getTime() > Date.now()) return token;
  const db = getDb();
  const completedAt = new Date();
  await db
    .update(tokens)
    .set({ status: "expired", completedAt })
    .where(eq(tokens.id, token.id));
  return { ...token, status: "expired", completedAt };
}

export async function markRateLimited(tokenId: string): Promise<void> {
  const db = getDb();
  await db
    .update(tokens)
    .set({ rateLimited: true })
    .where(eq(tokens.id, tokenId));
}
