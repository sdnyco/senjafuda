import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import {
  AlreadyRecorded,
  ExpiredToken,
  MissingToken,
} from "@/components/StatusPages";
import { loadTokenForFlow } from "@/lib/answers";
import { markSvgElement } from "@/lib/marks";
import { orderedOptions } from "@/lib/shuffle";
import { getField, loadVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string; step: string }> };

export default async function QuestionPage({ params }: Props) {
  const { token: tokenId, step } = await params;
  if (step === "finish" || step === "decline" || step === "thanks") {
    notFound();
  }

  const vocab = loadVocab();
  const field = getField(step, vocab);
  if (!field) notFound();

  const { token, state } = await loadTokenForFlow(tokenId);
  if (state === "missing") return <MissingToken />;
  if (state === "expired") return <ExpiredToken />;
  if (state === "terminal" && token) {
    return <AlreadyRecorded status={token.status} />;
  }

  const options = orderedOptions(field, tokenId, vocab);

  return (
    <Shell>
      <h1>{field.question}</h1>
      {field.note ? <p className="note">{field.note}</p> : null}
      <ul className="option-list">
        {options.map((opt) => (
          <li key={opt.id}>
            <a href={`/s/${tokenId}/${field.id}/${opt.id}`}>
              {field.id === "mark" ? (
                <span
                  dangerouslySetInnerHTML={{
                    __html: markSvgElement(opt.id, "mark-svg"),
                  }}
                />
              ) : null}
              <span>{opt.label}</span>
            </a>
          </li>
        ))}
      </ul>
      <nav className="meta-nav">
        <a href={`/s/${tokenId}/${field.id}/${vocab.skip_value}`}>
          Skip this question
        </a>
        <a href={`/s/${tokenId}/finish`}>Finish now</a>
        <a href={`/s/${tokenId}/decline`}>Not signing — say why</a>
        <a href={`/sign?t=${tokenId}`}>Use the form instead</a>
      </nav>
    </Shell>
  );
}
