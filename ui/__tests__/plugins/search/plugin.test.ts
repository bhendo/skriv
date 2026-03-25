import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import {
  searchPluginKey,
  createSearchPlugin,
  setSearchQuery,
  setCaseSensitive,
  nextMatch,
  prevMatch,
  clearSearch,
  type SearchState,
} from "../../../plugins/search/plugin";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0] as const,
    },
    text: { group: "inline" },
  },
  marks: {
    bold: { toDOM: () => ["strong", 0] as const },
  },
});

function createState(text: string, searchState?: Partial<SearchState>) {
  const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text(text)])]);
  const plugin = createSearchPlugin();
  const state = EditorState.create({
    doc,
    plugins: [plugin],
    selection: TextSelection.create(doc, 1),
  });

  if (searchState?.query) {
    const tr = setSearchQuery(state, searchState.query);
    return state.apply(tr);
  }
  return state;
}

describe("search plugin state", () => {
  it("initializes with empty search state", () => {
    const state = createState("hello world");
    const search = searchPluginKey.getState(state)!;
    expect(search.query).toBe("");
    expect(search.matches).toHaveLength(0);
    expect(search.activeIndex).toBe(-1);
    expect(search.caseSensitive).toBe(false);
  });

  it("setSearchQuery computes matches and sets activeIndex to 0", () => {
    const state = createState("hello world hello");
    const tr = setSearchQuery(state, "hello");
    const newState = state.apply(tr);
    const search = searchPluginKey.getState(newState)!;
    expect(search.query).toBe("hello");
    expect(search.matches).toHaveLength(2);
    expect(search.activeIndex).toBe(0);
  });

  it("setSearchQuery with no matches sets activeIndex to -1", () => {
    const state = createState("hello world");
    const tr = setSearchQuery(state, "xyz");
    const newState = state.apply(tr);
    const search = searchPluginKey.getState(newState)!;
    expect(search.matches).toHaveLength(0);
    expect(search.activeIndex).toBe(-1);
  });
});

describe("match navigation", () => {
  it("nextMatch advances activeIndex", () => {
    let state = createState("abc abc abc");
    state = state.apply(setSearchQuery(state, "abc"));
    const search1 = searchPluginKey.getState(state)!;
    expect(search1.activeIndex).toBe(0);
    expect(search1.matches).toHaveLength(3);

    state = state.apply(nextMatch(state));
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(1);

    state = state.apply(nextMatch(state));
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(2);
  });

  it("nextMatch wraps around to 0", () => {
    let state = createState("abc abc");
    state = state.apply(setSearchQuery(state, "abc"));
    state = state.apply(nextMatch(state)); // -> 1
    state = state.apply(nextMatch(state)); // -> 0 (wrap)
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(0);
  });

  it("prevMatch goes backwards", () => {
    let state = createState("abc abc abc");
    state = state.apply(setSearchQuery(state, "abc"));
    state = state.apply(nextMatch(state)); // -> 1
    state = state.apply(prevMatch(state)); // -> 0
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(0);
  });

  it("prevMatch wraps around to last match", () => {
    let state = createState("abc abc abc");
    state = state.apply(setSearchQuery(state, "abc"));
    state = state.apply(prevMatch(state)); // -> 2 (wrap)
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(2);
  });

  it("nextMatch is no-op with no matches", () => {
    let state = createState("hello");
    state = state.apply(setSearchQuery(state, "xyz"));
    const tr = nextMatch(state);
    state = state.apply(tr);
    expect(searchPluginKey.getState(state)!.activeIndex).toBe(-1);
  });
});

describe("case sensitivity", () => {
  it("setCaseSensitive recomputes matches", () => {
    let state = createState("Hello hello HELLO");
    state = state.apply(setSearchQuery(state, "hello"));
    expect(searchPluginKey.getState(state)!.matches).toHaveLength(3);

    state = state.apply(setCaseSensitive(state, true));
    expect(searchPluginKey.getState(state)!.matches).toHaveLength(1);
    expect(searchPluginKey.getState(state)!.caseSensitive).toBe(true);
  });
});

describe("clearSearch", () => {
  it("resets all search state", () => {
    let state = createState("hello world hello");
    state = state.apply(setSearchQuery(state, "hello"));
    expect(searchPluginKey.getState(state)!.matches).toHaveLength(2);

    state = state.apply(clearSearch(state));
    const search = searchPluginKey.getState(state)!;
    expect(search.query).toBe("");
    expect(search.matches).toHaveLength(0);
    expect(search.activeIndex).toBe(-1);
  });
});

describe("decorations", () => {
  it("creates decorations for all matches plus active highlight", () => {
    let state = createState("abc def abc");
    state = state.apply(setSearchQuery(state, "abc"));

    const plugin = createSearchPlugin();
    const decoSource = plugin.spec.props?.decorations?.call(plugin, state);
    const decoSet = decoSource as import("@milkdown/kit/prose/view").DecorationSet;
    const decos = decoSet.find();
    expect(decos.length).toBeGreaterThanOrEqual(2);
  });
});
