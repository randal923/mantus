"use client";

import { DAILY_REWARD_RULES } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatRewardCountdown } from "../../lib/daily/formatRewardCountdown";
import { PixelImage } from "../ui/PixelImage";
import { RestingBonusShield } from "./RestingBonusShield";
import { RewardStreakBanner } from "./RewardStreakBanner";

/** The six bonuses, in the order their shields are drawn. */
const BONUSES = [
  "hpRegeneration",
  "mpRegeneration",
  "staminaRegeneration",
  "doubleHpRegeneration",
  "doubleMpRegeneration",
  "soulRegeneration",
] as const;

interface RestingAreaPanelProps {
  streakLevel: number;
  jokerTokens: number;
  /** Milliseconds left before the unclaimed day is lost; already clamped. */
  remainingMs: number;
  /** Premium accounts benefit from every unlocked bonus (Canary). */
  premium: boolean;
  /** True once the streak is at risk — drives the reset warning. */
  atRisk: boolean;
  /** A day-7 XP boost is still running; not part of Canary's window. */
  boostActive: boolean;
}

/**
 * The window's top panel: the streak ribbon, the claim countdown, the joker
 * tokens held, and the six resting-area bonus shields. A bonus lights up when
 * the streak level reaches its threshold and the account is premium — the same
 * two conditions the server applies before the regeneration actually changes.
 */
export function RestingAreaPanel({
  streakLevel,
  jokerTokens,
  remainingMs,
  premium,
  atRisk,
  boostActive,
}: RestingAreaPanelProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-label={t("dailyRewards.restingArea")}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-ui-stone-light/15 bg-black/20"
    >
      <header className="truncate border-b border-ui-stone-light/15 bg-black/40 px-2 py-1.5 text-center font-display text-sm font-bold tracking-wide text-ui-text/90">
        {t("dailyRewards.restingArea")}
      </header>
      <div className="flex flex-wrap items-start gap-4 p-3">
        <div className="flex flex-col items-center gap-1">
          <RewardStreakBanner
            streakLevel={streakLevel}
            label={t("dailyRewards.streakLevel", { level: streakLevel })}
          />
          <span className="rounded-sm border border-ui-stone-light/15 bg-black/40 px-2 py-0.5 text-xs text-ui-text-bright">
            {formatRewardCountdown(remainingMs)}
          </span>
          <span
            aria-label={t("dailyRewards.jokerTokens", { count: jokerTokens })}
            className="flex items-center gap-1 rounded-sm border border-ui-stone-light/15 bg-black/40 px-2 py-0.5 text-xs text-ui-text-bright"
          >
            {jokerTokens}
            <PixelImage
              src="reward-wall/joker.png"
              sheetWidth={11}
              sheetHeight={11}
            />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <ul className="flex flex-wrap gap-1">
            {BONUSES.map((bonus, index) => {
              const threshold = DAILY_REWARD_RULES.streakBonuses[bonus];
              const active = premium && streakLevel >= threshold;
              return (
                <li key={bonus}>
                  <RestingBonusShield
                    index={index + 1}
                    active={active}
                    description={t(
                      active
                        ? "dailyRewards.bonusActive"
                        : "dailyRewards.bonusLocked",
                      {
                        bonus: t(`dailyRewards.bonuses.${bonus}`),
                        level: threshold,
                      },
                    )}
                  />
                </li>
              );
            })}
          </ul>
          {atRisk && (
            <p className="text-sm text-ui-text">
              {t("dailyRewards.lateWarning")}{" "}
              <span className="text-ui-accent-light">
                {t("dailyRewards.streakWillReset")}
              </span>
            </p>
          )}
          {boostActive && (
            <p className="text-sm text-ui-gold">
              {t("dailyRewards.boostActive")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
