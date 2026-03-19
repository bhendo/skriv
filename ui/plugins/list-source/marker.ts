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
 * Derive the raw markdown marker text from a list_item node's attributes.
 * Returns e.g. `-` for bullet items, `1.` for ordered items.
 */
export function markerForListItem(node: Node): string {
  const listType = node.attrs.listType as string;
  if (listType === "ordered") {
    return (node.attrs.label as string) || "1.";
  }
  return "-";
}
