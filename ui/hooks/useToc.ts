import { useState, useEffect, useCallback, useRef } from "react";
import type { RefObject } from "react";
import { editorViewCtx } from "@milkdown/core";
import { EditorView as CMEditorView } from "@codemirror/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorHandle } from "../types/editor";
import type { TocHeading } from "../types/toc";
import { extractHeadingsFromPM } from "../toc/extract-pm";
import { extractHeadingsFromText } from "../toc/extract-cm";

interface UseTocOptions {
  editorRef: RefObject<EditorHandle | null>;
  sourceMode: boolean;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

interface UseTocResult {
  headings: TocHeading[];
  activeIndex: number;
  scrollToHeading: (pos: number) => void;
}

export function useToc({ editorRef, sourceMode, scrollContainerRef }: UseTocOptions): UseTocResult {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const headingsRef = useRef<TocHeading[]>([]);

  useEffect(() => {
    headingsRef.current = headings;
  }, [headings]);

  // ── Heading extraction ──────────────────────────
  useEffect(() => {
    if (sourceMode) {
      // CodeMirror: poll for doc changes
      const interval = setInterval(() => {
        const view = editorRef.current?.getCodeMirrorView?.();
        if (!view) return;
        const text = view.state.doc.toString();
        const next = extractHeadingsFromText(text);
        setHeadings((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      }, 500);
      return () => clearInterval(interval);
    } else {
      // ProseMirror: poll via ctx access
      const interval = setInterval(() => {
        const ctx = editorRef.current?.getMilkdownCtx?.();
        if (!ctx) return;
        try {
          const view = ctx.get(editorViewCtx);
          const next = extractHeadingsFromPM(view.state.doc);
          setHeadings((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
        } catch {
          // Editor not ready yet
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [sourceMode, editorRef]);

  // ── Scroll-spy ──────────────────────────────────
  // Uses coordsAtPos (CM) and ProseMirror nodeDOM (PM) to find heading
  // positions — avoids fragile DOM queries that break with virtualization
  // or UI chrome elements.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onScroll = () => {
      const threshold = container.getBoundingClientRect().top + container.clientHeight * 0.2;
      const current = headingsRef.current;
      let active = -1;

      if (sourceMode) {
        // CodeMirror: use coordsAtPos which works with virtualized rendering
        const view = editorRef.current?.getCodeMirrorView?.();
        if (!view) return;

        for (let i = 0; i < current.length; i++) {
          const coords = view.coordsAtPos(current[i].pos);
          if (!coords) continue;
          if (coords.top <= threshold) active = i;
        }
      } else {
        // ProseMirror: use the PM view to resolve each heading's pos to a
        // DOM element, avoiding reliance on querySelectorAll index matching.
        const ctx = editorRef.current?.getMilkdownCtx?.();
        if (!ctx) return;
        try {
          const view = ctx.get(editorViewCtx);
          for (let i = 0; i < current.length; i++) {
            // nodeDOM takes the before-node position from doc.descendants
            const dom = view.nodeDOM(current[i].pos);
            if (!dom || !(dom instanceof HTMLElement)) continue;
            const rect = dom.getBoundingClientRect();
            if (rect.top <= threshold) active = i;
          }
        } catch {
          // Editor not ready
        }
      }

      setActiveIndex(active);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    // Run once on mount to set initial active
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [sourceMode, scrollContainerRef, editorRef]);

  // ── Click-to-navigate ───────────────────────────
  // ProseMirror's tr.scrollIntoView() only scrolls its own DOM container,
  // not the outer App scroll div. Use DOM scrollIntoView (rAF-deferred so
  // decorations and position updates render first) instead — same pattern
  // as useSearch.ts scrollActiveMatchIntoView.
  const scrollToHeading = useCallback(
    (pos: number) => {
      if (sourceMode) {
        const view = editorRef.current?.getCodeMirrorView?.();
        if (!view) return;
        view.dispatch({
          selection: { anchor: pos },
          effects: CMEditorView.scrollIntoView(pos, { y: "start", yMargin: 50 }),
        });
        view.focus();
      } else {
        const ctx = editorRef.current?.getMilkdownCtx?.();
        if (!ctx) return;
        try {
          const view = ctx.get(editorViewCtx);
          // Move the cursor to the heading position
          view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
          view.focus();
          // Scroll the heading DOM node into view via the outer scroll container.
          // ProseMirror's tr.scrollIntoView() only scrolls its own DOM container,
          // not the outer App scroll div — use DOM scrollIntoView instead (same
          // pattern as useSearch.ts scrollActiveMatchIntoView).
          // rAF ensures the layout is stable before reading nodeDOM.
          requestAnimationFrame(() => {
            try {
              const dom = view.nodeDOM(pos);
              if (dom instanceof HTMLElement) {
                dom.scrollIntoView({ block: "start", behavior: "instant" });
              } else {
                // nodeDOM can return null for nodes not in the rendered DOM.
                // Fall back: resolve the heading text from the doc, derive its
                // id attribute, and query the element directly.
                const $pos = view.state.doc.resolve(pos + 1);
                const node = $pos.parent;
                const id = node.textContent
                  .toLowerCase()
                  .replace(/\s+/g, "-")
                  .replace(/[^\w-]/g, "");
                const el = view.dom.querySelector(
                  `h1#${id}, h2#${id}, h3#${id}, h4#${id}, h5#${id}, h6#${id}`
                ) as HTMLElement | null;
                if (el) {
                  el.scrollIntoView({ block: "start", behavior: "instant" });
                }
              }
            } catch {
              // Editor unmounted or pos invalid
            }
          });
        } catch {
          // Editor not ready
        }
      }
    },
    [sourceMode, editorRef]
  );

  return { headings, activeIndex, scrollToHeading };
}
