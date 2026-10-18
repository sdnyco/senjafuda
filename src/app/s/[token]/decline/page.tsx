import { Shell } from "@/components/Shell";
import {
  AlreadyRecorded,
  ExpiredToken,
  MissingToken,
} from "@/components/StatusPages";
import { loadTokenForFlow } from "@/lib/answers";
import { loadVocab } from "@/lib/vocab";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function DeclinePage({ params }: Props) {
  const { token: tokenId } = await params;
  const { token, state } = await loadTokenForFlow(tokenId);
  if (state === "missing") return <MissingToken />;
  if (state === "expired") return <ExpiredToken />;
  if (state === "terminal" && token) {
    return <AlreadyRecorded status={token.status} />;
  }

  const vocab = loadVocab();

  return (
    <Shell>
      <h1>Not signing — optional reason</h1>
      <p className="note">
        Declining is optional. Choosing a reason is also optional. Both count in
        the public record.
      </p>
      <ul className="option-list">
        {vocab.decline_reasons.map((r) => (
          <li key={r.id}>
            <a href={`/s/${tokenId}/decline/${r.id}`}>{r.label}</a>
          </li>
        ))}
      </ul>
      <nav className="meta-nav">
        <a href={`/s/${tokenId}/finish`}>Sign with no further answers instead</a>
        <a href="/">Leave without declining</a>
      </nav>
    </Shell>
  );
}
