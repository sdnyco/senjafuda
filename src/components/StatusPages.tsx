import type { ReactNode } from "react";
import { Shell } from "./Shell";

/**
 * R15: never imply success with "already recorded".
 * Spec 004 R3: no minting link to `/` — keep `/record` only.
 */
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
        <a href="/record">About the record</a>
      </p>
    </Shell>
  );
}

/**
 * Spec 004: unusable / stale visit surface.
 * Exactly one signed `/fresh` link; no Home/`/` (minting). Shell footer
 * keeps non-minting `/record`, `/llms.txt`, `/data`.
 */
export function StaleVisitPage({
  visitId,
  freshN,
}: {
  visitId: string;
  freshN: string;
}) {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>
        This link belongs to an earlier visit, so nothing was recorded.
      </p>
      <p>
        <a
          href={`/s/${visitId}/fresh?n=${encodeURIComponent(freshN)}`}
          rel="nofollow"
        >
          → Start a fresh cell
        </a>
      </p>
    </Shell>
  );
}

/** Spec 004: expired/invalid `fresh` — HTML dead end, no signed links, no `/`. */
export function FreshLinkExpiredPage() {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>This link has expired, so nothing was recorded.</p>
      <p>
        <a href="/record">About the record</a>
      </p>
    </Shell>
  );
}

/** @deprecated Use StaleVisitPage (spec 004). */
export function VisitClosed({
  freshHref,
}: {
  freshHref?: string | null;
}) {
  return (
    <Shell>
      <h1>Nothing was recorded</h1>
      <p>
        This link belongs to an earlier visit, so nothing was recorded.
      </p>
      <p>
        {freshHref ? (
          <a href={freshHref} rel="nofollow">
            → Start a fresh cell
          </a>
        ) : (
          <a href="/record">About the record</a>
        )}
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
