"use client";

import { DAILY_REWARD_TABLE } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getDailyRewardDayState } from "../../lib/daily/getDailyRewardDayState";
import { PixelImage } from "../ui/PixelImage";
import { DailyRewardDay } from "./DailyRewardDay";

interface DailyRewardCycleProps {
  streakPosition: number;
  claimableToday: boolean;
  premium: boolean;
}

/**
 * The seven-day cycle. Each day pays the free or premium column of the shared
 * reward table, so the numbers under the icons are the ones this account will
 * actually get; the arrows between them turn green as the cycle is collected.
 */
export function DailyRewardCycle({
  streakPosition,
  claimableToday,
  premium,
}: DailyRewardCycleProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-label={t("dailyRewards.dailyRewards")}
      className="flex min-w-0 flex-col overflow-hidden rounded-md border border-ui-stone-light/15 bg-black/20"
    >
      <header className="truncate border-b border-ui-stone-light/15 bg-black/40 px-2 py-1.5 text-center font-display text-sm font-bold tracking-wide text-ui-text/90">
        {t("dailyRewards.dailyRewards")}
      </header>
      <ol className="ui-scrollbar flex items-start gap-1 overflow-x-auto p-3">
        {DAILY_REWARD_TABLE.map((entry, index) => {
          const state = getDailyRewardDayState(
            index,
            streakPosition,
            claimableToday,
          );
          return (
            <li key={index} className="flex items-start gap-1">
              <DailyRewardDay
                day={index + 1}
                kind={entry.kind}
                state={state}
                allowance={premium ? entry.premium : entry.free}
              />
              {index < DAILY_REWARD_TABLE.length - 1 && (
                <PixelImage
                  src="reward-wall/arrow.png"
                  sheetWidth={10}
                  sheetHeight={7}
                  x={state === "collected" ? 5 : 0}
                  width={5}
                  height={7}
                  scale={2}
                  className="mt-8"
                />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
