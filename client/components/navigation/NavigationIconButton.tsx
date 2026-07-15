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
  "group relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-ui-text/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:-translate-y-0.5 hover:border-ui-accent/60 hover:bg-ui-accent/10 hover:text-ui-text hover:shadow-[0_0_18px_rgba(70,164,157,0.16)] disabled:pointer-events-none disabled:opacity-35 sm:size-11";

const ACTIVE_BUTTON_CLASS =
  "border-ui-accent/70 bg-ui-accent/15 text-ui-accent shadow-[0_0_20px_rgba(70,164,157,0.2),inset_0_0_12px_rgba(70,164,157,0.08)] after:absolute after:-bottom-2.5 after:h-0.5 after:w-5 after:rounded-full after:bg-ui-accent after:shadow-[0_0_8px_rgba(70,164,157,0.9)]";

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
    </button>
  );
}
