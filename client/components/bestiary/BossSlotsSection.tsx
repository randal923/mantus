"use client";

import { useState } from "react";
import {
  bossPointsLootBonus,
  type BossSlotsStateMessage,
  type BosstiaryStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { BossSlotCard } from "./BossSlotCard";
import { BossSlotPicker } from "./BossSlotPicker";

interface BossSlotsSectionProps {
  slots: BossSlotsStateMessage | null;
  /** Cached bosstiary catalog used to resolve names and outfits. */
  bosses: BosstiaryStateMessage | null;
  pending: boolean;
  error: string | null;
  onAssign: (slot: number, raceId: number) => void;
  onClear: (slot: number) => void;
}

/** Boss slot loadout: assignments, unlocks, and bonuses are server-side. */
export function BossSlotsSection({
  slots,
  bosses,
  pending,
  error,
  onAssign,
  onClear,
}: BossSlotsSectionProps) {
  const { t } = useAppTranslation();
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  if (!slots) {
    return (
      <section className="ui-panel-inset mt-4 rounded-sm border border-ui-stone-light/15 p-4">
        <p className="py-4 text-center text-sm text-ui-muted">
          {t("bossSlots.loading")}
        </p>
      </section>
    );
  }
  const bossByRaceId = new Map(
    (bosses?.entries ?? []).map((entry) => [entry.raceId, entry]),
  );
  const boostedBoss =
    slots.boosted !== null
      ? bossByRaceId.get(slots.boosted.raceId)
      : undefined;
  const unlockedBosses = slots.unlockedRaceIds
    .map((raceId) => bossByRaceId.get(raceId))
    .filter((entry) => entry !== undefined)
    .filter(
      (entry) =>
        !slots.slots.some((slot) => slot.raceId === entry.raceId) &&
        slots.boosted?.raceId !== entry.raceId,
    );

  return (
    <section
      aria-label={t("bossSlots.title")}
      className="ui-panel-inset mt-4 rounded-sm border border-ui-stone-light/15 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
          {t("bossSlots.title")}
        </h3>
        <span className="text-sm text-ui-muted">
          {t("bossSlots.points", {
            points: slots.bossPoints.toLocaleString(),
            percent: bossPointsLootBonus(slots.bossPoints),
          })}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.slots.map((entry) => (
          <BossSlotCard
            key={entry.slot}
            slotIndex={entry.slot}
            unlocked={
              entry.slot === 0 ? slots.slotOneUnlocked : slots.slotTwoUnlocked
            }
            entry={entry}
            boss={
              entry.raceId !== null
                ? bossByRaceId.get(entry.raceId)
                : undefined
            }
            pending={pending}
            removePriceGold={slots.nextRemovePriceGold}
            onAssign={() => setPickerSlot(entry.slot)}
            onClear={() => {
              setPickerSlot(null);
              onClear(entry.slot);
            }}
          />
        ))}

        <div className="ui-panel-inset flex min-h-44 flex-col rounded-sm border border-ui-gold/30 p-3">
          <h4 className="text-xs tracking-widest text-ui-gold uppercase">
            {t("bossSlots.boostedSlot")}
          </h4>
          {slots.boosted ? (
            <div className="mt-2 flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
              {boostedBoss && (
                <AnimatedOutfit outfit={boostedBoss.outfit} fit={64} />
              )}
              <span className="w-full truncate text-sm text-ui-text-bright capitalize">
                {boostedBoss?.name ?? t("bossSlots.unknownBoss")}
              </span>
              <span className="text-xs text-ui-muted">
                {t("bossSlots.kills", {
                  kills: slots.boosted.kills.toLocaleString(),
                })}
              </span>
              <span className="text-xs text-ui-gold">
                {t("bossSlots.boostedBonus", {
                  multiplier: slots.boosted.killBonus,
                  percent: slots.boosted.lootBonusPercent,
                })}
              </span>
            </div>
          ) : (
            <p className="my-auto py-4 text-center text-sm text-ui-muted">
              {t("bossSlots.noBoosted")}
            </p>
          )}
        </div>
      </div>

      {pickerSlot !== null && (
        <div className="mt-3">
          <BossSlotPicker
            bosses={unlockedBosses}
            pending={pending}
            onPick={(raceId) => {
              setPickerSlot(null);
              onAssign(pickerSlot, raceId);
            }}
            onCancel={() => setPickerSlot(null)}
          />
        </div>
      )}

      {error && !pending && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}
