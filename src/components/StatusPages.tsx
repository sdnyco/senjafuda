import { Shell } from "./Shell";

export function AlreadyRecorded({ status }: { status: string }) {
  return (
    <Shell>
      <h1>Already recorded</h1>
      <p>
        This visit token is closed ({status}). Nothing further was written.
      </p>
      <p>
        <a href="/record">See the record</a>
        {" · "}
        <a href="/">Start a new visit</a>
      </p>
    </Shell>
  );
}

export function ExpiredToken() {
  return (
    <Shell>
      <h1>Token expired</h1>
      <p>This visit token has expired. You can start again from the home page.</p>
      <p>
        <a href="/">Get a fresh token</a>
      </p>
    </Shell>
  );
}

export function MissingToken() {
  return (
    <Shell>
      <h1>Unknown token</h1>
      <p>This visit token was not found.</p>
      <p>
        <a href="/">Start from the home page</a>
      </p>
    </Shell>
  );
}
