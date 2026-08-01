"use client";

import { DAILY_REWARD_TABLE } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { getDailyRewardDayState } from "../../lib/daily/getDailyRewardDayState";
import { DailyRewardDay } from "./DailyRewardDay";

interface DailyRewardCycleProps {
  streakPosition: number;
  claimableToday: boolean;
  premium: boolean;
  remainingMs: number;
  onActivateCurrent: () => void;
}

/**
 * The seven-day cycle. Each card uses the server-shared reward table and only
 * today's claimable card is interactive.
 */
export function DailyRewardCycle({
  streakPosition,
  claimableToday,
  premium,
  remainingMs,
  onActivateCurrent,
}: DailyRewardCycleProps) {
  const { t } = useAppTranslation();

  return (
    <section
      aria-label={t("dailyRewards.dailyRewards")}
      className="ui-scrollbar min-w-0 flex-1 overflow-x-auto"
    >
      <ol className="grid min-w-[56rem] grid-cols-7 gap-3">
        {DAILY_REWARD_TABLE.map((entry, index) => {
          const state = getDailyRewardDayState(
            index,
            streakPosition,
            claimableToday,
          );
          return (
            <li key={index} className="flex min-w-0">
              <DailyRewardDay
                day={index + 1}
                kind={entry.kind}
                state={state}
                allowance={premium ? entry.premium : entry.free}
                remainingMs={remainingMs}
                onActivate={
                  state === "current" ? onActivateCurrent : undefined
                }
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
