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
        className="relative h-4 overflow-hidden rounded-full border border-black/70 bg-black/55 shadow-inner shadow-black/60 sm:h-5"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-ui-health to-ui-health-light transition-[width] duration-300"
          style={{ width: `${healthPercent}%` }}
        />
        <span className="relative flex h-full items-center justify-center text-xs font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
          {healthValue.toLocaleString()} / {healthMax.toLocaleString()}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Mana"
        aria-valuemin={0}
        aria-valuemax={manaMax}
        aria-valuenow={manaValue}
        className="relative h-2.5 overflow-hidden rounded-full border border-black/70 bg-black/55 shadow-inner shadow-black/60 sm:h-3"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-ui-mana to-ui-mana-light transition-[width] duration-300"
          style={{ width: `${manaPercent}%` }}
        />
        <span className="relative hidden h-full items-center justify-center text-xs font-bold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] sm:flex">
          {manaValue.toLocaleString()} / {manaMax.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
