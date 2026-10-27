import { useRef, useCallback } from "react";

/**
 * Prevents double-tap by ignoring presses within `delayMs` of the last press.
 */
export function useGuardedPress(fn: (...args: any[]) => void | Promise<void>, delayMs = 400) {
  const busy = useRef(false);

  return useCallback(async (...args: any[]) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn(...args);
    } finally {
      setTimeout(() => {
        busy.current = false;
      }, delayMs);
    }
  }, [fn, delayMs]);
}