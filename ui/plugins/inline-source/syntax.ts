export const MARK_SYNTAX: Record<string, { prefix: string; suffix: string }> = {
  strong: { prefix: "**", suffix: "**" },
  emphasis: { prefix: "*", suffix: "*" },
  strike_through: { prefix: "~~", suffix: "~~" },
  inlineCode: { prefix: "`", suffix: "`" },
};

export const SUPPORTED_MARKS = Object.keys(MARK_SYNTAX);

const MARK_PRIORITY: Record<string, number> = {
  strong: 0,
  emphasis: 1,
  strike_through: 2,
  inlineCode: 3,
};

export function buildRawText(text: string, markNames: string[]): string {
  const sorted = [...markNames].sort((a, b) => (MARK_PRIORITY[a] ?? 99) - (MARK_PRIORITY[b] ?? 99));
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

export function parseInlineSyntax(raw: string): ParsedSyntax {
  if (!raw) return { text: "", marks: [] };

  const patterns: { regex: RegExp; marks: string[] }[] = [
    { regex: /^\*\*\*(.+)\*\*\*$/, marks: ["strong", "emphasis"] },
    { regex: /^___(.+)___$/, marks: ["strong", "emphasis"] },
    { regex: /^\*\*(.+)\*\*$/, marks: ["strong"] },
    { regex: /^__(.+)__$/, marks: ["strong"] },
    { regex: /^~~(.+)~~$/, marks: ["strike_through"] },
    { regex: /^\*(.+)\*$/, marks: ["emphasis"] },
    { regex: /^_(.+)_$/, marks: ["emphasis"] },
    { regex: /^`(.+)`$/, marks: ["inlineCode"] },
  ];

  for (const { regex, marks } of patterns) {
    const match = raw.match(regex);
    if (match) {
      return { text: match[1]!, marks };
    }
  }

  return { text: raw, marks: [] };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computePrefixLength(_markNames: string[]): number {
  throw new Error("Not implemented");
}
