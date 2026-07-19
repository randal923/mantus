"use client";

import type { ReactNode } from "react";

interface MinimapControlButtonProps {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function MinimapControlButton({
  label,
  disabled,
  onClick,
  children,
}: MinimapControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center rounded-md border border-ui-gold/20 bg-black/65 text-ui-text backdrop-blur-sm transition-colors duration-150 hover:border-ui-gold/45 hover:text-ui-text-bright focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
