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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseInlineSyntax(_raw: string): ParsedSyntax {
  throw new Error("Not implemented");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computePrefixLength(_markNames: string[]): number {
  throw new Error("Not implemented");
}
