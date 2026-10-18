import { Shell } from "@/components/Shell";
import {
  AlreadyRecorded,
  ExpiredToken,
  MissingToken,
} from "@/components/StatusPages";
import { loadTokenForFlow } from "@/lib/answers";
import { markSvgElement } from "@/lib/marks";
import { orderedOptions } from "@/lib/shuffle";
import { activeFields, loadVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ t?: string }> };

export default async function SignFormPage({ searchParams }: Props) {
  const { t: tokenId } = await searchParams;
  if (!tokenId) return <MissingToken />;

  const { token, state } = await loadTokenForFlow(tokenId);
  if (state === "missing") return <MissingToken />;
  if (state === "expired") return <ExpiredToken />;
  if (state === "terminal" && token) {
    return <AlreadyRecorded status={token.status} />;
  }

  const vocab = loadVocab();
  const fields = activeFields(vocab);

  return (
    <Shell>
      <h1>Leave an entry</h1>
      <p className="note">
        Options appear in a different order for each visitor. Every question can
        be left blank. No JavaScript required.
      </p>
      <form method="post" action="/sign/submit">
        <input type="hidden" name="t" value={tokenId} />
        {fields.map((field) => {
          const options = orderedOptions(field, tokenId, vocab);
          return (
            <fieldset key={field.id} className="form-field">
              <legend>{field.question}</legend>
              {field.note ? <p className="note">{field.note}</p> : null}
              <div className="form-options">
                {options.map((opt) => (
                  <label key={opt.id}>
                    <input type="radio" name={field.id} value={opt.id} />
                    {field.id === "mark" ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: markSvgElement(opt.id, "mark-svg"),
                        }}
                      />
                    ) : null}
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}
        <button className="btn" type="submit">
          Finish and record
        </button>
      </form>
      <nav className="meta-nav">
        <a href={`/s/${tokenId}/decline`}>Not signing — say why (optional)</a>
        <a href={`/s/${tokenId}/${fields[0]?.id}`}>Use the link flow instead</a>
      </nav>
    </Shell>
  );
}
