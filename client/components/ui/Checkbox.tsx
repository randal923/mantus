import type { InputHTMLAttributes, ReactNode } from "react";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  readonly label?: ReactNode;
  readonly className?: string;
}

export function Checkbox({
  label,
  className,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-3 has-disabled:cursor-not-allowed has-disabled:opacity-45 ${className ?? ""}`}
    >
      <input
        {...props}
        type="checkbox"
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-ui-stone-light/35 bg-gradient-to-b from-white/10 to-black/30 text-xl font-bold text-transparent shadow-inner shadow-black/40 transition-[border-color,box-shadow,color,filter] peer-checked:border-ui-gold/70 peer-checked:bg-ui-gold-deep peer-checked:text-ui-gold peer-checked:shadow-md peer-checked:shadow-ui-gold/20 peer-focus-visible:ring-2 peer-focus-visible:ring-ui-gold/60 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-ui-panel-deep hover:border-ui-gold/50"
      >
        ✓
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
