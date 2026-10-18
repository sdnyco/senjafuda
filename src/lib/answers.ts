import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, tokens, type Token } from "@/db/schema";
import { noteOptionHit } from "./rate-limit";
import { optionPosition } from "./shuffle";
import { ensureNotExpired, getToken, isTerminal } from "./tokens";
import { getField, loadVocab, nextFieldId } from "./vocab";

export type WritePath = "link" | "form";

export type WriteResult =
  | { ok: true; token: Token; nextFieldId: string | null; signed: boolean }
  | { ok: false; reason: "not_found" | "terminal" | "expired" | "invalid" | "rate_limited" };

export async function writeAnswer(opts: {
  tokenId: string;
  field: string;
  value: string;
  path: WritePath;
  /** Count toward fast-sweep (option links only). */
  countSweep?: boolean;
}): Promise<WriteResult> {
  const vocab = loadVocab();
  const fieldDef = getField(opts.field, vocab);
  if (!fieldDef) return { ok: false, reason: "invalid" };
  if (opts.value !== vocab.skip_value && !fieldDef.options.some((o) => o.id === opts.value)) {
    return { ok: false, reason: "invalid" };
  }

  const db = getDb();

  const result = await db.transaction(async (tx): Promise<WriteResult> => {
    const locked = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.id, opts.tokenId))
      .for("update")
      .limit(1);

    let token = locked[0];
    if (!token) return { ok: false, reason: "not_found" };

    if (token.status === "issued" || token.status === "partial") {
      if (token.expiresAt.getTime() <= Date.now()) {
        const completedAt = new Date();
        await tx
          .update(tokens)
          .set({ status: "expired", completedAt })
          .where(eq(tokens.id, token.id));
        return { ok: false, reason: "expired" };
      }
    }

    if (isTerminal(token.status)) {
      return { ok: false, reason: "terminal" };
    }

    const existing = await tx
      .select()
      .from(answers)
      .where(and(eq(answers.tokenId, token.id), eq(answers.field, opts.field)));

    const same = existing.find((a) => a.value === opts.value);
    if (same) {
      const next = nextFieldId(opts.field, vocab);
      return { ok: true, token, nextFieldId: next, signed: false };
    }

    if (existing.length > 0) {
      const completedAt = new Date();
      await tx.insert(answers).values({
        tokenId: token.id,
        field: opts.field,
        value: opts.value,
        answeredAt: new Date(),
        path: opts.path,
        position: optionPosition(fieldDef, token.id, opts.value, vocab),
      });
      await tx
        .update(tokens)
        .set({ status: "branched", completedAt })
        .where(eq(tokens.id, token.id));
      return {
        ok: true,
        token: { ...token, status: "branched", completedAt },
        nextFieldId: null,
        signed: false,
      };
    }

    const position = optionPosition(fieldDef, token.id, opts.value, vocab);
    await tx.insert(answers).values({
      tokenId: token.id,
      field: opts.field,
      value: opts.value,
      answeredAt: new Date(),
      path: opts.path,
      position,
    });

    if (token.status === "issued") {
      await tx
        .update(tokens)
        .set({ status: "partial" })
        .where(eq(tokens.id, token.id));
      token = { ...token, status: "partial" };
    }

    const next = nextFieldId(opts.field, vocab);
    return { ok: true, token, nextFieldId: next, signed: false };
  });

  if (result.ok && opts.countSweep && opts.value !== vocab.skip_value) {
    const swept = await noteOptionHit(opts.tokenId);
    if (swept) {
      const branched = await markBranched(opts.tokenId);
      if (branched) {
        return {
          ok: true,
          token: branched,
          nextFieldId: null,
          signed: false,
        };
      }
    }
  }
  return result;
}

async function markBranched(tokenId: string): Promise<Token | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.id, tokenId))
      .for("update")
      .limit(1);
    const token = locked[0];
    if (!token || isTerminal(token.status)) return token ?? null;
    const completedAt = new Date();
    await tx
      .update(tokens)
      .set({ status: "branched", completedAt })
      .where(eq(tokens.id, tokenId));
    return { ...token, status: "branched", completedAt };
  });
}

