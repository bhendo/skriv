import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { foldableSyntaxFacet, prosemarkMarkdownSyntaxExtensions } from "@prosemark/core";
import { parser as markdownParser, GFM } from "@lezer/markdown";
import type { SyntaxNode } from "@lezer/common";
import { focusWidgetSource, fullLineRange } from "./fold-widget";

// Standalone parser so the widget renders from the table's source text alone
// (a pure source → DOM function, unit-testable without an editor instance).
// Configured like the editor's markdown language so cell content parses
// identically inside and outside tables.
const tableParser = markdownParser.configure([GFM, prosemarkMarkdownSyntaxExtensions]);

export type ColumnAlignment = "left" | "center" | "right" | null;

/** Parse a GFM delimiter row (`| :--- | ---: |`) into per-column alignment. */
export function parseAlignments(delimiterRow: string): ColumnAlignment[] {
  return delimiterRow
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0)
    .map((cell) => {
      const left = cell.startsWith(":");
      const right = cell.endsWith(":");
      if (left && right) return "center";
      if (right) return "right";
      if (left) return "left";
      return null;
    });
}

// Syntax-only nodes skipped when rendering inline content. URL is included
// because link previews show the link text, not the destination.
const SKIPPED_NODES = new Set([
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "StrikethroughMark",
  "URL",
  "LinkTitle",
]);

const INLINE_TAGS: Record<string, string> = {
  StrongEmphasis: "strong",
  Emphasis: "em",
  InlineCode: "code",
  Strikethrough: "s",
};

function appendInline(
  source: string,
  container: SyntaxNode,
  from: number,
  to: number,
  parent: HTMLElement
): void {
  let pos = from;
  for (let child = container.firstChild; child; child = child.nextSibling) {
    if (child.to <= from || child.from >= to) continue;
    if (child.from > pos) {
      parent.appendChild(document.createTextNode(source.slice(pos, child.from)));
    }
    if (!SKIPPED_NODES.has(child.name)) {
      parent.appendChild(renderInlineNode(source, child));
    }
    pos = child.to;
  }
  if (pos < to) {
    parent.appendChild(document.createTextNode(source.slice(pos, to)));
  }
}

function renderInlineNode(source: string, node: SyntaxNode): HTMLElement {
  const el = document.createElement(INLINE_TAGS[node.name] ?? "span");
  if (node.name === "Link") {
    // Styled span, not an anchor — a real href would navigate the webview
    // away from the app on click.
    el.className = "cm-table-link";
  }
  appendInline(source, node, node.from, node.to, el);
  return el;
}

function renderCell(
  source: string,
  cell: SyntaxNode,
  tag: "th" | "td",
  align: ColumnAlignment
): HTMLTableCellElement {
  const el = document.createElement(tag);
  if (align) el.style.textAlign = align;
  appendInline(source, cell, cell.from, cell.to, el);
  return el;
}

/**
 * Render a GFM table's source text to a preview DOM element. Falls back to
 * plain <pre> text if the source no longer parses as a table.
 */
export function renderTablePreview(source: string): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "cm-table-preview";

  const tree = tableParser.parse(source);
  const tableNode = tree.topNode.getChild("Table");
  if (!tableNode) {
    const pre = document.createElement("pre");
    pre.textContent = source;
    dom.appendChild(pre);
    return dom;
  }

  // The alignment row is the only TableDelimiter that is a direct child of
  // Table (the `|` separators inside rows belong to TableHeader/TableRow).
  const delimiter = tableNode.getChild("TableDelimiter");
  const alignments = delimiter ? parseAlignments(source.slice(delimiter.from, delimiter.to)) : [];

  const table = document.createElement("table");
  let tbody: HTMLTableSectionElement | null = null;

  for (let row = tableNode.firstChild; row; row = row.nextSibling) {
    const isHeader = row.name === "TableHeader";
    if (!isHeader && row.name !== "TableRow") continue;

    const tr = document.createElement("tr");
    let i = 0;
    for (let cell = row.firstChild; cell; cell = cell.nextSibling) {
      if (cell.name !== "TableCell") continue;
      tr.appendChild(renderCell(source, cell, isHeader ? "th" : "td", alignments[i] ?? null));
      i++;
    }

    if (isHeader) {
      const thead = document.createElement("thead");
      thead.appendChild(tr);
      table.appendChild(thead);
    } else {
      if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
      }
      tbody.appendChild(tr);
    }
  }

  dom.appendChild(table);
  return dom;
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source;
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = renderTablePreview(this.source);
    // Clicking the preview moves the cursor into the table source, which
    // unfolds the widget back to editable pipe syntax.
    dom.addEventListener("mousedown", (e) => {
      e.preventDefault();
      focusWidgetSource(view, dom);
    });
    return dom;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * Renders GFM tables as HTML previews. The fold driver only calls
 * buildDecorations while the selection is outside the node, so cursor entry
 * reveals the raw pipe syntax without any guard here.
 */
export const tablePreviewExtension = foldableSyntaxFacet.of({
  nodePath: "Table",
  buildDecorations: (state, node) => {
    const [from, to] = fullLineRange(state, node);
    const source = state.doc.sliceString(from, to);
    return Decoration.replace({ widget: new TableWidget(source), block: true }).range(from, to);
  },
});
