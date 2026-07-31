"use client";

import { useCallback, useState } from "react";

/**
 * Tracks the rendered width of an element, updating on resize. Returns a
 * callback ref to attach and the last measured width (0 before first paint).
 */
export function useMeasuredWidth(): [
  (node: HTMLElement | null) => void,
  number,
] {
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
