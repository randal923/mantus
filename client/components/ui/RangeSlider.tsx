interface RangeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

export function RangeSlider({
  label,
  value,
  min,
  max,
  onChange,
  step = 1,
  unit = "",
  disabled = false,
}: RangeSliderProps) {
  const safeMax = Math.max(min, max);
  const safeValue = Math.min(Math.max(min, value), safeMax);

  return (
    <label className="flex flex-col gap-3 font-tibia has-disabled:pointer-events-none has-disabled:opacity-45">
      <span className="flex items-center justify-between gap-4">
        <span className="font-display text-[10px] font-bold tracking-widest text-ui-gold uppercase">
          {label}
        </span>
        <output className="min-w-12 rounded-sm border border-ui-stone-light/15 bg-black/35 px-2 py-0.5 text-center text-xs font-semibold tabular-nums text-ui-text-bright">
          {safeValue}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={safeMax}
        step={step}
        value={safeValue}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        className="ui-range"
      />
      <span className="flex justify-between text-[9px] font-medium tabular-nums text-ui-muted">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {safeMax}
          {unit}
        </span>
      </span>
    </label>
  );
}
