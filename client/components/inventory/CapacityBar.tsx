interface CapacityBarProps {
  /** Capacity used, in oz. */
  used: number;
  max: number;
}

/** Weight readout above a slim bar; green fill turning red near overload. */
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
      <div className="mb-0.5 text-center text-sm font-bold text-ui-ink">
        <span aria-hidden>⚖</span> {pct}%
      </div>
      <div className="h-2.5 overflow-hidden rounded-sm border border-black/50 bg-black/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
        <div
          className={
            pct >= 90
              ? "h-full bg-linear-to-b from-[#d5564a] to-[#8c1f1f]"
              : "h-full bg-linear-to-b from-[#93d354] to-[#4a9120]"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
