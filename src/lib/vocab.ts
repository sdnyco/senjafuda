import { readFileSync } from "fs";
import path from "path";

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

export type Vocabulary = {
  version: number;
  fields: VocabField[];
  decline_reasons: VocabOption[];
  meta_option_ids: string[];
  skip_value: string;
};

let cached: Vocabulary | null = null;

export function loadVocab(version = 1): Vocabulary {
  if (cached && cached.version === version) return cached;
  const file = path.join(process.cwd(), "content", "vocab", `v${version}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as Vocabulary;
  cached = data;
  return data;
}

export function activeFields(vocab: Vocabulary = loadVocab()): VocabField[] {
  return vocab.fields.filter((f) => f.enabled);
}

export function getField(
  fieldId: string,
  vocab: Vocabulary = loadVocab(),
): VocabField | undefined {
  return activeFields(vocab).find((f) => f.id === fieldId);
}

export function nextFieldId(
  currentFieldId: string,
  vocab: Vocabulary = loadVocab(),
): string | null {
  const fields = activeFields(vocab);
  const idx = fields.findIndex((f) => f.id === currentFieldId);
  if (idx < 0 || idx >= fields.length - 1) return null;
  return fields[idx + 1].id;
}

export function firstFieldId(vocab: Vocabulary = loadVocab()): string {
  const fields = activeFields(vocab);
  if (fields.length === 0) throw new Error("No enabled vocab fields");
  return fields[0].id;
}

export function isValidOption(
  fieldId: string,
  optionId: string,
  vocab: Vocabulary = loadVocab(),
): boolean {
  if (optionId === vocab.skip_value) return true;
  const field = getField(fieldId, vocab);
  return Boolean(field?.options.some((o) => o.id === optionId));
}

export function markSvgPath(markId: string): string {
  return path.join(process.cwd(), "content", "marks", `${markId}.svg`);
}
