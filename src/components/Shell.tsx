import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <main className="shell-main">{children}</main>
      <footer className="shell-footer">
        <a href="/record">Record</a>
        <a href="/llms.txt">llms.txt</a>
        <a href="/data">Data</a>
      </footer>
    </div>
  );
}
