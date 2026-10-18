import { readFileSync } from "fs";
import { markSvgPath } from "./vocab";

const cache = new Map<string, string>();

/** Inner SVG markup (without outer <svg>) for embedding / <symbol>. */
export function markInnerSvg(markId: string): string {
  const cached = cache.get(markId);
  if (cached) return cached;
  const raw = readFileSync(markSvgPath(markId), "utf8");
  const inner = raw
    .replace(/<\?xml[^>]*>/g, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>/i, "")
    .trim();
  cache.set(markId, inner);
  return inner;
}

export function markSvgElement(markId: string, className?: string): string {
  const cls = className ? ` class="${className}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-hidden="true"${cls}>${markInnerSvg(markId)}</svg>`;
}
