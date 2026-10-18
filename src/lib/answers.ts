import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, tokens, type Token } from "@/db/schema";
import { noteSweepHit } from "./rate-limit";
import { optionPosition } from "./shuffle";
import { ensureNotExpired, getToken, isTerminal } from "./tokens";
import { getField, loadVocab, nextFieldId } from "./vocab";

/** How long after completed_at a fast-sweep may set `swept` without changing status. */
const SWEEP_AFTER_COMPLETE_MS = 10_000;

export type SweepMark = "none" | "branched" | "swept";

export type WritePath = "link" | "form";

export type WriteResult =
  | { ok: true; token: Token; nextFieldId: string | null; signed: boolean }
  | { ok: false; reason: "not_found" | "terminal" | "expired" | "invalid" | "rate_limited" };

export async function writeAnswer(opts: {
  tokenId: string;
  field: string;
  value: string;
  path: WritePath;
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

  return result;
}

/**
 * Count a sweep GET and apply the threshold.
 * Still issued/partial → status becomes `branched`.
 * Already signed/declined, and the threshold lands within 10s of completed_at
 * → `swept = true` and status stays as stored.
 */
export async function recordSweepGet(tokenId: string): Promise<SweepMark> {
  const tripped = await noteSweepHit(tokenId);
  if (!tripped) return "none";

  const db = getDb();
  return db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(tokens)
      .where(eq(tokens.id, tokenId))
      .for("update")
      .limit(1);
    const token = locked[0];
    if (!token) return "none";

    if (!isTerminal(token.status)) {
      const completedAt = new Date();
      await tx
        .update(tokens)
        .set({ status: "branched", completedAt })
        .where(eq(tokens.id, tokenId));
      return "branched";
    }

    if (
      (token.status === "signed" || token.status === "declined") &&
      token.completedAt &&
      Date.now() - token.completedAt.getTime() <= SWEEP_AFTER_COMPLETE_MS &&
      !token.swept
    ) {
      await tx
        .update(tokens)
        .set({ swept: true })
        .where(eq(tokens.id, tokenId));
      return "swept";
    }

    return "none";
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
