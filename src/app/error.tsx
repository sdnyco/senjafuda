"use client";

export default function ErrorPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "serif" }}>
      <h1>Something went wrong</h1>
      <p>Nothing was recorded. Please try again from the home page.</p>
      <p>
        <a href="/">Home</a>
      </p>
    </main>
  );
}
