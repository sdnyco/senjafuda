import { Shell } from "@/components/Shell";
import { MissingToken } from "@/components/StatusPages";
import { getToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function ThanksPage({ params }: Props) {
  const { token: tokenId } = await params;
  const token = await getToken(tokenId);
  if (!token) return <MissingToken />;

  const message =
    token.status === "signed"
      ? "Your entry was recorded. Thank you."
      : token.status === "declined"
        ? "Your decline was recorded. Thank you."
        : token.status === "branched"
          ? "This visit was marked as branched (multiple conflicting answers). It is kept in the raw data and excluded from clean aggregates."
          : token.status === "expired"
            ? "This visit token expired."
            : `Current status: ${token.status}.`;

  return (
    <Shell>
      <h1>Recorded</h1>
      <p>{message}</p>
      <p>
        <a href="/record">See the record</a>
        {" · "}
        <a href="/">Home</a>
      </p>
    </Shell>
  );
}
