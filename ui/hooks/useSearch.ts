import { useState, useCallback, useRef } from "react";
import { editorViewCtx } from "@milkdown/core";
import type { Editor } from "@milkdown/core";
import type { EditorView as PMEditorView } from "@milkdown/kit/prose/view";
import type { EditorHandle } from "../types/editor";
import {
  searchPluginKey,
  SEARCH_MATCH_ACTIVE_CLASS,
  setSearchQuery as pmSetSearchQuery,
  setCaseSensitive as pmSetCaseSensitive,
  nextMatch as pmNextMatch,
  prevMatch as pmPrevMatch,
  clearSearch as pmClearSearch,
} from "../plugins/search";
import {
  SearchQuery,
  setSearchQuery as cmSetSearchQuery,
  findNext as cmFindNext,
  findPrevious as cmFindPrevious,
  getSearchQuery as cmGetSearchQuery,
} from "@codemirror/search";
import type { EditorView as CMEditorView } from "@codemirror/view";

interface UseSearchOptions {
  editorRef: React.RefObject<EditorHandle | null>;
  sourceMode: boolean;
  getMilkdownCtx: () => Editor["ctx"] | null;
}

export interface SearchInfo {
  matchCount: number;
  activeIndex: number;
  caseSensitive: boolean;
}

function syncPmSearchInfo(
  ctx: Editor["ctx"],
  setSearchInfo: React.Dispatch<React.SetStateAction<SearchInfo>>
) {
  const view = ctx.get(editorViewCtx);
  const search = searchPluginKey.getState(view.state);
  if (search) {
    setSearchInfo({
      matchCount: search.matches.length,
      activeIndex: search.activeIndex,
      caseSensitive: search.caseSensitive,
    });
  }
}

function countCmMatches(cmView: CMEditorView): { matchCount: number; activeIndex: number } {
  const query = cmGetSearchQuery(cmView.state);
  if (!query.valid) return { matchCount: 0, activeIndex: -1 };

  let count = 0;
  let activeIndex = -1;
  const head = cmView.state.selection.main.head;
  const cursor = query.getCursor(cmView.state.doc);
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

// ProseMirror's scrollIntoView only scrolls its own container, not
// the outer App scroll div — use DOM scrollIntoView on the decoration
// element instead. rAF waits for decorations to render.
function scrollActiveMatchIntoView(view: PMEditorView) {
  requestAnimationFrame(() => {
    if (!view.dom.isConnected) return;
    const el = view.dom.querySelector(`.${SEARCH_MATCH_ACTIVE_CLASS}`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

export function useSearch({ editorRef, sourceMode, getMilkdownCtx }: UseSearchOptions) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchInfo, setSearchInfo] = useState<SearchInfo>({
    matchCount: 0,
    activeIndex: -1,
    caseSensitive: false,
  });
  const [initialQuery, setInitialQuery] = useState("");
  const [focusKey, setFocusKey] = useState(0);
  const queryRef = useRef("");
  const caseSensitiveRef = useRef(false);

  const getPmView = useCallback(() => {
    const ctx = getMilkdownCtx();
    if (!ctx) return null;
    try {
      return ctx.get(editorViewCtx);
    } catch {
      return null;
    }
  }, [getMilkdownCtx]);

  const getCmView = useCallback(() => {
    return editorRef.current?.getCodeMirrorView?.() ?? null;
  }, [editorRef]);

  const getSelectedText = useCallback((): string => {
    if (sourceMode) {
      const cmView = getCmView();
      if (!cmView) return "";
      const { from, to } = cmView.state.selection.main;
      return from !== to ? cmView.state.sliceDoc(from, to) : "";
    }
    const view = getPmView();
    if (!view) return "";
    const { from, to } = view.state.selection;
    if (from === to) return "";
    return view.state.doc.textBetween(from, to);
  }, [sourceMode, getCmView, getPmView]);

  const handleQueryChange = useCallback(
    (query: string) => {
      queryRef.current = query;
      if (sourceMode) {
        const cmView = getCmView();
        if (!cmView) return;
        const sq = new SearchQuery({
          search: query,
          caseSensitive: caseSensitiveRef.current,
        });
        cmView.dispatch({ effects: cmSetSearchQuery.of(sq) });
        const info = countCmMatches(cmView);
        setSearchInfo((prev) => ({ ...prev, ...info }));
      } else {
        const ctx = getMilkdownCtx();
        if (!ctx) return;
        const view = ctx.get(editorViewCtx);
        view.dispatch(pmSetSearchQuery(view.state, query));
        syncPmSearchInfo(ctx, setSearchInfo);
      }
    },
    [sourceMode, getCmView, getMilkdownCtx]
  );

  const navigateMatch = useCallback(
    (
      pmCommand: (
        state: import("@milkdown/kit/prose/state").EditorState
      ) => import("@milkdown/kit/prose/state").Transaction,
      cmCommand: (view: CMEditorView) => boolean
    ) => {
      if (sourceMode) {
        const cmView = getCmView();
        if (!cmView) return;
        cmCommand(cmView);
        setSearchInfo((prev) => ({ ...prev, ...countCmMatches(cmView) }));
      } else {
        const ctx = getMilkdownCtx();
        if (!ctx) return;
        const view = ctx.get(editorViewCtx);
        view.dispatch(pmCommand(view.state));
        scrollActiveMatchIntoView(view);
        syncPmSearchInfo(ctx, setSearchInfo);
      }
    },
    [sourceMode, getCmView, getMilkdownCtx]
  );

  const handleNext = useCallback(() => navigateMatch(pmNextMatch, cmFindNext), [navigateMatch]);
  const handlePrev = useCallback(() => navigateMatch(pmPrevMatch, cmFindPrevious), [navigateMatch]);

  const handleToggleCaseSensitive = useCallback(() => {
    const newValue = !caseSensitiveRef.current;
    caseSensitiveRef.current = newValue;
    if (sourceMode) {
      const cmView = getCmView();
      if (!cmView) return;
      const sq = new SearchQuery({
        search: queryRef.current,
        caseSensitive: newValue,
      });
      cmView.dispatch({ effects: cmSetSearchQuery.of(sq) });
      const info = countCmMatches(cmView);
      setSearchInfo({ ...info, caseSensitive: newValue });
    } else {
      const ctx = getMilkdownCtx();
      if (!ctx) return;
      const view = ctx.get(editorViewCtx);
      view.dispatch(pmSetCaseSensitive(view.state, newValue));
      syncPmSearchInfo(ctx, setSearchInfo);
    }
  }, [sourceMode, getCmView, getMilkdownCtx]);

  const openSearch = useCallback(() => {
    const selected = getSelectedText();
    if (selected) {
      queryRef.current = selected;
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
    if (sourceMode) {
      const cmView = getCmView();
      if (cmView) {
        const sq = new SearchQuery({ search: "" });
        cmView.dispatch({ effects: cmSetSearchQuery.of(sq) });
      }
    } else {
      const ctx = getMilkdownCtx();
      if (ctx) {
        const view = ctx.get(editorViewCtx);
        view.dispatch(pmClearSearch(view.state));
        view.focus();
      }
    }
    setSearchInfo({
      matchCount: 0,
      activeIndex: -1,
      caseSensitive: caseSensitiveRef.current,
    });
    queryRef.current = "";
  }, [sourceMode, getCmView, getMilkdownCtx]);

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
