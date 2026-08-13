import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Ref that always holds the latest value — for timers and event listeners
 * that must read current props without re-subscribing on every change.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
