import { useState, useCallback, useRef } from "react";
import type { EditorHandle } from "../types/editor";
import { useEditorView } from "./useEditorView";
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceNext,
  replaceAll,
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
  const [initialShowReplace, setInitialShowReplace] = useState(false);
  const [searchInfo, setSearchInfo] = useState<SearchInfo>({
    matchCount: 0,
    activeIndex: -1,
    caseSensitive: false,
  });
  const [initialQuery, setInitialQuery] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const caseSensitiveRef = useRef(false);

  const getView = useEditorView(editorRef);

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

  // The replace text lives in SearchBar and rides in only when a replace is
  // actually invoked, so typing in the replace field costs no editor
  // transactions. replaceNext only replaces when the selection sits on a
  // match; otherwise it moves to the next match, so the first invocation
  // selects rather than edits.
  const replaceCommand = useCallback(
    (replaceText: string, command: (view: EditorView) => boolean) => {
      const view = getView();
      if (!view) return;
      const sq = new SearchQuery({
        search: getSearchQuery(view.state).search,
        caseSensitive: caseSensitiveRef.current,
        replace: replaceText,
      });
      view.dispatch({ effects: setSearchQuery.of(sq) });
      command(view);
      setSearchInfo((prev) => ({ ...prev, ...countMatches(view) }));
    },
    [getView]
  );

  const handleReplace = useCallback(
    (replaceText: string) => replaceCommand(replaceText, replaceNext),
    [replaceCommand]
  );
  const handleReplaceAll = useCallback(
    (replaceText: string) => replaceCommand(replaceText, replaceAll),
    [replaceCommand]
  );

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

  const open = useCallback(
    (withReplace: boolean) => {
      const selected = getSelectedText();
      if (selected) {
        setInitialQuery(selected);
        handleQueryChange(selected);
      } else {
        setInitialQuery("");
      }
      setInitialShowReplace(withReplace);
      setIsSearchOpen(true);
      setFocusKey((k) => k + 1);
    },
    [getSelectedText, handleQueryChange]
  );

  const openSearch = useCallback(() => open(false), [open]);
  const openReplace = useCallback(() => open(true), [open]);

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
    initialShowReplace,
    searchInfo,
    initialQuery,
    focusKey,
    openSearch,
    openReplace,
    closeSearch,
    handleQueryChange,
    handleNext,
    handlePrev,
    handleToggleCaseSensitive,
    handleReplace,
    handleReplaceAll,
  };
}
