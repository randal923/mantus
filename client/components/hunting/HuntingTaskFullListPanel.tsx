"use client";

import { useState } from "react";
import {
  TASK_HUNTING_RULES,
  taskDifficultyForStars,
  taskHuntingOptionFor,
  type TaskHuntingSlot,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { Input } from "../ui/Input";
import { PreyCreatureSprite } from "../prey/PreyCreatureSprite";
import { RarityStars } from "../prey/RarityStars";

type TaskPoolEntry = TaskHuntingSlot["grid"][number];

interface HuntingTaskFullListPanelProps {
  pool: ReadonlyArray<TaskPoolEntry>;
  /** Zero-based slot currently in list-selection. */
  slot: number;
  /** The listed slot's rolled rarity; picks the displayed reward row. */
  slotRarity: number;
  pending: boolean;
  onSelect: (raceId: number, upgrade: boolean) => void;
}

/**
 * Searchable full monster list shown while a task slot is in list-selection.
 * Each row offers the standard and (bestiary-gated) upgraded goal; the
 * server re-validates the pick and the upgrade entitlement.
 */
export function HuntingTaskFullListPanel({
  pool,
  slot,
  slotRarity,
  pending,
  onSelect,
}: HuntingTaskFullListPanelProps) {
  const { t } = useAppTranslation();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? pool.filter((entry) => entry.name.toLowerCase().includes(needle))
    : pool;

  return (
    <section
      aria-label={t("huntingTasks.fullList.title")}
      className="flex flex-col gap-3 rounded-xl border border-ui-gold/15 bg-black/20 p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold tracking-wide text-ui-text-bright">
          {t("huntingTasks.fullList.title")}
        </h3>
        <span className="text-xs tracking-wide text-ui-muted uppercase">
          {t("huntingTasks.fullList.slot", { slot: slot + 1 })}
        </span>
      </header>
      <Input
        label={t("huntingTasks.fullList.searchLabel")}
        placeholder={t("huntingTasks.fullList.searchPlaceholder")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length === 0 ? (
        <p className="text-sm text-ui-muted">
          {t("huntingTasks.fullList.empty")}
        </p>
      ) : (
        <ul className="ui-scrollbar flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {matches.map((entry) => {
            const option = taskHuntingOptionFor(entry.stars, slotRarity);
            return (
              <li
                key={entry.raceId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ui-stone-light/15 bg-black/25 px-2 py-1.5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center">
                  <PreyCreatureSprite
                    lookTypeId={entry.lookTypeId}
                    fit={32}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-ui-text/85">
                    {entry.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <RarityStars
                      value={entry.stars}
                      max={TASK_HUNTING_RULES.maxStars}
                      label={t("huntingTasks.stars", {
                        value: entry.stars,
                        max: TASK_HUNTING_RULES.maxStars,
                      })}
                    />
                    <span className="text-xs tracking-wide text-ui-muted uppercase">
                      {t(
                        `huntingTasks.difficulty.${taskDifficultyForStars(entry.stars)}`,
                      )}
                    </span>
                  </span>
                </span>
                {option && (
                  <span className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`${t("huntingTasks.selectTask", { name: entry.name })} · ${t("huntingTasks.tierFirst")}`}
                      onClick={() => onSelect(entry.raceId, false)}
                      className="rounded-md border border-ui-stone-light/15 bg-black/30 px-2 py-1 text-xs tabular-nums text-ui-text/85 transition-colors hover:border-ui-gold/40 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("huntingTasks.tier", {
                        kills: option.firstKills,
                        points: option.firstReward,
                      })}
                    </button>
                    <button
                      type="button"
                      disabled={pending || !entry.upgradeUnlocked}
                      aria-label={`${t("huntingTasks.selectTask", { name: entry.name })} · ${t("huntingTasks.tierSecond")}`}
                      title={
                        entry.upgradeUnlocked
                          ? t("huntingTasks.tierSecond")
                          : t("huntingTasks.upgradeLocked")
                      }
                      onClick={() => onSelect(entry.raceId, true)}
                      className="rounded-md border border-ui-gold/25 bg-ui-gold-deep/20 px-2 py-1 text-xs tabular-nums text-ui-gold transition-colors hover:border-ui-gold/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("huntingTasks.tier", {
                        kills: option.secondKills,
                        points: option.secondReward,
                      })}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
