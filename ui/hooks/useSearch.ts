import { useState, useCallback, useRef } from "react";
import type { EditorHandle } from "../types/editor";
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  getSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";

interface UseSearchOptions {
  editorRef: React.RefObject<EditorHandle | null>;
}

export interface SearchInfo {
  matchCount: number;
  activeIndex: number;
  caseSensitive: boolean;
}

function countMatches(view: EditorView): { matchCount: number; activeIndex: number } {
  const query = getSearchQuery(view.state);
  if (!query.valid) return { matchCount: 0, activeIndex: -1 };

  let count = 0;
  let activeIndex = -1;
  const head = view.state.selection.main.head;
  const cursor = query.getCursor(view.state.doc);
  let result = cursor.next();
  while (!result.done) {
    if (activeIndex === -1 && result.value.from >= head) {
      activeIndex = count;
    }
    count++;
    result = cursor.next();
  }
  if (count > 0 && activeIndex === -1) activeIndex = 0;
  return { matchCount: count, activeIndex };
}

export function useSearch({ editorRef }: UseSearchOptions) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInfo, setSearchInfo] = useState<SearchInfo>({
    matchCount: 0,
    activeIndex: -1,
    caseSensitive: false,
  });
  const [initialQuery, setInitialQuery] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const caseSensitiveRef = useRef(false);

  const getView = useCallback(() => {
    return editorRef.current?.getCodeMirrorView() ?? null;
  }, [editorRef]);

  const getSelectedText = useCallback((): string => {
    const view = getView();
    if (!view) return "";
    const { from, to } = view.state.selection.main;
    return from !== to ? view.state.sliceDoc(from, to) : "";
  }, [getView]);

  const applyQuery = useCallback(
    (query: string, caseSensitive: boolean) => {
      const view = getView();
      if (!view) return null;
      const sq = new SearchQuery({ search: query, caseSensitive });
      view.dispatch({ effects: setSearchQuery.of(sq) });
      return view;
    },
    [getView]
  );

  const handleQueryChange = useCallback(
    (query: string) => {
      const view = applyQuery(query, caseSensitiveRef.current);
      if (!view) return;
      setSearchInfo((prev) => ({ ...prev, ...countMatches(view) }));
    },
    [applyQuery]
  );

  const navigateMatch = useCallback(
    (command: (view: EditorView) => boolean) => {
      const view = getView();
      if (!view) return;
      command(view);
      setSearchInfo((prev) => ({ ...prev, ...countMatches(view) }));
    },
    [getView]
  );

  const handleNext = useCallback(() => navigateMatch(findNext), [navigateMatch]);
  const handlePrev = useCallback(() => navigateMatch(findPrevious), [navigateMatch]);

  const handleToggleCaseSensitive = useCallback(() => {
    const newValue = !caseSensitiveRef.current;
    caseSensitiveRef.current = newValue;
    const current = getView();
    if (!current) return;
    // The live query already lives in CodeMirror's search state
    const view = applyQuery(getSearchQuery(current.state).search, newValue);
    if (!view) return;
    setSearchInfo({ ...countMatches(view), caseSensitive: newValue });
  }, [getView, applyQuery]);

  const openSearch = useCallback(() => {
    const selected = getSelectedText();
    if (selected) {
      setInitialQuery(selected);
      handleQueryChange(selected);
    } else {
      setInitialQuery("");
    }
    setIsSearchOpen(true);
    setFocusKey((k) => k + 1);
  }, [getSelectedText, handleQueryChange]);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    const view = getView();
    if (view) {
      view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
      view.focus();
    }
    setSearchInfo({
      matchCount: 0,
      activeIndex: -1,
      caseSensitive: caseSensitiveRef.current,
    });
  }, [getView]);

  return {
    isSearchOpen,
    searchInfo,
    initialQuery,
    focusKey,
    openSearch,
    closeSearch,
    handleQueryChange,
    handleNext,
    handlePrev,
    handleToggleCaseSensitive,
  };
}
