import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label
      className={`flex flex-col gap-2 has-disabled:pointer-events-none has-disabled:opacity-45 ${className ?? ""}`}
    >
      {label && (
        <span className="font-display text-xs font-semibold tracking-[0.18em] text-ui-gold uppercase">
          {label}
        </span>
      )}
      <input
        className="h-11 w-full rounded-lg border border-ui-stone/50 bg-black/40 px-3.5 font-tibia text-sm text-ui-text shadow-inner shadow-black/35 outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ui-muted/55 hover:border-ui-stone-light/45 focus:border-ui-gold/60 focus:bg-black/55 focus:ring-2 focus:ring-ui-gold/15"
        {...props}
      />
    </label>
  );
}
