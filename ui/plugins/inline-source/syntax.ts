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

const PARSE_PATTERNS: { regex: RegExp; marks: string[] }[] = [
  { regex: /^\*\*\*(.+)\*\*\*$/, marks: ["strong", "emphasis"] },
  { regex: /^___(.+)___$/, marks: ["strong", "emphasis"] },
  { regex: /^\*\*(.+)\*\*$/, marks: ["strong"] },
  { regex: /^__(.+)__$/, marks: ["strong"] },
  { regex: /^~~(.+)~~$/, marks: ["strike_through"] },
  { regex: /^\*(.+)\*$/, marks: ["emphasis"] },
  { regex: /^_(.+)_$/, marks: ["emphasis"] },
  { regex: /^`(.+)`$/, marks: ["inlineCode"] },
];

export function parseInlineSyntax(raw: string): ParsedSyntax {
  if (!raw) return { text: "", marks: [] };

  for (const { regex, marks } of PARSE_PATTERNS) {
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
