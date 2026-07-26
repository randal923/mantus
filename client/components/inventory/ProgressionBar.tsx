interface ProgressionBarProps {
  label: string;
  /** Server-computed temporary delta (wheel/conditions), e.g. "+2" or "-3". */
  boost?: string;
  value: number;
  max: number;
  valueLabel: string;
  fillClassName?: string;
}

export function ProgressionBar({
  label,
  boost,
  value,
  max,
  valueLabel,
  fillClassName = "from-ui-gold to-ui-gold/65",
}: ProgressionBarProps) {
  const boundedMax = Math.max(0, max);
  const boundedValue = Math.min(Math.max(0, value), boundedMax);
  const percent =
    boundedMax > 0 ? Math.min(100, (boundedValue / boundedMax) * 100) : 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-display tracking-wider text-ui-muted uppercase">
          {label}
          {boost && (
            <span
              className={`ml-1.5 font-semibold ${
                boost.startsWith("-") ? "text-red-400" : "text-emerald-400"
              }`}
            >
              ({boost})
            </span>
          )}
        </span>
        <span className="truncate font-semibold tabular-nums text-ui-text">
          {valueLabel}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={boundedMax}
        aria-valuenow={boundedValue}
        className="h-2 overflow-hidden rounded-full border border-black/70 bg-black/60 shadow-inner shadow-black/70"
      >
        <div
          className={`h-full rounded-full bg-linear-to-r transition-[width] duration-300 ${fillClassName}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
