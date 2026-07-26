"use client";

import { useMemo, useState } from "react";
import {
  DAILY_REWARD_RULES,
  DAILY_REWARD_TABLE,
  type DailyRewardPick,
  type DailyRewardsStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { SpriteIcon } from "../inventory/SpriteIcon";

interface DailyRewardsModalProps {
  state: DailyRewardsStateMessage;
  error: string | null;
  onClaim: (picks: ReadonlyArray<DailyRewardPick>) => void;
  onClose: () => void;
}

/**
 * The daily reward window (Feature 84): the 7-day cycle, streak level and
 * joker tokens, and today's claim. Item days pick from the server-provided
 * pool; every choice is a request the server re-validates.
 */
export function DailyRewardsModal({
  state,
  error,
  onClaim,
  onClose,
}: DailyRewardsModalProps) {
  const { t } = useAppTranslation();
  const [picks, setPicks] = useState<ReadonlyMap<number, number>>(new Map());

  const todayEntry = DAILY_REWARD_TABLE[state.streakPosition];
  const needsPicks =
    todayEntry !== undefined &&
    (todayEntry.kind === "vocation-items" ||
      todayEntry.kind === "training-items");
  const pickedUnits = useMemo(
    () => [...picks.values()].reduce((total, count) => total + count, 0),
    [picks],
  );

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

  const claimDisabled =
    !state.claimableToday ||
    (needsPicks && (pickedUnits === 0 || pickedUnits > state.allowance));

  return (
    <Modal title={t("dailyRewards.title")} onClose={onClose} size="wide">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-ui-text-bright">
            {t("dailyRewards.streakLevel", { level: state.streakLevel })}
          </span>
          <span className="text-ui-muted">
            {t("dailyRewards.jokerTokens", { count: state.jokerTokens })}
          </span>
          {state.missedDays > 0 && (
            <span className="text-ui-accent-light">
              {t("dailyRewards.missedDays", { count: state.missedDays })}
            </span>
          )}
          {state.xpBoostUntilMs > 0 && (
            <span className="text-ui-gold">{t("dailyRewards.boostActive")}</span>
          )}
        </div>
        <ol className="grid grid-cols-7 gap-2">
          {DAILY_REWARD_TABLE.map((entry, index) => (
            <li
              key={index}
              aria-current={index === state.streakPosition ? "step" : undefined}
              className={`rounded-md border p-2 text-center text-xs ${
                index === state.streakPosition
                  ? "border-ui-gold/70 bg-ui-gold-deep text-ui-text-bright"
                  : "border-ui-stone-light/25 text-ui-muted"
              }`}
            >
              <div className="font-medium">
                {t("dailyRewards.day", { day: index + 1 })}
              </div>
              <div>{t(`dailyRewards.kinds.${entry.kind}`)}</div>
            </li>
          ))}
        </ol>
        {needsPicks && (
          <>
            <p className="text-sm text-ui-muted">
              {t("dailyRewards.pickPrompt", {
                picked: pickedUnits,
                allowance: state.allowance,
              })}
            </p>
            <ul className="ui-scrollbar grid max-h-56 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
              {state.pool.map((entry) => {
                const count = picks.get(entry.itemTypeId) ?? 0;
                return (
                  <li
                    key={entry.itemTypeId}
                    className="flex items-center gap-2 rounded-md border border-ui-stone-light/25 bg-black/20 px-2 py-1"
                  >
                    <SpriteIcon spriteId={entry.spriteId} scale={0.9} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ui-text">
                      {entry.name}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t("dailyRewards.remove", {
                          name: entry.name,
                        })}
                        disabled={count === 0}
                        onClick={() => adjustPick(entry.itemTypeId, -1)}
                      >
                        −
                      </Button>
                      <span className="w-6 text-center text-sm text-ui-text-bright">
                        {count}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t("dailyRewards.add", { name: entry.name })}
                        disabled={pickedUnits >= state.allowance}
                        onClick={() => adjustPick(entry.itemTypeId, 1)}
                      >
                        +
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {!needsPicks && todayEntry && (
          <p className="text-sm text-ui-text">
            {todayEntry.kind === "wildcards"
              ? t("dailyRewards.wildcardsToday", { count: state.allowance })
              : t("dailyRewards.boostToday", { minutes: state.allowance })}
          </p>
        )}
        {error && <p className="text-sm text-ui-accent-light">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ui-muted">
            {t("dailyRewards.streakHint", {
              soulLevel: DAILY_REWARD_RULES.streakBonuses.soulRegeneration,
            })}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t("dailyRewards.close")}
            </Button>
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
          </div>
        </div>
      </div>
    </Modal>
  );
}
