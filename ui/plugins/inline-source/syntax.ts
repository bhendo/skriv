export const MARK_SYNTAX: Record<string, { prefix: string; suffix: string; remarkType: string }> = {
  strong: { prefix: "**", suffix: "**", remarkType: "strong" },
  emphasis: { prefix: "*", suffix: "*", remarkType: "emphasis" },
  strike_through: { prefix: "~~", suffix: "~~", remarkType: "delete" },
  inlineCode: { prefix: "`", suffix: "`", remarkType: "inlineCode" },
};

export const SUPPORTED_MARKS = Object.keys(MARK_SYNTAX);

const MARK_PRIORITY: Record<string, number> = {
  strong: 0,
  emphasis: 1,
  strike_through: 2,
  inlineCode: 3,
};

function sortByPriority(markNames: string[]): string[] {
  return [...markNames].sort((a, b) => (MARK_PRIORITY[a] ?? 99) - (MARK_PRIORITY[b] ?? 99));
}

export function buildRawText(text: string, markNames: string[]): string {
  const sorted = sortByPriority(markNames);
  let prefix = "";
  let suffix = "";
  for (const name of sorted) {
    const syntax = MARK_SYNTAX[name];
    if (syntax) {
      prefix += syntax.prefix;
      suffix = syntax.suffix + suffix;
    }
  }
  return prefix + text + suffix;
}

export interface ParsedSyntax {
  text: string;
  marks: string[];
}

/**
 * All recognized marker patterns, ordered longest-first so that `***`
 * is matched before `**` or `*`.  Each entry carries literal prefix/suffix
 * strings, the mark names it represents, and a lazily-built regex for
 * full-string parsing.  Both `parseInlineSyntax` and `findTrailingSplit`
 * are driven from this single list.
 */
const MARKER_PATTERNS: { prefix: string; suffix: string; marks: string[]; regex: RegExp }[] = [
  { prefix: "***", suffix: "***", marks: ["strong", "emphasis"] },
  { prefix: "___", suffix: "___", marks: ["strong", "emphasis"] },
  { prefix: "**", suffix: "**", marks: ["strong"] },
  { prefix: "__", suffix: "__", marks: ["strong"] },
  { prefix: "~~", suffix: "~~", marks: ["strike_through"] },
  { prefix: "*", suffix: "*", marks: ["emphasis"] },
  { prefix: "_", suffix: "_", marks: ["emphasis"] },
  { prefix: "`", suffix: "`", marks: ["inlineCode"] },
].map((p) => ({
  ...p,
  regex: new RegExp(`^${escapeRegExp(p.prefix)}(.+)${escapeRegExp(p.suffix)}$`),
}));

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseInlineSyntax(raw: string): ParsedSyntax {
  if (!raw) return { text: "", marks: [] };

  for (const { regex, marks } of MARKER_PATTERNS) {
    const match = raw.match(regex);
    if (match) {
      return { text: match[1]!, marks };
    }
  }

  return { text: raw, marks: [] };
}

export function computePrefixLength(markNames: string[]): number {
  const sorted = sortByPriority(markNames);
  let length = 0;
  for (const name of sorted) {
    const syntax = MARK_SYNTAX[name];
    if (syntax) length += syntax.prefix.length;
  }
  return length;
}

export function computeSuffixLength(markNames: string[]): number {
  let length = 0;
  for (const name of markNames) {
    const syntax = MARK_SYNTAX[name];
    if (syntax) length += syntax.suffix.length;
  }
  return length;
}

export interface SyntaxSplit {
  /** Inner text without markers (e.g. "test") */
  innerText: string;
  /** Mark names parsed from the syntax portion */
  marks: string[];
  /** Trailing text after the closing markers (e.g. " x") */
  trailing: string;
}

/**
 * Find text that trails after closed syntax markers within a raw string.
 *
 * For example, given `**test** x`:
 * - innerText: `test`
 * - marks: `["strong"]`
 * - trailing: ` x`
 *
 * Returns `null` if the entire string is a valid closed syntax pattern
 * (no trailing text) or if no syntax pattern is found at all.
 *
 * The algorithm first checks `parseInlineSyntax` — if the whole string is
 * a valid, fully-closed pattern there is no trailing text and we return
 * `null`.  Otherwise we search for each candidate prefix/suffix pair,
 * scanning for the *last* occurrence of the suffix that still leaves
 * trailing characters, to avoid false positives with short non-greedy
 * matches (e.g. `**b**old**` should not split into `**b**` + `old**`).
 */
export function findTrailingSplit(raw: string): SyntaxSplit | null {
  if (!raw) return null;

  // If the whole string is already a valid closed pattern, no split needed.
  const full = parseInlineSyntax(raw);
  if (full.marks.length > 0) return null;

  for (const { prefix, suffix, marks } of MARKER_PATTERNS) {
    if (!raw.startsWith(prefix)) continue;

    // The inner text must start after the prefix and be at least 1 char.
    const searchStart = prefix.length + 1;
    if (searchStart > raw.length) continue;

    // Find the last occurrence of the suffix that leaves trailing text.
    // We search from the end backwards so that we get the longest valid
    // inner content (avoiding the non-greedy problem).
    const lastSuffixStart = raw.lastIndexOf(suffix, raw.length - 2);
    if (lastSuffixStart < prefix.length) continue;

    // Ensure the suffix doesn't overlap with the prefix
    if (lastSuffixStart < searchStart - 1) continue;

    const splitPos = lastSuffixStart + suffix.length;
    if (splitPos >= raw.length) continue; // no trailing text

    const innerText = raw.slice(prefix.length, lastSuffixStart);
    if (innerText.length === 0) continue; // empty inner text

    // Guard against matching a shorter marker when a longer one applies.
    // E.g. for `***test*** x`, the `**` candidate would find `*test**` as
    // inner text and `* x` as trailing — wrong.  Verify that the character
    // adjacent to the prefix/suffix is NOT the same marker character.
    const markerChar = prefix[0];
    if (raw[prefix.length] === markerChar) continue;
    if (lastSuffixStart > 0 && raw[lastSuffixStart - 1] === markerChar) continue;

    const trailing = raw.slice(splitPos);

    return { innerText, marks, trailing };
  }

  return null;
}
