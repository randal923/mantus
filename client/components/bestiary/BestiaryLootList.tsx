"use client";

import type { BestiaryLootEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BestiaryLootItem } from "./BestiaryLootItem";

const RARITY_KEYS = [
  "common",
  "uncommon",
  "semiRare",
  "rare",
  "veryRare",
] as const;

const RARITY_BORDERS = [
  "border-ui-stone-light/30",
  "border-green-500/60",
  "border-blue-400/60",
  "border-purple-400/70",
  "border-yellow-400/80",
] as const;

const RARITY_LABELS = [
  "text-ui-muted",
  "text-green-400",
  "text-blue-300",
  "text-purple-300",
  "text-yellow-300",
] as const;

interface BestiaryLootListProps {
  loot: ReadonlyArray<BestiaryLootEntry>;
}

/**
 * Drops grouped into Tibia's five rarity buckets, like the cyclopedia:
 * one labeled row per bucket.
 */
export function BestiaryLootList({ loot }: BestiaryLootListProps) {
  const { t } = useAppTranslation();
  const groups = RARITY_KEYS.map((key, rarity) => ({
    key,
    rarity,
    entries: loot.filter((entry) => entry.rarity === rarity),
  })).filter((group) => group.entries.length > 0);

  if (groups.length === 0) {
    return <p className="text-sm text-ui-muted">{t("bestiary.noLoot")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.key}>
          <span
            className={`text-xs tracking-widest uppercase ${RARITY_LABELS[group.rarity]}`}
          >
            {t(`bestiary.rarity.${group.key}`)}
          </span>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {group.entries.map((entry, index) => (
              <BestiaryLootItem
                key={`${entry.itemTypeId}-${index}`}
                entry={entry}
                borderClassName={RARITY_BORDERS[group.rarity]}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
