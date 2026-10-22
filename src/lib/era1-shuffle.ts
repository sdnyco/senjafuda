import { createHash } from "crypto";
import type { Pattern, VocabField, VocabOption, Era1Vocabulary } from "./era1-vocab";
import { loadEra1Vocab } from "./era1-vocab";

export function seedFromVisitId(visitId: string): number {
  const hash = createHash("sha256").update(visitId).digest();
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

function isMeta(option: VocabOption, vocab: Era1Vocabulary): boolean {
  return Boolean(option.meta) || vocab.meta_option_ids.includes(option.id);
}

/** All 16 patterns shuffled; p0 is NOT meta (spec §1). */
export function orderedPatterns(
  visitId: string,
  vocab: Era1Vocabulary = loadEra1Vocab(),
): Pattern[] {
  const rand = mulberry32(seedFromVisitId(`${visitId}:patterns`));
  const patterns = [...vocab.patterns];
  shuffleInPlace(patterns, rand);
  return patterns;
}

export function patternOptionOrder(
  visitId: string,
  vocab: Era1Vocabulary = loadEra1Vocab(),
): string {
  return orderedPatterns(visitId, vocab)
    .map((p) => p.id)
    .join(",");
}

export function orderedCensusOptions(
  field: VocabField,
  visitId: string,
  vocab: Era1Vocabulary = loadEra1Vocab(),
): VocabOption[] {
  const rand = mulberry32(seedFromVisitId(`${visitId}:${field.id}`));
  const substantive = field.options.filter((o) => !isMeta(o, vocab));
  const meta = field.options.filter((o) => isMeta(o, vocab));
  shuffleInPlace(substantive, rand);
  return [...substantive, ...meta];
}

export function censusOptionOrder(
  field: VocabField,
  visitId: string,
  vocab: Era1Vocabulary = loadEra1Vocab(),
): string {
  return orderedCensusOptions(field, visitId, vocab)
    .map((o) => o.id)
    .join(",");
}

export function censusOptionPosition(
  field: VocabField,
  visitId: string,
  optionId: string,
  vocab: Era1Vocabulary = loadEra1Vocab(),
): number | null {
  if (optionId === vocab.skip_value) return null;
  const ordered = orderedCensusOptions(field, visitId, vocab);
  const idx = ordered.findIndex((o) => o.id === optionId);
  return idx < 0 ? null : idx;
}
