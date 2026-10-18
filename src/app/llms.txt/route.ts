import { readFileSync } from "fs";
import path from "path";
import { loadVocab, activeFields } from "@/lib/vocab";

export const dynamic = "force-dynamic";

export async function GET() {
  const header = readFileSync(
    path.join(process.cwd(), "content", "llms-header.md"),
    "utf8",
  );
  const vocab = loadVocab();
  const lines: string[] = [header.trim(), "", "## Vocabulary v" + vocab.version, ""];

  for (const field of activeFields(vocab)) {
    lines.push(`### ${field.id}`);
    lines.push(field.question);
    if (field.note) lines.push(field.note);
    for (const opt of field.options) {
      lines.push(`- \`${opt.id}\`: ${opt.label}`);
    }
    lines.push("");
  }

  lines.push("### decline_reason");
  lines.push("Optional reasons when declining to sign:");
  for (const r of vocab.decline_reasons) {
    lines.push(`- \`${r.id}\`: ${r.label}`);
  }
  lines.push("");
  lines.push(`Skip sentinel value: \`${vocab.skip_value}\``);
  lines.push("");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
