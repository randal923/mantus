"use client";

import type { ReactNode } from "react";
import { HoverTooltip } from "../ui/HoverTooltip";

interface StatDetailRowProps {
  label: string;
  /** The effective value, already including any bonus. */
  value: string;
  /**
   * Signed equipment contribution. Zero renders a plain row; anything else
   * tints the value and arms the hover breakdown.
   */
  bonus?: number;
  tooltip?: ReactNode;
}

/**
 * One `<dt>`/`<dd>` pair of the details list. A stat carrying an equipment
 * bonus is tinted green (or red when gear is a net penalty) and explains
 * itself on hover.
 */
export function StatDetailRow({
  label,
  value,
  bonus = 0,
  tooltip,
}: StatDetailRowProps) {
  const valueClassName =
    bonus > 0
      ? "text-emerald-400"
      : bonus < 0
        ? "text-red-400"
        : "text-ui-text";

  return (
    <>
      <dt className="text-ui-muted">{label}</dt>
      <dd
        className={`text-right font-semibold tabular-nums ${valueClassName}`}
      >
        {tooltip ? (
          <HoverTooltip content={tooltip} align="end" className="inline-block">
            <span>{value}</span>
          </HoverTooltip>
        ) : (
          value
        )}
      </dd>
    </>
  );
}
