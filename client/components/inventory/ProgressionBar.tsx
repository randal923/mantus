"use client";

import { useState } from "react";
import { getProgressPercent } from "../../lib/inventory/getProgressPercent";

const TOOLTIP_CLASS =
  "pointer-events-none absolute bottom-full z-50 mb-1 -translate-x-1/2 rounded border border-ui-gold/25 bg-ui-panel-deep px-2 py-0.5 font-button text-xs font-normal tracking-wide whitespace-nowrap text-ui-text-bright shadow-lg";

/** Half the widest percentage chip; keeps it from spilling out of the row. */
const TOOLTIP_MARGIN = 24;

interface ProgressionBarProps {
  label: string;
  /** Server-computed temporary delta (wheel/conditions), e.g. "+2" or "-3". */
  boost?: string;
  value: number;
  max: number;
  valueLabel: string;
  fillClassName?: string;
}

export function ProgressionBar({
  label,
  boost,
  value,
  max,
  valueLabel,
  fillClassName = "from-ui-gold to-ui-gold/65",
}: ProgressionBarProps) {
  const [tooltipX, setTooltipX] = useState<number | null>(null);
  const boundedMax = Math.max(0, max);
  const boundedValue = Math.min(Math.max(0, value), boundedMax);
  const percent =
    boundedMax > 0 ? Math.min(100, (boundedValue / boundedMax) * 100) : 100;
  /** What is still missing for the next level, not what is already done. */
  const remainingLabel = `${100 - getProgressPercent(value, max)}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-display tracking-wider text-ui-muted uppercase">
          {label}
          {boost && (
            <span
              className={`ml-1.5 font-semibold ${
                boost.startsWith("-") ? "text-red-400" : "text-emerald-400"
              }`}
            >
              ({boost})
            </span>
          )}
        </span>
        <span className="truncate font-semibold tabular-nums text-ui-text">
          {valueLabel}
        </span>
      </div>
      {/* Padding widens the hover target well past the 8px-tall bar. */}
      <div
        className="relative -my-1 py-1"
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          setTooltipX(
            Math.min(
              Math.max(event.clientX - bounds.left, TOOLTIP_MARGIN),
              bounds.width - TOOLTIP_MARGIN,
            ),
          );
        }}
        onPointerLeave={() => setTooltipX(null)}
      >
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={boundedMax}
          aria-valuenow={boundedValue}
          className="h-2 overflow-hidden rounded-full border border-black/70 bg-black/60 shadow-inner shadow-black/70"
        >
          <div
            className={`h-full rounded-full bg-linear-to-r transition-[width] duration-300 ${fillClassName}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {tooltipX !== null && (
          <span aria-hidden className={TOOLTIP_CLASS} style={{ left: tooltipX }}>
            {remainingLabel}
          </span>
        )}
      </div>
    </div>
  );
}
