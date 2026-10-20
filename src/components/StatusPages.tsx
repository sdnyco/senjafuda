import type { ReactNode } from "react";
import { Shell } from "./Shell";

/** R15: never imply success with "already recorded". */
export function NothingRecorded({
  title = "Nothing was recorded",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <Shell>
      <h1>{title}</h1>
      {children ?? (
        <p>Nothing was recorded from this link.</p>
      )}
      <p>
        <a href="/">Start a fresh visit</a>
        {" · "}
        <a href="/record">About the record</a>
      </p>
    </Shell>
  );
}

export function VisitClosed({
  freshHref,
}: {
  freshHref?: string | null;
}) {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>
        This visit is complete; there is nothing to do here, and nothing was
        recorded from this link.
      </p>
      <p>
        {freshHref ? (
          <>
            <a href={freshHref} rel="nofollow">
              → Start a fresh cell
            </a>
            {" · "}
          </>
        ) : null}
        <a href="/">Home</a>
        {" · "}
        <a href="/record">About the record</a>
      </p>
    </Shell>
  );
}

export function RateLimitedPage({ message }: { message?: string }) {
  return (
    <Shell>
      <h1>Temporarily closed</h1>
      <p>
        {message ??
          "This source is making requests too quickly, so nothing was recorded."}
      </p>
      <p>
        <a href="/">Home</a>
      </p>
    </Shell>
  );
}

export function SourceCapPage() {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>
        This source has added several cells today, so nothing was recorded.
        Thank you for visiting.
      </p>
      <p>
        <a href="/">Home</a>
        {" · "}
        <a href="/record">About the record</a>
      </p>
    </Shell>
  );
}

export function DeclineCapPage() {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>
        This source has sent several decline responses today, so nothing was
        recorded.
      </p>
      <p>
        <a href="/">Home</a>
      </p>
    </Shell>
  );
}

/** @deprecated Use NothingRecorded / VisitClosed */
export function AlreadyRecorded({ status }: { status: string }) {
  return (
    <NothingRecorded>
      <p>
        This visit is closed ({status}). Nothing was recorded from this link.
      </p>
    </NothingRecorded>
  );
}

export function ExpiredToken() {
  return (
    <NothingRecorded title="Nothing was recorded">
      <p>This visit has expired. Nothing was recorded from this link.</p>
    </NothingRecorded>
  );
}

export function MissingToken() {
  return (
    <NothingRecorded title="Nothing was recorded">
      <p>This visit was not found. Nothing was recorded from this link.</p>
    </NothingRecorded>
  );
}
