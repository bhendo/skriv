import type { Node } from "@milkdown/kit/prose/model";

export interface ParsedMarker {
  type: "bullet" | "ordered" | "unwrap" | "invalid";
  startNumber?: number;
}

/**
 * Parse a marker input value to determine the user's intent.
 *
 * - `-`, `*`, `+` → bullet
 * - `N.` → ordered (with start number)
 * - empty → unwrap (lift out of list)
 * - anything else → invalid (revert)
 */
export function parseMarker(value: string): ParsedMarker {
  const trimmed = value.trim();
  if (!trimmed) return { type: "unwrap" };
  if (/^[-*+]$/.test(trimmed)) return { type: "bullet" };
  const orderedMatch = trimmed.match(/^(\d+)\.$/);
  if (orderedMatch) return { type: "ordered", startNumber: Number(orderedMatch[1]) };
  return { type: "invalid" };
}

/**
 * Derive the raw markdown marker text from a list_item node.
 *
 * When `parentListType` is provided it takes precedence over
 * `node.attrs.listType`, because Milkdown's input rules create
 * list_item nodes with default `listType:"bullet"` even inside an
 * `ordered_list` wrapper — the attrs are only corrected later by
 * the sync plugin (if at all).
 */
export function markerForListItem(node: Node, parentListType?: string): string {
  const listType = parentListType ?? (node.attrs.listType as string);
  if (listType === "ordered") {
    const label = node.attrs.label as string;
    // Only use the label if it looks like an ordered marker (e.g. "1.").
    // When Milkdown's input rules create an ordered list the list_item
    // attrs are still bullet defaults (label:"•"), so we fall back to "1.".
    if (label && /^\d+\.$/.test(label)) return label;
    return "1.";
  }
  return "-";
}
