"use client";

import { useAppTranslation } from "../../i18n/useAppTranslation";

interface ForgeCostSummaryProps {
  goldCost: number;
  dustCost: number;
  coreCost: number;
  /** Chance shown for fusions; transfers always succeed (null hides it). */
  successPercent: number | null;
}

/** Cost preview from the shared protocol price tables (display only). */
export function ForgeCostSummary({
  goldCost,
  dustCost,
  coreCost,
  successPercent,
}: ForgeCostSummaryProps) {
  const { t } = useAppTranslation();

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-sm border border-ui-stone-light/15 bg-black/25 px-3 py-2 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs tracking-widest text-ui-muted uppercase">
          {t("forge.cost.gold")}
        </dt>
        <dd className="text-ui-gold">{goldCost.toLocaleString()}</dd>
      </div>
      <div>
        <dt className="text-xs tracking-widest text-ui-muted uppercase">
          {t("forge.cost.dust")}
        </dt>
        <dd className="text-ui-gold">{dustCost}</dd>
      </div>
      <div>
        <dt className="text-xs tracking-widest text-ui-muted uppercase">
          {t("forge.cost.cores")}
        </dt>
        <dd className="text-ui-gold">{coreCost}</dd>
      </div>
      {successPercent !== null && (
        <div>
          <dt className="text-xs tracking-widest text-ui-muted uppercase">
            {t("forge.cost.success")}
          </dt>
          <dd className="text-ui-text-bright">{successPercent}%</dd>
        </div>
      )}
    </dl>
  );
}
