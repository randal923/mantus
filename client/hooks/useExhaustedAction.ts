"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Runs an action no more often than `intervalMs`, holding an early call back
 * until the window clears instead of dropping it.
 *
 * The server owns the real exhaust; this only stops the client from sending an
 * intent it already knows will be refused, so spam-clicking Buy reads as a
 * steady stream of purchases rather than a run of red errors. At most one call
 * is ever held: a burst of clicks becomes one more purchase, not a queue that
 * keeps firing after the player stops.
 */
export function useExhaustedAction(
  intervalMs: number,
): (action: () => void) => void {
  const readyAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (action: () => void) => {
      const now = Date.now();
      if (now >= readyAt.current) {
        readyAt.current = now + intervalMs;
        action();
        return;
      }
      // A call is already held for the end of this window; the newest click
      // replaces it rather than stacking another.
      if (timer.current !== null) clearTimeout(timer.current);
      const delay = readyAt.current - now;
      timer.current = setTimeout(() => {
        timer.current = null;
        readyAt.current = Date.now() + intervalMs;
        action();
      }, delay);
    },
    [intervalMs],
  );
}
