interface LoadingBarProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  showValue?: boolean;
}

export function LoadingBar({
  value,
  min = 0,
  max = 100,
  label,
  showValue = true,
}: LoadingBarProps) {
  const { t } = useAppTranslation();
  const resolvedLabel = label ?? t("common.loading");
  const safeMax = Math.max(min, max);
  const safeValue = Math.min(Math.max(min, value), safeMax);
  const range = safeMax - min;
  const percent = range > 0 ? ((safeValue - min) / range) * 100 : 0;
  const roundedPercent = Math.round(percent);

  return (
    <div className="w-full space-y-2 font-tibia">
      <div className="flex items-center justify-between gap-4 px-0.5">
        <span className="font-display text-[10px] font-bold tracking-widest text-ui-text uppercase">
          {resolvedLabel}
        </span>
        {showValue && (
          <span className="text-[10px] font-semibold tabular-nums text-ui-muted">
            {roundedPercent}%
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={resolvedLabel}
        aria-valuemin={min}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-valuetext={`${roundedPercent}%`}
        className="relative h-3 overflow-hidden rounded-md border border-ui-stone-light/25 bg-black/65 shadow-[inset_0_2px_5px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.04)]"
      >
        <div
          className="absolute inset-y-0 left-0 border-r border-ui-accent-light/35 bg-linear-to-b from-ui-accent-light/85 to-ui-accent transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        >
          <span
            aria-hidden
            className="texture-noise absolute inset-0 opacity-[0.08] mix-blend-soft-light"
          />
        </div>
      </div>
    </div>
  );
}
import { useAppTranslation } from "../../i18n/useAppTranslation";
