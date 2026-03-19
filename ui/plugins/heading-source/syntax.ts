import { Fragment, type Node, type Schema } from "@milkdown/kit/prose/model";

export interface HeadingPrefix {
  level: number;
  contentStart: number;
}

export function parseHeadingPrefix(text: string): HeadingPrefix | null {
  const match = text.match(/^(#{1,6})(\s)?/);
  if (!match) return null;
  return {
    level: match[1].length,
    contentStart: match[0].length,
  };
}

export function buildHeadingPrefix(level: number): string {
  return "#".repeat(level) + " ";
}

export function stripPrefix(content: Fragment, prefixLen: number, schema: Schema): Fragment {
  if (prefixLen === 0) return content;
  let remaining = prefixLen;
  const children: Node[] = [];

  content.forEach((child) => {
    if (remaining <= 0) {
      children.push(child);
      return;
    }
    if (child.isText && child.text) {
      if (remaining >= child.text.length) {
        remaining -= child.text.length;
      } else {
        children.push(schema.text(child.text.slice(remaining), child.marks));
        remaining = 0;
      }
    } else {
      if (remaining >= child.nodeSize) {
        remaining -= child.nodeSize;
      } else {
        children.push(child);
        remaining = 0;
      }
    }
  });

  return Fragment.from(children);
}
