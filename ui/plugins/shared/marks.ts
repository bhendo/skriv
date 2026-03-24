import type { Mark, MarkType } from "@milkdown/kit/prose/model";

/** Build Mark[] from mark names, filtering any that don't exist in the schema. */
export function createMarks(
  schema: { marks: Record<string, MarkType> },
  markNames: string[]
): Mark[] {
  return markNames.map((name) => schema.marks[name]?.create()).filter((m): m is Mark => m != null);
}

/** Keys that represent intentional cursor navigation. */
export const NAV_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);
