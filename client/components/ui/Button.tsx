import type { ButtonHTMLAttributes } from "react";
import {
  BUTTON_BASE_CLASS,
  BUTTON_BUSY_CLASS,
  BUTTON_DISABLED_CLASS,
  BUTTON_SIZE_CLASS,
  BUTTON_VARIANT_CLASS,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";
import { Spinner } from "./Spinner";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner before the label and blocks input without fading the button. */
  busy?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE_CLASS} ${busy ? BUTTON_BUSY_CLASS : BUTTON_DISABLED_CLASS} ${BUTTON_VARIANT_CLASS[variant]} ${BUTTON_SIZE_CLASS[size]} ${className ?? ""}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy && <Spinner className="size-4" />}
      {children}
    </button>
  );
}
