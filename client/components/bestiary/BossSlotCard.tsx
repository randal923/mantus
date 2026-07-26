"use client";

import type { BossSlotEntry, BosstiaryEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Button } from "../ui/Button";
import { AnimatedOutfit } from "./AnimatedOutfit";

interface BossSlotCardProps {
  slotIndex: number;
  unlocked: boolean;
  entry: BossSlotEntry;
  /** Catalog row resolved from the cached bosstiary state, if assigned. */
  boss?: BosstiaryEntry;
  pending: boolean;
  /** Gold price of the next removal (0 while removals are free). */
  removePriceGold: number;
  onAssign: () => void;
  onClear: () => void;
}

/** One equippable boss slot; unlocks and bonuses are server-authored. */
export function BossSlotCard({
  slotIndex,
  unlocked,
  entry,
  boss,
  pending,
  removePriceGold,
  onAssign,
  onClear,
}: BossSlotCardProps) {
  const { t } = useAppTranslation();

  return (
    <div className="ui-panel-inset flex min-h-44 flex-col rounded-sm border border-ui-stone-light/15 p-3">
      <h4 className="text-xs tracking-widest text-ui-gold uppercase">
        {t("bossSlots.slotLabel", { slot: slotIndex + 1 })}
      </h4>
      {!unlocked && (
        <p className="my-auto py-4 text-center text-sm text-ui-muted">
          {slotIndex === 0
            ? t("bossSlots.slotOneLocked")
            : t("bossSlots.slotTwoLocked")}
        </p>
      )}
      {unlocked && entry.raceId === null && (
        <div className="my-auto flex flex-col items-center gap-2 py-4">
          <p className="text-sm text-ui-muted">{t("bossSlots.empty")}</p>
          <Button size="sm" disabled={pending} onClick={onAssign}>
            {t("bossSlots.assign")}
          </Button>
        </div>
      )}
      {unlocked && entry.raceId !== null && (
        <div className="mt-2 flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
          {boss && <AnimatedOutfit outfit={boss.outfit} fit={64} />}
          <span className="w-full truncate text-sm text-ui-text-bright capitalize">
            {boss?.name ?? t("bossSlots.unknownBoss")}
          </span>
          <span className="text-xs text-ui-muted">
            {t("bossSlots.kills", { kills: entry.kills.toLocaleString() })}
          </span>
          <span className="text-xs text-ui-gold">
            {t("bossSlots.lootBonus", { percent: entry.lootBonusPercent })}
          </span>
          {entry.inactive && (
            <span className="rounded-sm border border-ui-accent/35 bg-ui-accent/10 px-2 py-0.5 text-xs text-ui-accent-light">
              {t("bossSlots.inactive")}
            </span>
          )}
          <Button
            size="sm"
            className="mt-auto"
            disabled={pending}
            onClick={onClear}
          >
            {removePriceGold > 0
              ? t("bossSlots.clearPriced", {
                  gold: removePriceGold.toLocaleString(),
                })
              : t("bossSlots.clearFree")}
          </Button>
        </div>
      )}
    </div>
  );
}
