import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";

interface VitalOrbProps {
  kind: "health" | "mana";
  value: number;
  max: number;
}

export function VitalOrb({ kind, value, max }: VitalOrbProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const boundedMax = Math.max(0, max);
  const boundedValue = Math.min(Math.max(0, value), boundedMax);
  const percent = boundedMax > 0 ? (boundedValue / boundedMax) * 100 : 0;
  const label = t(kind === "health" ? "stats.health" : "stats.mana");
  const abbreviation = t(
    kind === "health"
      ? "stats.healthAbbreviation"
      : "stats.manaAbbreviation",
  );

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={boundedMax}
      aria-valuenow={boundedValue}
      title={`${label}: ${boundedValue.toLocaleString(language)} / ${boundedMax.toLocaleString(language)}`}
      className={`ui-vital-orb ui-vital-orb-${kind} relative isolate size-20 sm:size-28`}
    >
      <div
        aria-hidden
        className="ui-vital-orb-liquid absolute inset-x-0 bottom-0"
        style={{ height: `${percent}%`, opacity: percent > 0 ? 1 : 0 }}
      >
        <span className="texture-noise absolute inset-0 opacity-10 mix-blend-soft-light" />
      </div>

      <span
        aria-hidden
        className="ui-vital-orb-glass absolute inset-0 z-10 rounded-full"
      />

      <span className="absolute inset-0 z-30 flex flex-col items-center justify-center px-3 text-center text-white [text-shadow:0_2px_3px_rgba(0,0,0,0.95)]">
        <span className="font-display text-[9px] font-bold tracking-[0.18em] text-white/75 uppercase sm:text-[10px]">
          {abbreviation}
        </span>
        <span className="max-w-full truncate text-xs font-bold leading-tight tabular-nums sm:text-sm">
          {boundedValue.toLocaleString(language)}
        </span>
        <span className="max-w-full truncate text-[8px] leading-tight text-white/65 tabular-nums sm:text-[9px]">
          / {boundedMax.toLocaleString(language)}
        </span>
      </span>
    </div>
  );
}
