"use client";

import { useMemo, useState } from "react";
import type {
  BestiaryCreatureEntry,
  BestiaryMonsterStateMessage,
  ItemDisplayRarity,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { bestiaryLootFilterEntries } from "../../lib/loot-filter/bestiaryLootFilterEntries";
import { BestiaryCreatureCell } from "../bestiary/BestiaryCreatureCell";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { LootFilterItemTile } from "./LootFilterItemTile";

/**
 * How many creatures one search shows. Each cell animates an outfit, so the
 * grid is capped rather than scrolled endlessly — refining the word is
 * cheaper than mounting three hundred sprites.
 */
const MAX_RESULTS = 16;

interface LootFilterCreaturePanelProps {
  readonly creatures: ReadonlyArray<BestiaryCreatureEntry>;
  readonly monster: BestiaryMonsterStateMessage | null;
  readonly pending: boolean;
  readonly onRequestMonster: (raceId: number) => void;
  readonly isSelected: (typeId: number, rarity?: ItemDisplayRarity) => boolean;
  readonly onToggleEntry: (typeId: number, rarity?: ItemDisplayRarity) => void;
}

/**
 * The bottom half of the loot-filter window, one view at a time: search
 * turns it into a wall of creatures, picking one turns it into that
 * creature's drop table — at every grade — and the back button returns.
 * The tables are the bestiary's own: same request, same server-composed
 * tooltips.
 */
export function LootFilterCreaturePanel({
  creatures,
  monster,
  pending,
  onRequestMonster,
  isSelected,
  onToggleEntry,
}: LootFilterCreaturePanelProps) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null);

  const query = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (query.length === 0) return [];
    return creatures
      .filter((entry) => entry.name.toLowerCase().includes(query))
      .slice(0, MAX_RESULTS);
  }, [creatures, query]);
  const shown = monster?.raceId === selectedRaceId ? monster : null;
  const loot = useMemo(
    () => (shown ? bestiaryLootFilterEntries(shown.loot) : []),
    [shown],
  );
  const viewing = selectedRaceId !== null;
  const placeholder =
    query.length === 0
      ? t("lootFilter.creatureHint")
      : t("lootFilter.creatureEmpty");

  return (
    <section
      aria-label={t("lootFilter.creatures")}
      className="flex h-72 min-h-0 shrink-0 flex-col gap-3 rounded-lg border border-ui-stone-light/15 bg-black/20 p-3"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          {viewing && (
            <Button size="sm" onClick={() => setSelectedRaceId(null)}>
              {t("bestiary.back")}
            </Button>
          )}
          <h3 className="truncate font-display text-sm tracking-[0.1em] text-ui-gold uppercase">
            {viewing
              ? (shown?.name ?? t("bestiary.loading"))
              : t("lootFilter.creatures")}
          </h3>
        </span>
        <Input
          name="loot-filter-creature-search"
          type="search"
          autoComplete="off"
          placeholder={t("lootFilter.creatureSearchPlaceholder")}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            // A new search is a new question: drop back out of whatever drop
            // table is open instead of leaving stale results behind it.
            setSelectedRaceId(null);
          }}
          className="w-full sm:w-72"
        />
      </header>
      <div className="ui-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto pr-1">
        {viewing ? (
          loot.length > 0 ? (
            <ul className="flex flex-wrap content-start gap-2">
              {loot.map((entry) => (
                <li key={entry.key}>
                  <LootFilterItemTile
                    entry={entry}
                    selected={isSelected(entry.typeId, entry.rarity)}
                    onActivate={() => onToggleEntry(entry.typeId, entry.rarity)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex h-full items-center justify-center px-4 text-center text-sm text-ui-muted">
              {pending || !shown ? t("bestiary.loading") : t("bestiary.noLoot")}
            </p>
          )
        ) : results.length > 0 ? (
          <ul className="flex flex-wrap content-start gap-2">
            {results.map((entry) => (
              <li key={entry.raceId} className="w-28">
                <BestiaryCreatureCell
                  entry={entry}
                  onSelect={(raceId) => {
                    setSelectedRaceId(raceId);
                    if (monster?.raceId !== raceId) onRequestMonster(raceId);
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex h-full items-center justify-center px-4 text-center text-sm text-ui-muted">
            {placeholder}
          </p>
        )}
      </div>
    </section>
  );
}
