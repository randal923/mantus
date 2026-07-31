"use client";

import type { ReactNode } from "react";

interface ImbuementRailButtonProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  disabled?: boolean;
  /** Rendered as a corner count, e.g. how many blank scrolls are held. */
  badge?: number;
  onClick: () => void;
}

/**
 * One of the two mode buttons down the left of Tibia's imbuing window: imbue
 * a carried item, or forge a blank scroll.
 */
export function ImbuementRailButton({
  label,
  icon,
  active,
  disabled,
  badge,
  onClick,
}: ImbuementRailButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={label}
      className={`relative flex w-full flex-col items-center gap-1.5 rounded-sm border px-2 py-3 transition-colors ${
        active
          ? "border-ui-gold/60 bg-ui-gold/10"
          : "border-ui-stone-light/15 bg-black/30 hover:border-ui-stone-light/40"
      } disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ui-stone-light/15`}
    >
      {icon}
      <span className="text-center text-sm leading-tight text-ui-text">
        {label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-1 right-1 rounded-sm border border-ui-gold/40 bg-black/70 px-1 text-sm tabular-nums text-ui-gold">
          {badge}
        </span>
      )}
    </button>
  );
}
