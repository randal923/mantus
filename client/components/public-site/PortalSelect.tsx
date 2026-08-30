"use client";

interface PortalSelectOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

interface PortalSelectProps<Value extends string> {
  readonly ariaLabel: string;
  readonly value: Value;
  readonly options: ReadonlyArray<PortalSelectOption<Value>>;
  readonly onChange: (value: Value) => void;
  readonly label?: string;
  readonly className?: string;
}

/** Flat dark select for public-site filters (Mantus landing design). */
export function PortalSelect<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  label,
  className,
}: PortalSelectProps<Value>) {
  return (
    <label className={`flex min-w-0 flex-col gap-2.5 ${className ?? ""}`}>
      {label && (
        <span className="font-display text-[0.6875rem] tracking-[0.22em] text-[#6e6a66] uppercase">
          {label}
        </span>
      )}
      <span className="relative block min-w-0">
        <select
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => {
            const option = options.find(
              ({ value: optionValue }) =>
                optionValue === event.currentTarget.value,
            );
            if (!option) return;
            onChange(option.value);
          }}
          className="h-10 w-full appearance-none truncate rounded-md border border-white/10 bg-[#0a0a0a] py-2 pr-9 pl-3 text-sm text-ui-text outline-none transition-colors hover:border-white/25 focus:border-white/25"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[0.625rem] text-[#6e6a66]"
        >
          ▼
        </span>
      </span>
    </label>
  );
}
