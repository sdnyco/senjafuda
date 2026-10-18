import { createHash } from "crypto";
import type { VocabField, VocabOption, Vocabulary } from "./vocab";
import { loadVocab } from "./vocab";

/** Deterministic 32-bit seed from token id. */
export function seedFromTokenId(tokenId: string): number {
  const hash = createHash("sha256").update(tokenId).digest();
  return hash.readUInt32BE(0);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function isMeta(option: VocabOption, vocab: Vocabulary): boolean {
  return Boolean(option.meta) || vocab.meta_option_ids.includes(option.id);
}

/** Substantive options shuffled; meta options fixed at the end. */
export function orderedOptions(
  field: VocabField,
  tokenId: string,
  vocab: Vocabulary = loadVocab(),
): VocabOption[] {
  const rand = mulberry32(seedFromTokenId(`${tokenId}:${field.id}`));
  const substantive = field.options.filter((o) => !isMeta(o, vocab));
  const meta = field.options.filter((o) => isMeta(o, vocab));
  shuffleInPlace(substantive, rand);
  return [...substantive, ...meta];
}

export function optionPosition(
  field: VocabField,
  tokenId: string,
  optionId: string,
  vocab: Vocabulary = loadVocab(),
): number | null {
  if (optionId === vocab.skip_value) return null;
  const ordered = orderedOptions(field, tokenId, vocab);
  const idx = ordered.findIndex((o) => o.id === optionId);
  return idx < 0 ? null : idx;
}
