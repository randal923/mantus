"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  BestiaryCreatureEntry,
  BestiaryMonsterStateMessage,
  ItemDisplayRarity,
  LootFilter,
  LootFilterItem,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useCreatureLootItems } from "../../hooks/useCreatureLootItems";
import { activeLootFilterEntries } from "../../lib/loot-filter/activeLootFilterEntries";
import { carriedLootFilterEntries } from "../../lib/loot-filter/carriedLootFilterEntries";
import { expandLootFilterItem } from "../../lib/loot-filter/expandLootFilterItem";
import { isLootFilterSelected } from "../../lib/loot-filter/isLootFilterSelected";
import { lootFilterRuleIndex } from "../../lib/loot-filter/lootFilterRuleIndex";
import { mergeLootFilterItems } from "../../lib/loot-filter/mergeLootFilterItems";
import { toggleLootFilterRule } from "../../lib/loot-filter/toggleLootFilterRule";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { LootFilterCreaturePanel } from "./LootFilterCreaturePanel";
import { LootFilterPane } from "./LootFilterPane";

/** Item types one search may draw; each gradable one expands to five cells. */
const MAX_SEARCH_TYPES = 60;

interface LootFilterModalProps {
  readonly filter: LootFilter;
  /** What the character is holding, split by rolled grade, from the server. */
  readonly carried: ReadonlyArray<LootFilterItem>;
  /** One ungraded entry per type the character carries or lists. */
  readonly types: ReadonlyArray<LootFilterItem>;
  /** Bestiary creatures, for the drop-table browser. */
  readonly creatures: ReadonlyArray<BestiaryCreatureEntry>;
  readonly monster: BestiaryMonsterStateMessage | null;
  readonly monsterPending: boolean;
  readonly onRequestMonster: (raceId: number) => void;
  readonly onChange: (filter: LootFilter) => void;
  readonly onClose: () => void;
}

/**
 * The auto-loot window. The top left pane lists what the character is
 * carrying, each stack at the grade it rolled; typing in its search box
 * replaces that with every item any creature in the game drops, there split
 * into one cell per grade for gear that rolls one. The top right pane is the
 * pick-up list itself — drag or click between the two — and the panel below
 * finds a creature and lists what it drops, grades and all, so a spot can be
 * filled without knowing the item's name.
 */
export function LootFilterModal({
  filter,
  carried,
  types,
  creatures,
  monster,
  monsterPending,
  onRequestMonster,
  onChange,
  onClose,
}: LootFilterModalProps) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const catalog = useCreatureLootItems();

  const rules = useMemo(() => lootFilterRuleIndex(filter), [filter]);
  const known = useMemo(
    () => mergeLootFilterItems(types, catalog.items),
    [types, catalog.items],
  );
  const carriedEntries = useMemo(
    () => carriedLootFilterEntries(carried),
    [carried],
  );

  const query = search.trim().toLowerCase();
  const searchEntries = useMemo(() => {
    if (query.length === 0) return [];
    return [...known.values()]
      .filter((item) => item.name.toLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, MAX_SEARCH_TYPES)
      .flatMap((item) => expandLootFilterItem(item));
  }, [known, query]);
  const activeEntries = useMemo(
    () => activeLootFilterEntries(filter, known),
    [filter, known],
  );

  const isSelected = useCallback(
    (typeId: number, rarity?: ItemDisplayRarity) =>
      isLootFilterSelected(rules, typeId, rarity),
    [rules],
  );
  const toggle = useCallback(
    (typeId: number, rarity?: ItemDisplayRarity) => {
      onChange(toggleLootFilterRule(filter, typeId, rarity));
    },
    [filter, onChange],
  );
  const remove = useCallback(
    (typeId: number, rarity?: ItemDisplayRarity) => {
      if (!isLootFilterSelected(rules, typeId, rarity)) return;
      onChange(toggleLootFilterRule(filter, typeId, rarity));
    },
    [filter, onChange, rules],
  );
  const add = useCallback(
    (typeId: number, rarity?: ItemDisplayRarity) => {
      if (isLootFilterSelected(rules, typeId, rarity)) return;
      onChange(toggleLootFilterRule(filter, typeId, rarity));
    },
    [filter, onChange, rules],
  );

  return (
    <Modal
      title={t("lootFilter.title")}
      size="extra-wide"
      onClose={onClose}
      footer={
        <>
          <Button
            disabled={filter.pickupRules.length === 0}
            onClick={() => onChange({ ...filter, pickupRules: [] })}
          >
            {t("lootFilter.reset")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("lootFilter.close")}
          </Button>
        </>
      }
    >
      {/* h-full, not flex-1: the modal body is a scroll container, so the
          panes only get their own scrollbars once this box has a height. */}
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Checkbox
          checked={filter.enabled}
          onChange={(event) =>
            onChange({ ...filter, enabled: event.currentTarget.checked })
          }
          label={
            <span className="flex flex-col">
              <span className="text-ui-text-bright">
                {t("lootFilter.enabled")}
              </span>
              <span className="text-xs text-ui-muted">
                {t("lootFilter.enabledDescription")}
              </span>
            </span>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          <LootFilterPane
            title={
              query.length === 0
                ? t("lootFilter.carried")
                : t("lootFilter.searchResults")
            }
            entries={query.length === 0 ? carriedEntries : searchEntries}
            emptyMessage={
              query.length === 0
                ? t("lootFilter.carriedEmpty")
                : t("lootFilter.searchEmpty")
            }
            isSelected={isSelected}
            toolbar={
              <Input
                name="loot-filter-search"
                type="search"
                autoComplete="off"
                placeholder={t("lootFilter.searchPlaceholder")}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                className="shrink-0"
              />
            }
            onActivateEntry={toggle}
            onDropEntry={remove}
          />
          <LootFilterPane
            title={t("lootFilter.selected")}
            entries={activeEntries}
            emptyMessage={t("lootFilter.selectedEmpty")}
            isSelected={isSelected}
            onActivateEntry={remove}
            onDropEntry={add}
          />
        </div>
        <LootFilterCreaturePanel
          creatures={creatures}
          monster={monster}
          pending={monsterPending}
          onRequestMonster={onRequestMonster}
          isSelected={isSelected}
          onToggleEntry={toggle}
        />
      </div>
    </Modal>
  );
}
