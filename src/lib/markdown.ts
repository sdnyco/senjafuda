/** Minimal markdown for landing copy: # headings, **bold**, paragraphs, blank lines. */
export function renderSimpleMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length === 0) return;
    const text = para.join(" ").trim();
    if (text) html.push(`<p>${inline(text)}</p>`);
    para = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      flush();
      html.push(`<h1>${inline(h1[1])}</h1>`);
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return html.join("\n");
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
