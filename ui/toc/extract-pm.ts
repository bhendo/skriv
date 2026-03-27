import type { Node } from "@milkdown/kit/prose/model";
import type { TocHeading } from "../types/toc";

const HEADING_TYPES = new Set(["heading", "heading_source"]);
const ATX_PREFIX_RE = /^#{1,6}\s+/;

/** Strip the leading `## ` ATX prefix that heading_source nodes include in textContent. */
function stripAtxPrefix(text: string): string {
  return text.replace(ATX_PREFIX_RE, "");
}

export function extractHeadingsFromPM(doc: Node): TocHeading[] {
  const headings: TocHeading[] = [];
  doc.descendants((node, pos) => {
    if (HEADING_TYPES.has(node.type.name)) {
      const raw = node.textContent;
      headings.push({
        level: node.attrs.level as number,
        text: node.type.name === "heading_source" ? stripAtxPrefix(raw) : raw,
        pos,
      });
      return false;
    }
  });
  return headings;
}
