import { WeightIcon } from "./WeightIcon";

interface CapacityBarProps {
  used: number;
  max: number;
}

export function CapacityBar({ used, max }: CapacityBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  return (
    <div
      role="meter"
      aria-label="Capacity"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="mb-2 flex items-center justify-between text-xs text-ui-muted">
        <span className="flex items-center gap-1.5 font-display tracking-wider text-ui-gold uppercase">
          <WeightIcon className="text-ui-gold" />
          Capacity
        </span>
        <span>
          {used.toLocaleString()} / {max.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full border border-black/70 bg-black/55 shadow-inner shadow-black/60">
        <div
          className={
            pct >= 90
              ? "h-full rounded-full bg-ui-accent transition-[width] duration-300"
              : "h-full rounded-full bg-ui-gold/85 transition-[width] duration-300"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
