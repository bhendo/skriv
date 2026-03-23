import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { DecorationSet } from "@milkdown/kit/prose/view";

interface DecoPluginState {
  decorations: DecorationSet;
  cacheKey: unknown;
}

interface DecoPluginOptions {
  /** Rebuild decorations when the selection changes (default: false — only on docChanged). */
  rebuildOnSelection?: boolean;
  /** Return a cache key derived from state. When provided and !docChanged, the
   *  build function is skipped if the cache key matches the previous value. */
  cacheKey?: (state: EditorState) => unknown;
}

/**
 * Factory for ProseMirror plugins whose sole purpose is maintaining a
 * DecorationSet.  Eliminates the repeated init/apply/decorations boilerplate.
 */
export function makeDecorationPlugin(
  name: string,
  build: (state: EditorState) => DecorationSet,
  opts?: DecoPluginOptions
): Plugin<DecoPluginState> {
  const key = new PluginKey<DecoPluginState>(name);
  const rebuildOnSelection = opts?.rebuildOnSelection ?? false;
  const getCacheKey = opts?.cacheKey;

  function buildState(state: EditorState): DecoPluginState {
    return {
      decorations: build(state),
      cacheKey: getCacheKey?.(state) ?? null,
    };
  }

  return new Plugin<DecoPluginState>({
    key,
    state: {
      init(_, state) {
        return buildState(state);
      },
      apply(tr, old, _oldState, newState) {
        if (!tr.docChanged && !(rebuildOnSelection && tr.selectionSet)) return old;
        if (getCacheKey && !tr.docChanged) {
          const newCacheKey = getCacheKey(newState);
          if (newCacheKey === old.cacheKey) return old;
        }
        return buildState(newState);
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
}
