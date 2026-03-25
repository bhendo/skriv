import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { findMatches, type Match } from "./text-search";

export interface SearchState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  activeIndex: number;
}

const EMPTY_STATE: SearchState = {
  query: "",
  caseSensitive: false,
  matches: [],
  activeIndex: -1,
};

const META_KEY = "search-update";

export const SEARCH_MATCH_CLASS = "search-match";
export const SEARCH_MATCH_ACTIVE_CLASS = "search-match-active";

export const searchPluginKey = new PluginKey<SearchState>("search");

function recompute(
  doc: EditorState["doc"],
  query: string,
  caseSensitive: boolean,
  prevActiveIndex?: number
): Pick<SearchState, "matches" | "activeIndex"> {
  const matches = findMatches(doc, query, caseSensitive);
  if (matches.length === 0) return { matches, activeIndex: -1 };
  // Preserve active index on doc-change recomputes (e.g. Milkdown reconciliation)
  if (prevActiveIndex !== undefined && prevActiveIndex >= 0 && prevActiveIndex < matches.length) {
    return { matches, activeIndex: prevActiveIndex };
  }
  return { matches, activeIndex: 0 };
}

export function setSearchQuery(state: EditorState, query: string): Transaction {
  const current = searchPluginKey.getState(state) ?? EMPTY_STATE;
  const { matches, activeIndex } = recompute(state.doc, query, current.caseSensitive);
  return state.tr.setMeta(META_KEY, {
    ...current,
    query,
    matches,
    activeIndex,
  });
}

export function setCaseSensitive(state: EditorState, caseSensitive: boolean): Transaction {
  const current = searchPluginKey.getState(state) ?? EMPTY_STATE;
  const { matches, activeIndex } = recompute(state.doc, current.query, caseSensitive);
  return state.tr.setMeta(META_KEY, {
    ...current,
    caseSensitive,
    matches,
    activeIndex,
  });
}

export function nextMatch(state: EditorState): Transaction {
  const current = searchPluginKey.getState(state) ?? EMPTY_STATE;
  if (current.matches.length === 0) {
    return state.tr.setMeta(META_KEY, current);
  }
  const next = (current.activeIndex + 1) % current.matches.length;
  return state.tr.setMeta(META_KEY, { ...current, activeIndex: next });
}

export function prevMatch(state: EditorState): Transaction {
  const current = searchPluginKey.getState(state) ?? EMPTY_STATE;
  if (current.matches.length === 0) {
    return state.tr.setMeta(META_KEY, current);
  }
  const prev = (current.activeIndex - 1 + current.matches.length) % current.matches.length;
  return state.tr.setMeta(META_KEY, { ...current, activeIndex: prev });
}

export function clearSearch(state: EditorState): Transaction {
  return state.tr.setMeta(META_KEY, { ...EMPTY_STATE });
}

function buildDecorations(state: EditorState, search: SearchState): DecorationSet {
  if (!search.query || search.matches.length === 0) {
    return DecorationSet.empty;
  }

  const decos: Decoration[] = [];

  for (let i = 0; i < search.matches.length; i++) {
    const { from, to } = search.matches[i];
    decos.push(Decoration.inline(from, to, { class: SEARCH_MATCH_CLASS }));
    if (i === search.activeIndex) {
      decos.push(Decoration.inline(from, to, { class: SEARCH_MATCH_ACTIVE_CLASS }));
    }
  }

  return DecorationSet.create(state.doc, decos);
}

export function createSearchPlugin(): Plugin<SearchState> {
  return new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init(): SearchState {
        return { ...EMPTY_STATE };
      },
      apply(tr, prev, _oldState, newState): SearchState {
        const meta = tr.getMeta(META_KEY) as SearchState | undefined;
        if (meta) return meta;

        if (tr.docChanged && prev.query) {
          const { matches, activeIndex } = recompute(
            newState.doc,
            prev.query,
            prev.caseSensitive,
            prev.activeIndex
          );
          return { ...prev, matches, activeIndex };
        }

        return prev;
      },
    },
    props: {
      decorations(state) {
        const search = searchPluginKey.getState(state);
        if (!search) return DecorationSet.empty;
        return buildDecorations(state, search);
      },
    },
  });
}
