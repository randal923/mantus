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
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Health"
        aria-valuemin={0}
        aria-valuemax={healthMax}
        aria-valuenow={healthValue}
        className="relative h-4 overflow-hidden rounded-md border border-black/60 bg-black/55 shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] sm:h-5"
      >
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-r from-[#9f2634] via-[#dc3f4d] to-[#f0646f] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_10px_rgba(220,63,77,0.35)] transition-[width]"
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
        className="relative h-2.5 overflow-hidden rounded-sm border border-black/60 bg-black/55 shadow-[inset_0_2px_3px_rgba(0,0,0,0.65)] sm:h-3"
      >
        <div
          className="absolute inset-y-0 left-0 bg-linear-to-r from-[#17699a] to-[#3cb5e7] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_0_8px_rgba(60,181,231,0.3)] transition-[width]"
          style={{ width: `${manaPercent}%` }}
        />
        <span className="relative hidden h-full items-center justify-center text-xs font-bold text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)] sm:flex">
          {manaValue.toLocaleString()} / {manaMax.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
