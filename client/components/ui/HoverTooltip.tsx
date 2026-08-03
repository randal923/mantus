"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clippingAncestor } from "../../lib/ui/clippingAncestor";
import { fitsBelow } from "../../lib/ui/fitsBelow";

// `normal-case` because label rows are uppercased and the bubble must not
// inherit that; it carries values, not headings.
const TOOLTIP_CLASS =
  "pointer-events-none absolute z-50 w-max rounded border border-ui-gold/25 bg-ui-panel-deep px-3 py-1.5 font-button text-sm font-normal normal-case tracking-wide text-ui-text-bright shadow-lg";

/** Half the widest chip; keeps a pointer-anchored bubble inside its row. */
const TOOLTIP_MARGIN = 24;

/** Breathing room between the bubble and the edge it is being kept inside. */
const EDGE_GAP = 6;

interface Fit {
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
}

const NO_FIT: Fit = { x: 0, y: 0, below: false };

/**
 * How far to move a span to bring it inside `[min, max]`. Leading edge wins
 * when the span is larger than the gap, so the start stays readable.
 */
function nudge(
  start: number,
  end: number,
  min: number,
  max: number,
): number {
  if (start < min + EDGE_GAP) return Math.round(min + EDGE_GAP - start);
  if (end > max - EDGE_GAP) {
    return Math.round(Math.max(max - EDGE_GAP - end, min + EDGE_GAP - start));
  }
  return 0;
}

interface HoverTooltipProps {
  /** Bubble contents. A string stays on one line; nodes lay out freely. */
  content: ReactNode;
  /** The hover target. */
  children: ReactNode;
  className?: string;
  /**
   * Where the bubble starts before it is fitted: `pointer` centres it on the
   * cursor (right for a wide target like a progress bar), `start`/`end` pin it
   * to the target's left/right edge. Whatever the choice, the bubble is then
   * nudged sideways and flipped below the target as needed to stay inside the
   * nearest clipping ancestor.
   */
  align?: "pointer" | "start" | "end";
}

export function HoverTooltip({
  content,
  children,
  className,
  align = "pointer",
}: HoverTooltipProps) {
  const [tooltipX, setTooltipX] = useState<number | null>(null);
  const [fit, setFit] = useState(NO_FIT);
  const fitRef = useRef(fit);
  const hostRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);

  // Measure before paint so the bubble never appears in the wrong place and
  // then jumps. Both corrections are derived from geometry that does not
  // depend on the correction itself — the unshifted edges and the *target's*
  // top — so applying one cannot flip the answer back and oscillate.
  useLayoutEffect(() => {
    const settle = (next: Fit) => {
      const current = fitRef.current;
      if (next.x === current.x && next.y === current.y && next.below === current.below) {
        return;
      }
      fitRef.current = next;
      setFit(next);
    };
    if (tooltipX === null) {
      settle(NO_FIT);
      return;
    }
    const bubble = bubbleRef.current;
    const host = hostRef.current;
    const bounds = clippingAncestor(host)?.getBoundingClientRect();
    if (!bubble || !host || !bounds) return;
    const box = bubble.getBoundingClientRect();
    const applied = fitRef.current;
    settle({
      // Rounded: sub-pixel rects would otherwise never compare equal, and the
      // settle guard is what stops the measure/apply cycle. Both axes correct
      // the *unshifted* edges, so a correction cannot feed back on itself.
      x: nudge(box.left - applied.x, box.right - applied.x, bounds.left, bounds.right),
      y: nudge(box.top - applied.y, box.bottom - applied.y, bounds.top, bounds.bottom),
      below: fitsBelow(host.getBoundingClientRect(), box.height, bounds),
    });
  }, [tooltipX]);

  return (
    <div
      ref={hostRef}
      className={`relative ${className ?? ""}`}
      onPointerMove={(event) => {
        if (align !== "pointer") {
          setTooltipX(0);
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        setTooltipX(
          Math.min(
            Math.max(event.clientX - bounds.left, TOOLTIP_MARGIN),
            Math.max(bounds.width - TOOLTIP_MARGIN, TOOLTIP_MARGIN),
          ),
        );
      }}
      onPointerLeave={() => setTooltipX(null)}
    >
      {children}
      {tooltipX !== null && (
        <span
          ref={bubbleRef}
          aria-hidden
          className={`${TOOLTIP_CLASS} ${
            fit.below ? "top-full mt-1" : "bottom-full mb-1"
          } ${
            align === "end"
              ? "right-0"
              : align === "start"
                ? "left-0"
                : "-translate-x-1/2"
          }`}
          style={{
            ...(align === "pointer" ? { left: tooltipX } : {}),
            ...(fit.x !== 0 || fit.y !== 0
              ? { translate: `${fit.x}px ${fit.y}px` }
              : {}),
          }}
        >
          {content}
        </span>
      )}
    </div>
  );
}
