"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface NavigationIconButtonProps
  extends Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "disabled" | "onClick"
  > {
  label: string;
  active?: boolean;
  children: ReactNode;
}

const BUTTON_CLASS =
  "group inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-ui-muted outline-none transition-[color,background-color,border-color] duration-150 hover:border-ui-gold/15 hover:bg-white/5 hover:text-ui-text focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-30 sm:size-11 lg:h-10 lg:w-auto lg:gap-2 lg:px-3";

const ACTIVE_BUTTON_CLASS =
  "border-ui-accent-light/30 bg-ui-accent/20 text-ui-text-bright shadow-sm shadow-ui-accent-deep/20";

export function NavigationIconButton({
  label,
  active,
  children,
  ...buttonProps
}: NavigationIconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`${BUTTON_CLASS} ${active ? ACTIVE_BUTTON_CLASS : ""}`}
      {...buttonProps}
    >
      {children}
      <span className="hidden font-display text-[10px] font-semibold tracking-wider uppercase lg:inline">
        {label}
      </span>
    </button>
  );
}
