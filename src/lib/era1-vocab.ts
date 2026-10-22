import { readFileSync } from "fs";
import path from "path";

export type Pattern = {
  id: string;
  glyph: string;
  description: string;
};

export type VocabOption = {
  id: string;
  label: string;
  meta?: boolean;
};

export type VocabField = {
  id: string;
  question: string;
  note?: string;
  optional: boolean;
  enabled: boolean;
  options: VocabOption[];
};

export type Era1Vocabulary = {
  version: string;
  patterns: Pattern[];
  fields: VocabField[];
  decline_reasons: VocabOption[];
  meta_option_ids: string[];
  skip_value: string;
};

let cached: Era1Vocabulary | null = null;

export function loadEra1Vocab(): Era1Vocabulary {
  if (cached) return cached;
  const file = path.join(process.cwd(), "content", "vocab", "era1.json");
  cached = JSON.parse(readFileSync(file, "utf8")) as Era1Vocabulary;
  return cached;
}

export function era1Patterns(vocab = loadEra1Vocab()): Pattern[] {
  return vocab.patterns;
}

export function patternById(
  id: string,
  vocab = loadEra1Vocab(),
): Pattern | undefined {
  return vocab.patterns.find((p) => p.id === id);
}

export function patternGlyph(
  id: string,
  vocab = loadEra1Vocab(),
): string {
  return patternById(id, vocab)?.glyph ?? "·";
}

export function activeCensusFields(vocab = loadEra1Vocab()): VocabField[] {
  return vocab.fields.filter((f) => f.enabled);
}

export function getCensusField(
  fieldId: string,
  vocab = loadEra1Vocab(),
): VocabField | undefined {
  return activeCensusFields(vocab).find((f) => f.id === fieldId);
}

export function firstCensusFieldId(vocab = loadEra1Vocab()): string {
  const fields = activeCensusFields(vocab);
  if (fields.length === 0) throw new Error("No enabled census fields");
  return fields[0].id;
}

export function nextCensusFieldId(
  currentFieldId: string,
  vocab = loadEra1Vocab(),
): string | null {
  const fields = activeCensusFields(vocab);
  const idx = fields.findIndex((f) => f.id === currentFieldId);
  if (idx < 0 || idx >= fields.length - 1) return null;
  return fields[idx + 1].id;
}

export function isValidPatternId(
  id: string,
  vocab = loadEra1Vocab(),
): boolean {
  return vocab.patterns.some((p) => p.id === id);
}

export function isValidCensusOption(
  fieldId: string,
  optionId: string,
  vocab = loadEra1Vocab(),
): boolean {
  if (optionId === vocab.skip_value) return true;
  const field = getCensusField(fieldId, vocab);
  return Boolean(field?.options.some((o) => o.id === optionId));
}

export function isValidDeclineReason(
  id: string,
  vocab = loadEra1Vocab(),
): boolean {
  return vocab.decline_reasons.some((r) => r.id === id);
}

export const CENSUS_FIELD_IDS = [
  "arrival",
  "decider",
  "family",
  "return",
] as const;

export type CensusFieldId = (typeof CENSUS_FIELD_IDS)[number];

export function isCensusFieldId(id: string): id is CensusFieldId {
  return (CENSUS_FIELD_IDS as readonly string[]).includes(id);
}
