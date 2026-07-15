import type { ButtonHTMLAttributes } from "react";

interface CloseButtonProps
  extends Pick<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "className" | "disabled" | "onClick"
  > {
  label: string;
}

export function CloseButton({
  label,
  className,
  ...buttonProps
}: CloseButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-ui-gold/15 bg-white/5 text-ui-muted outline-none transition-[color,background-color,border-color,transform] duration-150 hover:border-ui-accent-light/45 hover:bg-ui-accent/20 hover:text-red-100 active:scale-95 focus-visible:ring-2 focus-visible:ring-ui-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ui-panel-deep disabled:pointer-events-none disabled:opacity-40 ${className ?? ""}`}
      {...buttonProps}
    >
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="m5 5 10 10M15 5 5 15" />
      </svg>
    </button>
  );
}
