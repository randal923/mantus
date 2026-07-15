interface HealthManaBarsProps {
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export function HealthManaBars({
  health,
  maxHealth,
  mana,
  maxMana,
}: HealthManaBarsProps) {
  const healthMax = Math.max(0, maxHealth);
  const healthValue = Math.min(Math.max(0, health), healthMax);
  const healthPercent = healthMax > 0 ? (healthValue / healthMax) * 100 : 0;
  const manaMax = Math.max(0, maxMana);
  const manaValue = Math.min(Math.max(0, mana), manaMax);
  const manaPercent = manaMax > 0 ? (manaValue / manaMax) * 100 : 0;

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={healthMax}
        aria-valuenow={healthValue}
        className="relative h-5 overflow-hidden rounded-md border border-ui-stone-light/25 bg-black/60 shadow-[inset_0_2px_5px_rgba(0,0,0,0.75),0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div
          className="absolute inset-y-0 left-0 border-r border-ui-health-light/30 bg-linear-to-b from-ui-health-light/80 to-ui-health transition-[width] duration-300"
          style={{ width: `${healthPercent}%` }}
        >
          <span
            aria-hidden
            className="texture-noise absolute inset-0 opacity-[0.06] mix-blend-soft-light"
          />
        </div>
        <span className="relative flex h-full items-center justify-between gap-2 px-2 text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          <span className="font-display text-[9px] font-bold tracking-wider uppercase">
            HP
          </span>
          <span className="truncate text-[10px] font-semibold tabular-nums">
            {healthValue.toLocaleString()} / {healthMax.toLocaleString()}
          </span>
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Mana"
        aria-valuemin={0}
        aria-valuemax={manaMax}
        aria-valuenow={manaValue}
        className="relative h-4 overflow-hidden rounded-md border border-ui-stone-light/20 bg-black/60 shadow-[inset_0_2px_5px_rgba(0,0,0,0.75),0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div
          className="absolute inset-y-0 left-0 border-r border-ui-mana-light/30 bg-linear-to-b from-ui-mana-light/75 to-ui-mana transition-[width] duration-300"
          style={{ width: `${manaPercent}%` }}
        >
          <span
            aria-hidden
            className="texture-noise absolute inset-0 opacity-[0.06] mix-blend-soft-light"
          />
        </div>
        <span className="relative flex h-full items-center justify-between gap-2 px-2 text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          <span className="font-display text-[8px] font-bold tracking-wider uppercase">
            MP
          </span>
          <span className="truncate text-[9px] font-semibold tabular-nums">
            {manaValue.toLocaleString()} / {manaMax.toLocaleString()}
          </span>
        </span>
      </div>
    </div>
  );
}
