import type { Node as PMNode } from "@milkdown/kit/prose/model";

export interface TextExtraction {
  text: string;
  posMap: number[];
}

export interface Match {
  from: number;
  to: number;
}

export function extractText(doc: PMNode): TextExtraction {
  const chunks: string[] = [];
  const posMap: number[] = [];
  let first = true;

  doc.descendants((node, pos) => {
    // Skip nodes whose content renders as non-text (e.g. SVG diagrams)
    // — decorations can't highlight inside these, so matches would be invisible
    if (node.type.name === "mermaid_block") {
      return false;
    }
    if (node.isText && node.text) {
      chunks.push(node.text);
      for (let i = 0; i < node.text.length; i++) {
        posMap.push(pos + i);
      }
      return false;
    }
    if (node.isBlock && node !== doc) {
      if (!first) {
        chunks.push("\n");
        posMap.push(-1);
      }
      first = false;
    }
    return true;
  });

  return { text: chunks.join(""), posMap };
}

export function findMatches(doc: PMNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) return [];

  const { text, posMap } = extractText(doc);
  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  const matches: Match[] = [];

  let start = 0;
  while (start <= searchText.length - searchQuery.length) {
    const idx = searchText.indexOf(searchQuery, start);
    if (idx === -1) break;
    matches.push({
      from: posMap[idx],
      to: posMap[idx + searchQuery.length - 1] + 1,
    });
    start = idx + 1;
  }

  return matches;
}
