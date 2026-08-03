"use client";

import { useEffect, useRef, useState } from "react";
import {
  DAILY_REWARD_TABLE,
  type DailyRewardHistoryEntry,
  type DailyRewardPick,
  type DailyRewardsStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { formatRewardCountdown } from "../../lib/daily/formatRewardCountdown";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { PixelImage } from "../ui/PixelImage";
import { DailyRewardCycle } from "./DailyRewardCycle";
import { DailyRewardHistoryPanel } from "./DailyRewardHistoryPanel";
import { ExerciseWeaponSelectionModal } from "./ExerciseWeaponSelectionModal";
import { RewardStreakBanner } from "./RewardStreakBanner";

interface DailyRewardsModalProps {
  state: DailyRewardsStateMessage;
  error: string | null;
  /** Null until a history request comes back; undefined while never asked. */
  history?: ReadonlyArray<DailyRewardHistoryEntry> | null;
  onClaim: (picks: ReadonlyArray<DailyRewardPick>) => void;
  onRequestHistory?: () => void;
  /** Re-reads the wall after the countdown crosses the server's day end. */
  onRefreshState?: () => void;
  onClose: () => void;
}

/**
 * Opened by using a reward shrine, this shows the seven-day cycle and turns a
 * click on today's card into a claim intent. Exercise-weapon days open the
 * server-projected chooser first; the server re-validates every selection.
 */
export function DailyRewardsModal({
  state,
  error,
  history,
  onClaim,
  onRequestHistory,
  onRefreshState,
  onClose,
}: DailyRewardsModalProps) {
  const { t } = useAppTranslation();
  const [showHistory, setShowHistory] = useState(false);
  const [showWeaponPicker, setShowWeaponPicker] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The only external system this window syncs with: the wall clock behind the
  // claim countdown. The deadline itself is the server's.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayEntry = DAILY_REWARD_TABLE[state.streakPosition];
  const premium = state.accountTier === "premium";
  const remainingMs = Math.max(0, state.dayEndsAtMs - now);
  const expired = remainingMs === 0;

  const refreshRef = useRef(onRefreshState);
  useEffect(() => {
    refreshRef.current = onRefreshState;
  }, [onRefreshState]);

  // The countdown ran out, so the server-local day has flipped and the state
  // in hand is a day old: today's reward is claimable again and the deadline
  // moved. Only the server can confirm that, so ask it — and keep asking on a
  // slow beat, since a client clock running ahead gets here first.
  useEffect(() => {
    if (!expired) return;
    const refresh = () => refreshRef.current?.();
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(timer);
  }, [expired]);

  const activateCurrentReward = () => {
    if (!state.claimableToday || !todayEntry) return;
    if (todayEntry.kind === "training-items") {
      setShowWeaponPicker(true);
      return;
    }
    onClaim([]);
  };

  const toggleHistory = () => {
    if (!showHistory && history === undefined) onRequestHistory?.();
    setShowHistory((open) => !open);
  };

  if (showWeaponPicker) {
    return (
      <ExerciseWeaponSelectionModal
        weapons={state.pool}
        onConfirm={(itemTypeId) => {
          onClaim([{ itemTypeId, count: state.allowance }]);
          setShowWeaponPicker(false);
        }}
        onClose={() => setShowWeaponPicker(false)}
      />
    );
  }

  return (
    <Modal
      title={t("dailyRewards.title")}
      onClose={onClose}
      size="full"
      height="auto"
      footer={
        <>
          <span
            aria-label={t("dailyRewards.jokerTokens", {
              count: state.jokerTokens,
            })}
            className="mr-auto flex items-center gap-1 text-xs text-ui-muted"
          >
            {state.jokerTokens}
            <PixelImage
              src="reward-wall/joker.png"
              sheetWidth={11}
              sheetHeight={11}
            />
          </span>
          <Button variant="secondary" size="sm" onClick={toggleHistory}>
            {t(showHistory ? "dailyRewards.back" : "dailyRewards.history")}
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("dailyRewards.close")}
          </Button>
        </>
      }
    >
      {showHistory ? (
        <DailyRewardHistoryPanel entries={history ?? null} />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="max-w-4xl border border-ui-stone-light/10 bg-black/20 px-4 py-3 text-base font-medium text-ui-muted">
            {t("dailyRewards.description")}
          </p>
          <div className="flex min-w-0 flex-col items-center gap-5 border border-ui-stone-light/10 bg-ui-panel/60 p-4 lg:flex-row lg:items-stretch">
            <div className="flex shrink-0 flex-col items-center justify-center gap-2 px-4 lg:w-56">
              <RewardStreakBanner
                streakLevel={state.streakLevel}
                label={t("dailyRewards.streakLevel", {
                  level: state.streakLevel,
                })}
                size="large"
              />
              {state.claimableToday ? (
                <p className="text-center text-sm font-bold text-amber-200">
                  {t("dailyRewards.available")}
                  <span className="block font-normal text-ui-muted">
                    {t("dailyRewards.expiresIn", {
                      time: formatRewardCountdown(remainingMs),
                    })}
                  </span>
                </p>
              ) : (
                <p className="text-center text-sm text-ui-muted">
                  {t("dailyRewards.nextRewardIn", {
                    time: formatRewardCountdown(remainingMs),
                  })}
                </p>
              )}
            </div>
            <DailyRewardCycle
              streakPosition={state.streakPosition}
              claimableToday={state.claimableToday}
              premium={premium}
              remainingMs={remainingMs}
              onActivateCurrent={activateCurrentReward}
            />
          </div>
          {state.claimableToday && state.missedDays > 0 && (
            <p className="text-sm text-ui-accent-light">
              {t("dailyRewards.lateWarning")} {t("dailyRewards.streakWillReset")}
            </p>
          )}
          {error && <p className="text-sm text-ui-accent-light">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
