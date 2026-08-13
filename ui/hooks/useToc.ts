import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { EditorView } from "@codemirror/view";
import type { EditorHandle } from "../types/editor";
import type { TocHeading } from "../types/toc";
import { activeHeadingIndex, extractHeadings, headingsEqual } from "../toc/extract";
import { useEditorView } from "./useEditorView";

const EXTRACT_DEBOUNCE_MS = 200;

interface UseTocOptions {
  editorRef: RefObject<EditorHandle | null>;
  /** Effects re-key on this: Cmd+M destroys one EditorView and builds the other. */
  sourceMode: boolean;
  /** Bumped when the shell replaces the document (open/reload), never on keystrokes or saves. */
  docVersion: number;
  /** Sidebar visible with the outline tab active. Gates all extraction and listeners. */
  enabled: boolean;
}

interface UseTocResult {
  headings: TocHeading[];
  activeIndex: number;
  navigateToHeading: (heading: TocHeading) => void;
  notifyDocChanged: () => void;
}

export function useToc({
  editorRef,
  sourceMode,
  docVersion,
  enabled,
}: UseTocOptions): UseTocResult {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const headingsRef = useRef<TocHeading[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const getView = useEditorView(editorRef);

  const computeActive = useCallback(() => {
    const view = getView();
    const current = headingsRef.current;
    if (!view || current.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const scroller = view.scrollDOM;
    // Bottom rule: sections too short to ever reach the top edge still highlight.
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      setActiveIndex(current.length - 1);
      return;
    }
    // Reading line 20% down the viewport, translated into height-map
    // (document) coordinates. lineBlockAtHeight works from height estimates,
    // so it resolves positions outside the rendered viewport where coordsAtPos
    // returns null. The 20% offset keeps a just-clicked heading (parked
    // yMargin px below the top by navigateToHeading) counted as active.
    const probeY =
      scroller.getBoundingClientRect().top - view.documentTop + scroller.clientHeight * 0.2;
    const probeBlock = view.lineBlockAtHeight(probeY);
    setActiveIndex(activeHeadingIndex(current, probeBlock.from));
  }, [getView]);

  const extractNow = useCallback(() => {
    const view = getView();
    if (!view) return;
    const next = extractHeadings(view.state.doc.toString());
    if (!headingsEqual(headingsRef.current, next)) {
      // Keep the ref fresh synchronously so the rAF scroll handler never
      // reads positions React hasn't committed yet.
      headingsRef.current = next;
      setHeadings(next);
    }
    computeActive();
  }, [getView, computeActive]);

  // Keystrokes: debounced re-extract from the live document. docVersion only
  // changes on open/reload, so it can't drive this.
  const notifyDocChanged = useCallback(() => {
    if (!enabled) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(extractNow, EXTRACT_DEBOUNCE_MS);
  }, [enabled, extractNow]);

  // Open/reload and tab enable: extract immediately. view.setState on file
  // open fires no update listener, so onChange never covers this path.
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing headings from the editor document (external system); headingsEqual prevents cascading updates
    extractNow();
  }, [enabled, sourceMode, docVersion, extractNow]);

  // Cleanup-only: clears the pending extract on disable and unmount.
  useEffect(() => () => clearTimeout(debounceRef.current), [enabled]);

  // Scroll-spy. Child effects run before parent effects, so after a Cmd+M
  // swap the newly mounted editor's view already exists when this re-keys.
  useEffect(() => {
    if (!enabled) return;
    const view = getView();
    if (!view) return;
    const scroller = view.scrollDOM;
    let rafId = 0;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeActive);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [enabled, sourceMode, getView, computeActive]);

  const navigateToHeading = useCallback(
    (heading: TocHeading) => {
      const view = getView();
      if (!view) return;
      // The list can be up to one debounce interval stale.
      const pos = Math.min(heading.pos, view.state.doc.length);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start", yMargin: 50 }),
      });
      view.focus();
    },
    [getView]
  );

  return { headings, activeIndex, navigateToHeading, notifyDocChanged };
}
