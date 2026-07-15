interface DropdownOption<Value extends string> {
  value: Value;
  label: string;
  disabled?: boolean;
}

interface DropdownProps<Value extends string> {
  ariaLabel: string;
  value: Value;
  options: ReadonlyArray<DropdownOption<Value>>;
  onChange: (value: Value) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Dropdown<Value extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  label,
  disabled = false,
  className,
}: DropdownProps<Value>) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-2 font-tibia has-disabled:pointer-events-none has-disabled:opacity-45 ${className ?? ""}`}
    >
      {label && (
        <span className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
          {label}
        </span>
      )}
      <span className="relative block min-w-0">
        <select
          aria-label={ariaLabel}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const option = options.find(
              ({ value: optionValue }) => optionValue === event.currentTarget.value,
            );
            if (!option) return;
            onChange(option.value);
          }}
          className="ui-dropdown h-10 w-full rounded-md border border-ui-stone-light/25 py-2 pr-10 pl-3 font-tibia text-sm text-white outline-none transition-[border-color,box-shadow,filter] duration-150 hover:border-ui-gold/45 hover:brightness-110 focus:border-ui-gold/60 focus:ring-2 focus:ring-ui-gold/15 disabled:cursor-default"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-display text-xs text-ui-accent-light"
        >
          ▼
        </span>
      </span>
    </label>
  );
}
