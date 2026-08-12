import type { SyntaxNode } from "@lezer/common";
import { sourceMarkdownParser } from "../markdown/parser";
import type { TocHeading } from "../types/toc";

const HEADING_NODE = /^(?:ATX|Setext)Heading([1-6])$/;

/** Subtrees that can never contain a heading — pruned from the tree walk. */
const HEADING_FREE_NODE = /^(?:Paragraph|FencedCode|CodeBlock|HTMLBlock|Table)$/;

/** Heading source minus its HeaderMark ranges (leading/closing #s, setext underline). */
function headingText(source: string, node: SyntaxNode): string {
  let text = "";
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "HeaderMark") {
      text += source.slice(cursor, child.from);
      cursor = child.to;
    }
  }
  text += source.slice(cursor, node.to);
  return text.trim();
}

/**
 * Extract h1-h6 headings from markdown source. Headings inside code blocks
 * are excluded by the grammar; headings nested in blockquotes or lists are
 * included because the editor renders them as headings.
 */
export function extractHeadings(source: string): TocHeading[] {
  const headings: TocHeading[] = [];
  sourceMarkdownParser.parse(source).iterate({
    enter(node) {
      const match = HEADING_NODE.exec(node.name);
      if (match) {
        headings.push({
          level: Number(match[1]),
          text: headingText(source, node.node),
          pos: node.from,
        });
        return false; // headingText already consumed the inline children
      }
      if (HEADING_FREE_NODE.test(node.name)) return false;
    },
  });
  return headings;
}

export function headingsEqual(a: TocHeading[], b: TocHeading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].level !== b[i].level || a[i].text !== b[i].text || a[i].pos !== b[i].pos) return false;
  }
  return true;
}

/** Index of the heading whose section contains topPos: the last heading at or before it. */
export function activeHeadingIndex(headings: TocHeading[], topPos: number): number {
  let active = -1;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].pos > topPos) break;
    active = i;
  }
  return active;
}
