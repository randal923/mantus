import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";

interface VitalOrbProps {
  kind: "health" | "mana";
  value: number;
  max: number;
}

const LOW_VITAL_PERCENT = 25;

export function VitalOrb({ kind, value, max }: VitalOrbProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const boundedMax = Math.max(0, max);
  const boundedValue = Math.min(Math.max(0, value), boundedMax);
  const percent = boundedMax > 0 ? (boundedValue / boundedMax) * 100 : 0;
  const label = t(kind === "health" ? "stats.health" : "stats.mana");
  const low = percent > 0 && percent <= LOW_VITAL_PERCENT;
  const formattedValue = boundedValue.toLocaleString(language);
  const formattedMax = boundedMax.toLocaleString(language);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={boundedMax}
      aria-valuenow={boundedValue}
      title={`${label}: ${formattedValue} / ${formattedMax}`}
      className="ui-vital-orb-shell relative z-10 isolate size-20 sm:size-28"
    >
      <div
        aria-hidden
        className={`ui-vital-orb ui-vital-orb-${kind} ${
          low ? "ui-vital-orb-low" : ""
        } absolute inset-0 isolate`}
      >
        <div
          className="ui-vital-orb-liquid absolute inset-x-0 bottom-0"
          style={{ height: `${percent}%`, opacity: percent > 0 ? 1 : 0 }}
        >
          <span className="texture-noise absolute inset-0 opacity-10 mix-blend-soft-light" />
        </div>
        <span className="ui-vital-orb-glass absolute inset-0 z-10 rounded-full" />
      </div>

      <Image
        aria-hidden
        src="/assets/ui/vital-orb-dragon-charcoal.png"
        alt=""
        width={256}
        height={256}
        draggable={false}
        className={`ui-vital-orb-dragon pointer-events-none absolute top-1/2 left-1/2 z-30 size-40 max-w-none -translate-x-1/2 -translate-y-1/2 select-none sm:size-56 ${
          kind === "mana" ? "-scale-x-100" : ""
        }`}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center whitespace-nowrap font-tibia text-xs font-semibold text-white tabular-nums [text-shadow:0_1px_3px_#000,1px_0_1px_#000,-1px_0_1px_#000] sm:text-sm"
      >
        {formattedValue} / {formattedMax}
      </span>
    </div>
  );
}
