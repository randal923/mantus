"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DAILY_REWARD_TABLE,
  type DailyRewardHistoryEntry,
  type DailyRewardPick,
  type DailyRewardsStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { PixelImage } from "../ui/PixelImage";
import { DailyRewardCycle } from "./DailyRewardCycle";
import { DailyRewardHistoryPanel } from "./DailyRewardHistoryPanel";
import { DailyRewardPickPanel } from "./DailyRewardPickPanel";
import { RestingAreaPanel } from "./RestingAreaPanel";
import { RewardWallPremiumPanel } from "./RewardWallPremiumPanel";

interface DailyRewardsModalProps {
  state: DailyRewardsStateMessage;
  error: string | null;
  /** Null until a history request comes back; undefined while never asked. */
  history?: ReadonlyArray<DailyRewardHistoryEntry> | null;
  onClaim: (picks: ReadonlyArray<DailyRewardPick>) => void;
  onRequestHistory?: () => void;
  onClose: () => void;
}

/**
 * The reward wall (Feature 84). Opened by using a reward shrine, it shows the
 * resting-area bonuses the streak has unlocked, the seven-day cycle, and
 * today's claim. Every number here is server state and every pick is a request
 * the server re-validates — the window enforces nothing.
 */
export function DailyRewardsModal({
  state,
  error,
  history,
  onClaim,
  onRequestHistory,
  onClose,
}: DailyRewardsModalProps) {
  const { t } = useAppTranslation();
  const [picks, setPicks] = useState<ReadonlyMap<number, number>>(new Map());
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The only external system this window syncs with: the wall clock behind the
  // claim countdown. The deadline itself is the server's.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayEntry = DAILY_REWARD_TABLE[state.streakPosition];
  const needsPicks =
    todayEntry !== undefined &&
    (todayEntry.kind === "vocation-items" ||
      todayEntry.kind === "training-items");
  const pickedUnits = useMemo(
    () => [...picks.values()].reduce((total, count) => total + count, 0),
    [picks],
  );
  const premium = state.accountTier === "premium";
  const remainingMs = Math.max(0, state.dayEndsAtMs - now);

  const adjustPick = (itemTypeId: number, delta: number) => {
    setPicks((current) => {
      const next = new Map(current);
      const value = (next.get(itemTypeId) ?? 0) + delta;
      if (value <= 0) next.delete(itemTypeId);
      else next.set(itemTypeId, value);
      return next;
    });
  };

  const claim = () => {
    onClaim(
      [...picks.entries()].map(([itemTypeId, count]) => ({
        itemTypeId,
        count,
      })),
    );
  };

  const toggleHistory = () => {
    if (!showHistory && history === undefined) onRequestHistory?.();
    setShowHistory((open) => !open);
  };

  const claimDisabled =
    !state.claimableToday ||
    (needsPicks && (pickedUnits === 0 || pickedUnits > state.allowance));

  return (
    <Modal
      title={t("dailyRewards.title")}
      onClose={onClose}
      size="wide"
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
          {!showHistory && (
            <Button
              variant="primary"
              size="sm"
              disabled={claimDisabled}
              onClick={claim}
            >
              {state.claimableToday
                ? t("dailyRewards.claim")
                : t("dailyRewards.claimed")}
            </Button>
          )}
        </>
      }
    >
      {showHistory ? (
        <DailyRewardHistoryPanel entries={history ?? null} />
      ) : (
        <div className="flex flex-col gap-3">
          <RestingAreaPanel
            streakLevel={state.streakLevel}
            jokerTokens={state.jokerTokens}
            remainingMs={remainingMs}
            premium={premium}
            atRisk={state.claimableToday && state.missedDays > 0}
            boostActive={state.xpBoostUntilMs > now}
          />
          <DailyRewardCycle
            streakPosition={state.streakPosition}
            claimableToday={state.claimableToday}
            premium={premium}
          />
          {needsPicks && state.claimableToday && (
            <DailyRewardPickPanel
              pool={state.pool}
              picks={picks}
              pickedUnits={pickedUnits}
              allowance={state.allowance}
              onAdjust={adjustPick}
            />
          )}
          {!needsPicks && todayEntry && (
            <p className="text-sm text-ui-text">
              {todayEntry.kind === "wildcards"
                ? t("dailyRewards.wildcardsToday", { count: state.allowance })
                : t("dailyRewards.boostToday", { minutes: state.allowance })}
            </p>
          )}
          <RewardWallPremiumPanel premium={premium} />
          {error && <p className="text-sm text-ui-accent-light">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
