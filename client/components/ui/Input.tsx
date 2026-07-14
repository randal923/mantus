import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className, ...props }: InputProps) {
  return (
    <label
      className={`flex flex-col gap-1 has-disabled:pointer-events-none has-disabled:opacity-50 ${className ?? ""}`}
    >
      {label && (
        <span className="font-tibia ml-1 font-semibold text-xs uppercase tracking-wider text-white">
          {label}
        </span>
      )}
      <input
        className="h-11 w-full rounded-md border border-ui-stone/40 bg-black/50 px-3 font-tibia text-sm text-ui-text shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)] outline-none transition-colors placeholder:text-ui-text/40 hover:border-ui-stone/70 focus:border-ui-accent/80 focus:ring-2 focus:ring-ui-accent/25"
        {...props}
      />
    </label>
  );
}
