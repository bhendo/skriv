export interface ParsedLink {
  text: string;
  href: string;
  title: string;
}

const TITLE_REGEX = /^(.+?)\s+"([^"]*)"$/;
const HAS_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;

/** Prepend https:// if href has no protocol and isn't a relative/anchor path. */
export function normalizeHref(href: string): string {
  if (!href || HAS_PROTOCOL.test(href) || href[0] === "/" || href[0] === "#") {
    return href;
  }
  return `https://${href}`;
}

export function parseLinkSyntax(raw: string): ParsedLink | null {
  if (!raw || raw[0] !== "[") return null;

  const closeBracket = raw.indexOf("](");
  if (closeBracket < 1) return null;

  const text = raw.slice(1, closeBracket);
  if (!text) return null;

  if (raw[raw.length - 1] !== ")") return null;

  const urlPart = raw.slice(closeBracket + 2, raw.length - 1);
  if (!urlPart) return null;

  let href = urlPart;
  let title = "";

  const titleMatch = urlPart.match(TITLE_REGEX);
  if (titleMatch) {
    href = titleMatch[1]!;
    title = titleMatch[2]!;
  }

  if (!href) return null;

  return { text, href: normalizeHref(href), title };
}

/**
 * Regex for matching typed link syntax. Excludes ] from text and ) from URL
 * to prevent greedy over-matching across multiple links.
 */
export const LINK_INPUT_RULE_REGEX = /\[([^\]]+)\]\(([^)]+)\)$/;

export function buildLinkRawText(text: string, href: string, title?: string): string {
  if (title) {
    return `[${text}](${href} "${title}")`;
  }
  return `[${text}](${href})`;
}

export interface LinkTrailingSplit {
  text: string;
  href: string;
  title: string;
  trailing: string;
}

export function findLinkTrailingSplit(raw: string): LinkTrailingSplit | null {
  if (!raw || raw[0] !== "[") return null;

  // If the whole string is already a valid link, no split needed.
  if (parseLinkSyntax(raw)) return null;

  // Scan backwards for the last `)` that completes a valid link pattern.
  for (let i = raw.length - 2; i >= 3; i--) {
    if (raw[i] !== ")") continue;

    const candidate = raw.slice(0, i + 1);
    const parsed = parseLinkSyntax(candidate);
    if (parsed) {
      return {
        text: parsed.text,
        href: parsed.href,
        title: parsed.title,
        trailing: raw.slice(i + 1),
      };
    }
  }

  return null;
}
