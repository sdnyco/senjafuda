import { createHmac, timingSafeEqual } from "crypto";

export type SignAction =
  | "draw"
  | "census"
  | "skip"
  | "finish"
  | "decline"
  | "fresh"
  | "form";

export type SignPayload = {
  visitId: string;
  action: SignAction;
  /** Pattern id, `field:value`, field, reason id, or empty. */
  target: string;
  x: string;
  y: string;
  exp: number;
};

const LINK_TTL_SEC = 5 * 60;
const FORM_TTL_SEC = 15 * 60;

function signingSecret(): string {
  const secret = process.env.LINK_SIGNING_SECRET;
  if (!secret) {
    throw new Error("LINK_SIGNING_SECRET is not set");
  }
  return secret;
}

/** R6: `era1|{visitId}|{action}|{target}|{x}|{y}|{exp}` */
export function canonicalString(p: SignPayload): string {
  return `era1|${p.visitId}|${p.action}|${p.target}|${p.x}|${p.y}|${p.exp}`;
}

export function signPayload(
  p: Omit<SignPayload, "exp"> & { exp?: number },
  ttlSec?: number,
): { exp: number; n: string } {
  const exp =
    p.exp ??
    Math.floor(Date.now() / 1000) + (ttlSec ?? LINK_TTL_SEC);
  const full: SignPayload = {
    visitId: p.visitId,
    action: p.action,
    target: p.target,
    x: p.x,
    y: p.y,
    exp,
  };
  const sig = createHmac("sha256", signingSecret())
    .update(canonicalString(full), "utf8")
    .digest("base64url");
  return { exp, n: `${exp}.${sig}` };
}

export function linkTtlSec(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  return LINK_TTL_SEC;
}

export function formTtlSec(override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  return FORM_TTL_SEC;
}

export type VerifyResult =
  | { ok: true; payload: SignPayload }
  | { ok: false; reason: "malformed" | "expired" | "bad_sig" };

export function verifySignature(
  n: string | null | undefined,
  expected: Omit<SignPayload, "exp">,
): VerifyResult {
  if (!n || !n.includes(".")) return { ok: false, reason: "malformed" };
  const dot = n.indexOf(".");
  const expStr = n.slice(0, dot);
  const sig = n.slice(dot + 1);
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || !sig) return { ok: false, reason: "malformed" };

  const payload: SignPayload = {
    visitId: expected.visitId,
    action: expected.action,
    target: expected.target,
    x: expected.x,
    y: expected.y,
    exp,
  };

  const expectedSig = createHmac("sha256", signingSecret())
    .update(canonicalString(payload), "utf8")
    .digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_sig" };
  }
  if (exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

export function signDrawLink(opts: {
  visitId: string;
  patternId: string;
  x: number;
  y: number;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "draw",
      target: opts.patternId,
      x: String(opts.x),
      y: String(opts.y),
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signCensusLink(opts: {
  visitId: string;
  field: string;
  value: string;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "census",
      target: `${opts.field}:${opts.value}`,
      x: "",
      y: "",
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signSkipLink(opts: {
  visitId: string;
  field: string;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "skip",
      target: opts.field,
      x: "",
      y: "",
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signFinishLink(opts: {
  visitId: string;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "finish",
      target: "",
      x: "",
      y: "",
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signDeclineLink(opts: {
  visitId: string;
  reasonId: string;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "decline",
      target: opts.reasonId,
      x: "",
      y: "",
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signFreshLink(opts: {
  visitId: string;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "fresh",
      target: "",
      x: "",
      y: "",
    },
    linkTtlSec(opts.ttlSec),
  );
  return n;
}

export function signForm(opts: {
  visitId: string;
  x: number;
  y: number;
  ttlSec?: number;
}): string {
  const { n } = signPayload(
    {
      visitId: opts.visitId,
      action: "form",
      target: "",
      x: String(opts.x),
      y: String(opts.y),
    },
    formTtlSec(opts.ttlSec),
  );
  return n;
}
