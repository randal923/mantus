"use client";

import type { ReactNode } from "react";
import { getProgressPercent } from "../../lib/inventory/getProgressPercent";
import { HoverTooltip } from "../ui/HoverTooltip";

interface ProgressionBarProps {
  label: string;
  /** Server-computed delta from gear/wheel/conditions, e.g. "+2" or "-3". */
  boost?: string;
  /** Breakdown shown when hovering the boost chip. */
  boostTooltip?: ReactNode;
  value: number;
  max: number;
  valueLabel: string;
  /**
   * Signed delta behind `valueLabel`. Non-zero tints the value, so the number
   * on the right is the effective one the server uses, not the trained base.
   */
  valueBonus?: number;
  fillClassName?: string;
}

export function ProgressionBar({
  label,
  boost,
  boostTooltip,
  value,
  max,
  valueLabel,
  valueBonus = 0,
  fillClassName = "from-ui-gold to-ui-gold/65",
}: ProgressionBarProps) {
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
          {boost &&
            (boostTooltip ? (
              <HoverTooltip
                content={boostTooltip}
                align="start"
                className="ml-1.5 inline-block"
              >
                <span
                  className={`font-semibold ${
                    boost.startsWith("-") ? "text-red-400" : "text-emerald-400"
                  }`}
                >
                  ({boost})
                </span>
              </HoverTooltip>
            ) : (
              <span
                className={`ml-1.5 font-semibold ${
                  boost.startsWith("-") ? "text-red-400" : "text-emerald-400"
                }`}
              >
                ({boost})
              </span>
            ))}
        </span>
        <span
          className={`truncate font-semibold tabular-nums ${
            valueBonus > 0
              ? "text-emerald-400"
              : valueBonus < 0
                ? "text-red-400"
                : "text-ui-text"
          }`}
        >
          {valueLabel}
        </span>
      </div>
      {/* Padding widens the hover target well past the 8px-tall bar. */}
      <HoverTooltip content={remainingLabel} className="-my-1 py-1">
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
      </HoverTooltip>
    </div>
  );
}