export async function commitSigned(tokenId: string): Promise<WriteResult> {
  const db = getDb();
  return db.transaction(async (tx): Promise<WriteResult> => {
    const locked = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.id, tokenId))
      .for("update")
      .limit(1);
    const token = locked[0];
    if (!token) return { ok: false, reason: "not_found" };

    if (token.status === "issued" || token.status === "partial") {
      if (token.expiresAt.getTime() <= Date.now()) {
        const completedAt = new Date();
        await tx
          .update(tokens)
          .set({ status: "expired", completedAt })
          .where(eq(tokens.id, token.id));
        return { ok: false, reason: "expired" };
      }
    }

    if (isTerminal(token.status)) {
      return { ok: false, reason: "terminal" };
    }

    const completedAt = new Date();
    await tx
      .update(tokens)
      .set({ status: "signed", completedAt })
      .where(eq(tokens.id, token.id));
    return {
      ok: true,
      token: { ...token, status: "signed", completedAt },
      nextFieldId: null,
      signed: true,
    };
  });
}

export async function commitDeclined(
  tokenId: string,
  reasonId: string,
): Promise<WriteResult> {
  const vocab = loadVocab();
  if (!vocab.decline_reasons.some((r) => r.id === reasonId)) {
    return { ok: false, reason: "invalid" };
  }

  const db = getDb();
  return db.transaction(async (tx): Promise<WriteResult> => {
    const locked = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.id, tokenId))
      .for("update")
      .limit(1);
    const token = locked[0];
    if (!token) return { ok: false, reason: "not_found" };

    if (token.status === "issued" || token.status === "partial") {
      if (token.expiresAt.getTime() <= Date.now()) {
        const completedAt = new Date();
        await tx
          .update(tokens)
          .set({ status: "expired", completedAt })
          .where(eq(tokens.id, token.id));
        return { ok: false, reason: "expired" };
      }
    }

    if (isTerminal(token.status)) {
      return { ok: false, reason: "terminal" };
    }

    const existing = await tx
      .select()
      .from(answers)
      .where(
        and(eq(answers.tokenId, token.id), eq(answers.field, "decline_reason")),
      );

    if (existing.length === 0) {
      await tx.insert(answers).values({
        tokenId: token.id,
        field: "decline_reason",
        value: reasonId,
        answeredAt: new Date(),
        path: "link",
        position: vocab.decline_reasons.findIndex((r) => r.id === reasonId),
      });
    } else if (existing[0].value !== reasonId) {
      await tx.insert(answers).values({
        tokenId: token.id,
        field: "decline_reason",
        value: reasonId,
        answeredAt: new Date(),
        path: "link",
        position: vocab.decline_reasons.findIndex((r) => r.id === reasonId),
      });
      const completedAt = new Date();
      await tx
        .update(tokens)
        .set({ status: "branched", completedAt })
        .where(eq(tokens.id, token.id));
      return {
        ok: true,
        token: { ...token, status: "branched", completedAt },
        nextFieldId: null,
        signed: false,
      };
    }

    const completedAt = new Date();
    await tx
      .update(tokens)
      .set({ status: "declined", completedAt })
      .where(eq(tokens.id, token.id));
    return {
      ok: true,
      token: { ...token, status: "declined", completedAt },
      nextFieldId: null,
      signed: false,
    };
  });
}

export async function loadTokenForFlow(tokenId: string): Promise<{
  token: Token | null;
  state: "ok" | "missing" | "terminal" | "expired";
}> {
  let token = await getToken(tokenId);
  if (!token) return { token: null, state: "missing" };
  token = await ensureNotExpired(token);
  if (token.status === "expired") return { token, state: "expired" };
  if (isTerminal(token.status)) return { token, state: "terminal" };
  return { token, state: "ok" };
}
