import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, ViewPlugin, EditorView, ViewUpdate } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { getSearchQuery, search } from "@codemirror/search";

const matchDeco = Decoration.mark({ class: "skriv-search-match" });
const activeDeco = Decoration.mark({ class: "skriv-search-match skriv-search-match-active" });

/**
 * Highlight all matches of the current search query in the viewport.
 * @codemirror/search's own highlighter only draws while its built-in panel is
 * open, and Skriv's search bar is a React component, so the query set via
 * setSearchQuery never highlights without this plugin. The match the selection
 * sits on (after find next/previous) gets the active class.
 */
const searchHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.highlight(view);
    }

    update(update: ViewUpdate) {
      // getSearchQuery returns the stable query object held in search state
      // (search() installs the field eagerly), so identity compare detects
      // query changes without walking transaction effects.
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        getSearchQuery(update.state) !== getSearchQuery(update.startState)
      ) {
        this.decorations = this.highlight(update.view);
      }
    }

    highlight(view: EditorView): DecorationSet {
      const query = getSearchQuery(view.state);
      if (!query.valid || !query.search) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      const { from: selFrom, to: selTo } = view.state.selection.main;
      for (const { from, to } of view.visibleRanges) {
        const cursor = query.getCursor(view.state.doc, from, to);
        for (let result = cursor.next(); !result.done; result = cursor.next()) {
          const match = result.value;
          const isActive = match.from === selFrom && match.to === selTo;
          builder.add(match.from, match.to, isActive ? activeDeco : matchDeco);
        }
      }
      return builder.finish();
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

/**
 * Everything document search needs in an editor: the search state field plus
 * the viewport highlighter. Bundled so an editor can't get one without the
 * other — searchHighlight is inert without search()'s state field.
 */
export const searchExtensions: Extension = [search(), searchHighlight];
