"use client";

import type { OwnProgressionState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useLanguageStore } from "../../stores/useLanguageStore";

interface XpGainRatePanelProps {
  rate: OwnProgressionState["experienceRate"];
}

/**
 * Tibia's XP Gain Rate breakdown. Every figure is computed server-side from
 * the same terms the kill-experience path applies, so this panel cannot
 * disagree with what a kill actually awards.
 *
 * Per-monster bonuses — prey, boosted creature, animus mastery — are not here
 * because they depend on the target rather than the character, which is also
 * where the official client draws the line.
 */
export function XpGainRatePanel({ rate }: XpGainRatePanelProps) {
  const { t } = useAppTranslation();
  const language = useLanguageStore((state) => state.language);
  const percent = (value: number) => `${value.toLocaleString(language)}%`;
  const boostMinutes = Math.ceil(rate.xpBoostRemainingMs / 60_000);

  const rows: ReadonlyArray<{ key: string; value: string; muted: boolean }> = [
    { key: "base", value: percent(rate.basePercent), muted: false },
    {
      key: "xpBoost",
      value:
        rate.xpBoostPercent > 0
          ? `+${percent(rate.xpBoostPercent)} · ${t("xpRate.remaining", {
              count: boostMinutes,
            })}`
          : percent(0),
      muted: rate.xpBoostPercent === 0,
    },
    {
      key: "premium",
      value:
        rate.premiumPercent > 0
          ? `+${percent(rate.premiumPercent)}`
          : percent(0),
      muted: rate.premiumPercent === 0,
    },
    {
      key: "stamina",
      value: percent(rate.staminaPercent),
      muted: rate.staminaPercent === 100,
    },
  ];

  return (
    <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
      <h4 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
        {t("xpRate.title")}
      </h4>
      <dl className="mt-3 space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-xs tracking-wider text-ui-muted uppercase">
              {t(`xpRate.${row.key}`)}
            </dt>
            <dd
              className={`text-sm tabular-nums ${
                row.muted ? "text-ui-muted" : "text-ui-text-bright"
              }`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-ui-stone-light/15 pt-3">
        <span className="font-display text-xs tracking-widest text-ui-gold uppercase">
          {t("xpRate.total")}
        </span>
        <span
          className={`font-display text-lg font-bold tabular-nums ${
            rate.totalPercent === 0 ? "text-red-400" : "text-ui-text-bright"
          }`}
        >
          {percent(rate.totalPercent)}
        </span>
      </div>
      {rate.totalPercent === 0 && (
        <p role="status" className="mt-2 text-xs text-red-300">
          {t("xpRate.staminaDepleted")}
        </p>
      )}
    </section>
  );
}
