"use client";

import { useMemo, useState } from "react";
import type { LootFilter, LootFilterItem } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { useCreatureLootItems } from "../../hooks/useCreatureLootItems";
import { mergeLootFilterItems } from "../../lib/loot-filter/mergeLootFilterItems";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { LootFilterPane } from "./LootFilterPane";

interface LootFilterModalProps {
  readonly filter: LootFilter;
  /** Item types the character carries, from the server. */
  readonly carried: ReadonlyArray<LootFilterItem>;
  /** Blacklisted types the character no longer carries, from the server. */
  readonly ignored: ReadonlyArray<LootFilterItem>;
  readonly onChange: (filter: LootFilter) => void;
  readonly onClose: () => void;
}

/**
 * The auto-loot window. The left pane lists what the character is carrying;
 * typing in its search box widens the list to every item any creature in the
 * game drops, so a drop can be blacklisted before it is ever picked up. The
 * right pane is the blacklist itself — drag or click between the two.
 */
export function LootFilterModal({
  filter,
  carried,
  ignored,
  onChange,
  onClose,
}: LootFilterModalProps) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const catalog = useCreatureLootItems();

  const ignoredTypeIds = useMemo(
    () => new Set(filter.ignoredItemTypeIds),
    [filter.ignoredItemTypeIds],
  );
  const known = useMemo(
    () => mergeLootFilterItems(carried, ignored, catalog.items),
    [carried, ignored, catalog.items],
  );

  const query = search.trim().toLowerCase();
  const sourcePane =
    query.length === 0
      ? carried
      : [...known.values()]
          .filter((item) => item.name.toLowerCase().includes(query))
          .sort((left, right) => left.name.localeCompare(right.name));
  const ignoredPane = filter.ignoredItemTypeIds.flatMap((typeId) => {
    const item = known.get(typeId);
    return item ? [item] : [];
  });

  const add = (typeId: number) => {
    if (ignoredTypeIds.has(typeId)) return;
    onChange({
      ...filter,
      ignoredItemTypeIds: [...filter.ignoredItemTypeIds, typeId],
    });
  };
  const remove = (typeId: number) => {
    if (!ignoredTypeIds.has(typeId)) return;
    onChange({
      ...filter,
      ignoredItemTypeIds: filter.ignoredItemTypeIds.filter(
        (candidate) => candidate !== typeId,
      ),
    });
  };

  return (
    <Modal
      title={t("lootFilter.title")}
      size="wide"
      onClose={onClose}
      footer={
        <>
          <Button
            disabled={filter.ignoredItemTypeIds.length === 0}
            onClick={() => onChange({ ...filter, ignoredItemTypeIds: [] })}
          >
            {t("lootFilter.reset")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("lootFilter.close")}
          </Button>
        </>
      }
    >
      <div className="flex h-[28rem] flex-col gap-3">
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
            items={sourcePane}
            ignoredTypeIds={ignoredTypeIds}
            emptyMessage={
              query.length === 0
                ? t("lootFilter.carriedEmpty")
                : t("lootFilter.searchEmpty")
            }
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
            onActivateItem={(typeId) =>
              ignoredTypeIds.has(typeId) ? remove(typeId) : add(typeId)
            }
            onDropItem={remove}
          />
          <LootFilterPane
            title={t("lootFilter.ignored")}
            items={ignoredPane}
            ignoredTypeIds={ignoredTypeIds}
            emptyMessage={t("lootFilter.ignoredEmpty")}
            onActivateItem={remove}
            onDropItem={add}
          />
        </div>
      </div>
    </Modal>
  );
}
