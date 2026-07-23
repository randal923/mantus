"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface NavigationIconButtonProps extends Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "onClick"
> {
  label: string;
  hotkey?: string;
  active?: boolean;
  children: ReactNode;
}

const BUTTON_CLASS =
  "ui-button group inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-ui-muted outline-none transition-[color,border-color,filter,transform] duration-150 hover:-translate-y-px hover:text-ui-text hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0 disabled:hover:text-ui-muted disabled:hover:brightness-100";

const INACTIVE_BUTTON_CLASS =
  "ui-button-secondary border-ui-stone-light/15 hover:border-ui-gold/40";

const ACTIVE_BUTTON_CLASS =
  "ui-button-primary border-ui-accent-light/50 text-ui-text-bright";

export function NavigationIconButton({
  label,
  hotkey,
  active,
  children,
  ...buttonProps
}: NavigationIconButtonProps) {
  const title = hotkey ? `${label} [${hotkey}]` : label;
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      className={`${BUTTON_CLASS} ${active ? ACTIVE_BUTTON_CLASS : INACTIVE_BUTTON_CLASS}`}
      {...buttonProps}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute top-full right-0 z-50 mt-2 translate-y-1 whitespace-nowrap rounded border border-ui-gold/25 bg-ui-panel-deep px-2 py-1 font-button text-sm font-normal tracking-wide text-ui-text-bright uppercase opacity-0 shadow-lg transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        {title}
      </span>
    </button>
  );
}
