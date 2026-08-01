"use client";

import type { DailyRewardKind } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatRewardCountdown } from "../../lib/daily/formatRewardCountdown";
import type { DailyRewardDayState } from "../../lib/daily/getDailyRewardDayState";
import { DailyRewardKindIcon } from "./DailyRewardKindIcon";

interface DailyRewardDayProps {
  day: number;
  kind: DailyRewardKind;
  state: DailyRewardDayState;
  /** Units, wildcards or minutes this day pays the viewing account. */
  allowance: number;
  remainingMs: number;
  onActivate?: () => void;
}

/**
 * One day of the cycle: the reward-type icon, dimmed unless it is today's
 * claim, over the plate that says which it is — green check for collected,
 * red padlock for a day still out of reach.
 */
export function DailyRewardDay({
  day,
  kind,
  state,
  allowance,
  remainingMs,
  onActivate,
}: DailyRewardDayProps) {
  const { t } = useAppTranslation();
  const highlighted = state === "current" || state === "next";
  const label = t("dailyRewards.dayLabel", {
    day,
    reward: t(`dailyRewards.kinds.${kind}`),
    state: t(`dailyRewards.states.${state}`),
  });
  const icon = (
    <DailyRewardKindIcon
      kind={kind}
      className={highlighted ? "" : "opacity-40 grayscale"}
    />
  );
  const cardClass = `relative flex aspect-square min-h-28 w-full items-center justify-center overflow-hidden rounded-sm border bg-ui-panel-deep/80 transition-colors ${
    highlighted
      ? "border-ui-gold/80 bg-ui-panel-light/75 shadow-inner shadow-ui-gold/10"
      : "border-black/70"
  }`;

  return (
    <div className="flex min-w-28 flex-1 flex-col gap-2">
      {onActivate ? (
        <button
          type="button"
          aria-label={label}
          aria-current="step"
          title={`${t(`dailyRewards.kinds.${kind}`)} · ${allowance}`}
          className={`${cardClass} cursor-pointer hover:border-ui-gold hover:bg-ui-panel-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-gold`}
          onClick={onActivate}
        >
          {icon}
        </button>
      ) : (
        <div
          role="img"
          aria-label={label}
          aria-current={highlighted ? "step" : undefined}
          title={`${t(`dailyRewards.kinds.${kind}`)} · ${allowance}`}
          className={cardClass}
        >
          {icon}
        </div>
      )}
      {highlighted ? (
        <span className="flex h-12 items-center justify-center rounded-sm border border-ui-gold/35 bg-amber-950/70 font-display text-base font-bold text-ui-text-bright">
          {formatRewardCountdown(remainingMs)}
        </span>
      ) : (
        <span
          aria-hidden
          className={`h-12 rounded-sm border border-black/70 bg-[length:100%_100%] bg-center bg-no-repeat [image-rendering:pixelated] ${
            state === "collected"
              ? "bg-[url('/assets/reward-wall/day-done.png')]"
              : "bg-[url('/assets/reward-wall/day-locked.png')]"
          }`}
        />
      )}
    </div>
  );
}
