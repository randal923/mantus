"use client";

import type { DailyRewardKind } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getDailyRewardKindIcon } from "../../lib/daily/getDailyRewardKindIcon";
import type { DailyRewardDayState } from "../../lib/daily/getDailyRewardDayState";
import { PixelImage } from "../ui/PixelImage";

interface DailyRewardDayProps {
  day: number;
  kind: DailyRewardKind;
  state: DailyRewardDayState;
  /** Units, wildcards or minutes this day pays the viewing account. */
  allowance: number;
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
}: DailyRewardDayProps) {
  const { t } = useAppTranslation();
  const label = t("dailyRewards.dayLabel", {
    day,
    reward: t(`dailyRewards.kinds.${kind}`),
    state: t(`dailyRewards.states.${state}`),
  });

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Not interactive: today's picks are made in the panel below, the way
          the window lays them out — so this is a labelled figure, not a
          button the player can press. */}
      <div
        role="img"
        aria-label={label}
        aria-current={state === "current" ? "step" : undefined}
        className={`relative flex size-[68px] items-center justify-center rounded-sm border bg-black/40 ${
          state === "current"
            ? "border-ui-gold/70 bg-ui-gold-deep/40"
            : "border-ui-stone-light/15"
        }`}
      >
        <PixelImage
          src={getDailyRewardKindIcon(kind)}
          sheetWidth={64}
          sheetHeight={64}
          className={state === "current" ? "" : "opacity-50"}
        />
        {state !== "current" && (
          <PixelImage
            src="reward-wall/dither.png"
            sheetWidth={40}
            sheetHeight={40}
            className="absolute inset-0 size-full opacity-40 [background-repeat:repeat] [background-size:auto]"
          />
        )}
      </div>
      {state === "current" ? (
        <span className="flex h-5 w-[66px] items-center justify-center rounded-sm border border-ui-gold/50 bg-black/60 text-xs text-ui-text-bright">
          {allowance}
        </span>
      ) : (
        <PixelImage
          src={
            state === "collected"
              ? "reward-wall/day-done.png"
              : "reward-wall/day-locked.png"
          }
          sheetWidth={66}
          sheetHeight={20}
        />
      )}
    </div>
  );
}
