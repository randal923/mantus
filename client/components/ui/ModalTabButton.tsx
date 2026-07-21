"use client";

import type { ReactNode } from "react";

interface ModalTabButtonProps {
  label: string;
  selected: boolean;
  icon?: ReactNode;
  onClick: () => void;
}

export function ModalTabButton({
  label,
  selected,
  icon,
  onClick,
}: ModalTabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={`ui-button flex min-h-16 flex-1 items-center justify-center gap-3 rounded-md border px-3 font-display text-xs font-bold tracking-wider uppercase transition-[color,border-color,filter] sm:text-sm ${
        selected
          ? "ui-button-primary border-ui-accent-light/50 text-ui-text-bright"
          : "ui-button-secondary border-ui-stone-light/15 text-ui-muted hover:border-ui-gold/40 hover:text-ui-text"
      }`}
    >
      {icon && <span className="text-ui-gold">{icon}</span>}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
