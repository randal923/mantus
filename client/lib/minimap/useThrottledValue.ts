import { useEffect, useRef, useState } from "react";

/**
 * Passes value changes through at most once per interval, always settling on
 * the latest value (trailing edge), so update bursts coalesce without the
 * consumer ever staying stale.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (Object.is(value, throttled)) return;
    const elapsed = Date.now() - lastUpdateRef.current;
    const timer = window.setTimeout(
      () => {
        lastUpdateRef.current = Date.now();
        setThrottled(value);
      },
      Math.min(intervalMs, Math.max(0, intervalMs - elapsed)),
    );
    return () => window.clearTimeout(timer);
  }, [value, intervalMs, throttled]);

  return throttled;
}
