import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-display text-xs font-semibold tracking-[0.12em] uppercase outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ui-panel-deep disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "border-ui-accent-light/40 bg-ui-accent/90 text-ui-text-bright shadow-md shadow-ui-accent-deep/20 hover:border-ui-accent-light/70 hover:bg-ui-accent-light/90",
  secondary:
    "border-ui-gold/20 bg-white/5 text-ui-text shadow-sm shadow-black/20 hover:border-ui-gold/40 hover:bg-white/10 hover:text-ui-text-bright",
  danger:
    "border-ui-accent/45 bg-ui-accent-deep/55 text-ui-accent-light shadow-sm shadow-black/20 hover:border-ui-accent-light/60 hover:bg-ui-accent/30 hover:text-ui-text-bright",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
