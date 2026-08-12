import { parser, GFM } from "@lezer/markdown";
import type { MarkdownExtension } from "@lezer/markdown";
import { prosemarkMarkdownSyntaxExtensions } from "@prosemark/core";

/**
 * Syntax extensions for the live-preview editor's markdown language, shared
 * with every standalone parser so source-analysis code (table previews,
 * outline extraction) can never disagree with what the editor renders.
 */
export const markdownSyntaxExtensions: MarkdownExtension = [GFM, prosemarkMarkdownSyntaxExtensions];

/** Standalone parser for pure source → data functions, no editor required. */
export const sourceMarkdownParser = parser.configure(markdownSyntaxExtensions);
