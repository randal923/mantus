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
  "ui-button group inline-flex size-10 shrink-0 items-center justify-center rounded-md border text-ui-muted outline-none transition-[color,border-color,filter,transform] duration-150 hover:-translate-y-px hover:text-ui-text hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:pointer-events-none disabled:opacity-30 disabled:hover:translate-y-0 sm:size-11 lg:h-10 lg:w-auto lg:gap-2 lg:px-3";

const INACTIVE_BUTTON_CLASS =
  "ui-button-secondary border-ui-stone-light/15 hover:border-ui-gold/40";

const ACTIVE_BUTTON_CLASS =
  "ui-button-primary border-ui-accent-light/50 text-ui-text-bright";

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
      className={`${BUTTON_CLASS} ${active ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS}`}
      {...buttonProps}
    >
      {children}
      <span className="hidden font-button text-xs font-normal tracking-wide uppercase lg:inline">
        {label}
      </span>
    </button>
  );
}
