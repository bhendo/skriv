import type { TocHeading } from "../types/toc";

const HEADING_RE = /^(#{1,6})\s+(.+)/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function extractHeadingsFromText(text: string): TocHeading[] {
  const headings: TocHeading[] = [];
  let inFence = false;
  let offset = 0;

  for (const line of text.split("\n")) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = HEADING_RE.exec(line);
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2],
          pos: offset,
        });
      }
    }
    offset += line.length + 1;
  }

  return headings;
}
