import type { Node } from "@milkdown/kit/prose/model";

export interface ParsedMarker {
  type: "bullet" | "ordered" | "unwrap" | "invalid";
  startNumber?: number;
  checked?: boolean | null;
}

/**
 * Parse a marker input value to determine the user's intent.
 *
 * - `-`, `*`, `+` → bullet
 * - `- [ ]`, `- [x]` → task bullet
 * - `N.` → ordered (with start number)
 * - `N. [ ]`, `N. [x]` → ordered task item
 * - empty → unwrap (lift out of list)
 * - anything else → invalid (revert)
 */
export function parseMarker(value: string): ParsedMarker {
  const trimmed = value.trim();
  if (!trimmed) return { type: "unwrap" };

  const bulletMatch = trimmed.match(/^[-*+](?:\s+\[( |x|X)\])?$/);
  if (bulletMatch) {
    if (bulletMatch[1] == null) return { type: "bullet" };
    return { type: "bullet", checked: bulletMatch[1].toLowerCase() === "x" };
  }

  const orderedMatch = trimmed.match(/^(\d+)\.(?:\s+\[( |x|X)\])?$/);
  if (orderedMatch) {
    if (orderedMatch[2] == null) {
      return {
        type: "ordered",
        startNumber: Number(orderedMatch[1]),
      };
    }

    return {
      type: "ordered",
      startNumber: Number(orderedMatch[1]),
      checked: orderedMatch[2].toLowerCase() === "x",
    };
  }

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
export function markerForListItem(node: Node, parentListType?: "bullet" | "ordered"): string {
  const listType = parentListType ?? (node.attrs.listType as string);
  const checked = (node.attrs.checked as boolean | null | undefined) ?? null;

  let marker: string;
  if (listType === "ordered") {
    const label = node.attrs.label as string;
    // Only use the label if it looks like an ordered marker (e.g. "1.").
    // When Milkdown's input rules create an ordered list the list_item
    // attrs are still bullet defaults (label:"•"), so we fall back to "1.".
    marker = label && /^\d+\.$/.test(label) ? label : "1.";
  } else {
    marker = "-";
  }

  if (checked == null) return marker;
  return `${marker} [${checked ? "x" : " "}]`;
}
