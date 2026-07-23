"use client";

import { useMemo, useState } from "react";
import type { WikiItemSource, WikiItemSourcesStateMessage } from "@tibia/protocol";
import { useWikiItems } from "../../hooks/useWikiItems";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import type { WikiItem } from "../../lib/wiki/WikiItem";
import {
  WIKI_ITEM_CATEGORIES,
  type WikiItemCategory,
} from "../../lib/wiki/WikiItemCategory";
import { getWikiItemCategory } from "../../lib/wiki/getWikiItemCategory";
import { WikiItemDetails } from "./WikiItemDetails";
import { WikiItemRow } from "./WikiItemRow";
import { WikiModalFrame, type WikiTab } from "./WikiModalFrame";

const PAGE_SIZE = 7;

interface WikiItemsProps {
  activeTab: WikiTab;
  itemSources: WikiItemSourcesStateMessage | null;
  sourcesPending: boolean;
  onRequestItemSources: (itemTypeId: number) => void;
  onSelectSource: (source: WikiItemSource) => void;
  onSelectTab: (tab: WikiTab) => void;
  onClose: () => void;
}

export function WikiItems({
  activeTab,
  itemSources,
  sourcesPending,
  onRequestItemSources,
  onSelectSource,
  onSelectTab,
  onClose,
}: WikiItemsProps) {
  const { t } = useAppTranslation();
  const { items, pending, error } = useWikiItems();
  const [category, setCategory] = useState<WikiItemCategory>("all");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [vocation, setVocation] = useState("");
  const [page, setPage] = useState(0);
  const [selectedItem, setSelectedItem] = useState<WikiItem | null>(null);

  const vocations = useMemo(
    () =>
      [
        ...new Set(
          items.flatMap((item) => item.requirements?.vocations ?? []),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [items],
  );
  const categoryCounts = useMemo(() => {
    const counts = new Map<WikiItemCategory, number>();
    counts.set("all", items.length);
    for (const item of items) {
      const itemCategory = getWikiItemCategory(item);
      counts.set(itemCategory, (counts.get(itemCategory) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedLevel = level === "" ? null : Number(level);
    return items.filter((item) => {
      if (category !== "all" && getWikiItemCategory(item) !== category) {
        return false;
      }
      if (normalizedQuery && !item.name.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      if (
        selectedLevel !== null &&
        item.requirements?.level !== undefined &&
        item.requirements.level > selectedLevel
      ) {
        return false;
      }
      if (
        vocation &&
        item.requirements?.vocations?.length &&
        !item.requirements.vocations.includes(vocation)
      ) {
        return false;
      }
      return true;
    });
  }, [category, items, level, query, vocation]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleItems = filteredItems.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  return (
    <WikiModalFrame
      activeTab={activeTab}
      pagination={{
        currentPage: currentPage + 1,
        totalPages,
        disabled: pending,
        onPrevious: () => setPage(currentPage - 1),
        onNext: () => setPage(currentPage + 1),
      }}
      onSelectTab={onSelectTab}
      onClose={onClose}
    >
      <>
      <div className="grid min-h-0 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="min-h-0">
          <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("wiki.items.categories.title")}
          </h3>
          <div className="ui-scrollbar mt-2 flex max-h-56 gap-2 overflow-auto pb-2 md:max-h-80 md:flex-col md:pb-0 md:pr-1">
            {WIKI_ITEM_CATEGORIES.map((itemCategory) => (
              <button
                key={itemCategory}
                type="button"
                onClick={() => {
                  setCategory(itemCategory);
                  setPage(0);
                }}
                className={`ui-button min-w-32 rounded-sm border px-3 py-2 text-left text-xs transition-colors md:w-full ${
                  category === itemCategory
                    ? "ui-button-primary border-ui-accent-light/45 text-ui-text-bright"
                    : "ui-button-secondary border-ui-stone-light/15 text-ui-muted hover:border-ui-gold/40 hover:text-ui-text"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span>{t(`wiki.items.categories.${itemCategory}`)}</span>
                  <span className="text-xs text-ui-muted">
                    {(categoryCounts.get(itemCategory) ?? 0).toLocaleString()}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <h3 className="mt-4 font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
            {t("wiki.items.filters")}
          </h3>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-1">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={level}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (!/^\d*$/.test(next)) return;
                setLevel(next);
                setPage(0);
              }}
              placeholder={t("wiki.items.level")}
              aria-label={t("wiki.items.level")}
              className="rounded-sm border border-ui-stone-light/20 bg-black/35 px-3 py-2 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/60"
            />
            <select
              value={vocation}
              onChange={(event) => {
                setVocation(event.target.value);
                setPage(0);
              }}
              aria-label={t("wiki.items.vocation")}
              className="ui-dropdown rounded-sm border border-ui-stone-light/20 px-3 py-2 text-sm text-ui-text-bright outline-none focus:border-ui-gold/60"
            >
              <option value="">{t("wiki.items.allVocations")}</option>
              {vocations.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="font-display text-xs font-bold tracking-widest text-ui-gold uppercase">
              {t("wiki.items.title")}
              <span className="ml-2 text-xs font-normal tracking-normal text-ui-muted normal-case">
                {t("wiki.items.count", {
                  count: filteredItems.length.toLocaleString(),
                })}
              </span>
            </h3>
            <label className="relative block sm:w-72">
              <span className="sr-only">{t("wiki.search")}</span>
              <svg
                aria-hidden
                viewBox="0 0 20 20"
                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ui-muted"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="8.5" cy="8.5" r="5" />
                <path d="m12.5 12.5 4 4" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                placeholder={t("wiki.search")}
                className="w-full rounded-sm border border-ui-stone-light/20 bg-black/35 py-2 pr-3 pl-9 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/60"
              />
            </label>
          </div>
          {pending && (
            <p className="py-12 text-center text-sm text-ui-muted">
              {t("wiki.items.loading")}
            </p>
          )}
          {error && (
            <p role="alert" className="py-12 text-center text-sm text-red-300">
              {t("wiki.items.error")}
            </p>
          )}
          {!pending && !error && (
            <ul className="flex flex-col gap-2">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <WikiItemRow
                    item={item}
                    fallbackType={t("wiki.items.categories.other")}
                    onSelect={(selected) => {
                      setSelectedItem(selected);
                      onRequestItemSources(selected.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
          {!pending && !error && visibleItems.length === 0 && (
            <p className="py-12 text-center text-sm text-ui-muted">
              {t("wiki.items.noResults")}
            </p>
          )}
        </section>
      </div>

      {selectedItem && (
        <WikiItemDetails
          item={selectedItem}
          sources={
            itemSources?.itemTypeId === selectedItem.id
              ? itemSources.sources
              : []
          }
          sourcesPending={sourcesPending}
          onSelectSource={onSelectSource}
          onClose={() => setSelectedItem(null)}
        />
      )}
      </>
    </WikiModalFrame>
  );
}
