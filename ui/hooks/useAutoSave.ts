import { useCallback, useEffect, useRef } from "react";
import { loadAutoSavePref } from "../utils/autoSavePref";
import { useLatestRef } from "./useLatestRef";

/** Fixed by design (#2): only the on/off choice is exposed to users. */
export const AUTO_SAVE_DEBOUNCE_MS = 1000;

interface UseAutoSaveOptions {
  /** Untitled documents never auto-save — a save would open the Save As dialog. */
  hasPath: boolean;
  isModified: boolean;
  /** Resolves true when the save actually happened. */
  onSave: () => Promise<boolean>;
}

/**
 * Debounced auto-save: schedules a save AUTO_SAVE_DEBOUNCE_MS after the last
 * edit (each edit restarts the clock via notifyChange), plus an immediate
 * save when the window loses focus. All eligibility checks live in the
 * fire path and read live state (preference, path, dirtiness), so toggling
 * Auto Save off also defuses an already-pending timer.
 *
 * shouldAutoSave is the one activation predicate (preference on + document
 * has a path); useWindowClose consumes it too, so the rule lives here only.
 */
export function useAutoSave({ hasPath, isModified, onSave }: UseAutoSaveOptions): {
  notifyChange: () => void;
  shouldAutoSave: () => boolean;
} {
  const hasPathRef = useLatestRef(hasPath);
  const isModifiedRef = useLatestRef(isModified);
  const onSaveRef = useLatestRef(onSave);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);

  const shouldAutoSave = useCallback(() => loadAutoSavePref() && hasPathRef.current, [hasPathRef]);

  const fire = useCallback(async () => {
    if (!shouldAutoSave() || !isModifiedRef.current) return;
    if (savingRef.current) {
      // A save is already in flight; concurrent writes to the same path can
      // land out of order. Try again after another interval.
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(fire, AUTO_SAVE_DEBOUNCE_MS);
      return;
    }
    savingRef.current = true;
    try {
      await onSaveRef.current();
    } finally {
      savingRef.current = false;
    }
  }, [shouldAutoSave, isModifiedRef, onSaveRef]);

  const notifyChange = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(fire, AUTO_SAVE_DEBOUNCE_MS);
  }, [fire]);

  // Losing window focus saves immediately: the debounce exists to batch
  // keystrokes, and there are none coming while the window is inactive.
  useEffect(() => {
    const onBlur = () => {
      clearTimeout(timerRef.current);
      void fire();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [fire]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { notifyChange, shouldAutoSave };
}
