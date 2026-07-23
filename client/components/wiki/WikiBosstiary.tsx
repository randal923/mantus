"use client";

import { useMemo, useState } from "react";
import {
  BOSS_CATEGORIES,
  type BossCategory,
  type BosstiaryBossStateMessage,
  type BosstiaryEntry,
  type BosstiaryStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BosstiaryCard } from "../bestiary/BosstiaryCard";
import { BosstiaryBossSheet } from "../bestiary/BosstiaryBossSheet";
import { BosstiaryCategoryIcon } from "../bestiary/BosstiaryCategoryIcon";
import { BosstiaryMilestoneIcon } from "../bestiary/BosstiaryMilestoneIcon";
import { Button } from "../ui/Button";
import { WikiModalFrame, type WikiTab } from "./WikiModalFrame";

const PAGE_SIZE = 8;
const EMPTY_ENTRIES: ReadonlyArray<BosstiaryEntry> = [];

interface WikiBosstiaryProps {
  activeTab: WikiTab;
  bosses: BosstiaryStateMessage | null;
  boss: BosstiaryBossStateMessage | null;
  pending: boolean;
  error: string | null;
  initialRaceId?: number;
  onRequestBoss: (raceId: number) => void;
  onSelectTab: (tab: WikiTab) => void;
  onClose: () => void;
}

export function WikiBosstiary({
  activeTab,
  bosses,
  boss,
  pending,
  error,
  initialRaceId,
  onRequestBoss,
  onSelectTab,
  onClose,
}: WikiBosstiaryProps) {
  const { t } = useAppTranslation();
  const [category, setCategory] = useState<"all" | BossCategory>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(
    initialRaceId ?? null,
  );
  const entries = bosses?.entries ?? EMPTY_ENTRIES;
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!normalizedQuery) return true;
      return entry.name.toLowerCase().includes(normalizedQuery);
    });
  }, [category, entries, query]);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleEntries = filteredEntries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const bossReady =
    selectedRaceId !== null && boss?.raceId === selectedRaceId;

  return (
    <WikiModalFrame
      activeTab={activeTab}
      pagination={
        selectedRaceId === null
          ? {
              currentPage: currentPage + 1,
              totalPages,
              disabled: pending,
              onPrevious: () => setPage(currentPage - 1),
              onNext: () => setPage(currentPage + 1),
            }
          : undefined
      }
      onSelectTab={onSelectTab}
      onClose={onClose}
    >
      {selectedRaceId !== null ? (
        <div>
          <Button
            className="mb-4"
            size="sm"
            onClick={() => setSelectedRaceId(null)}
          >
            {t("bestiary.back")}
          </Button>
          {bossReady ? (
            <BosstiaryBossSheet boss={boss} />
          ) : (
            <p className="py-12 text-center text-sm text-ui-muted">
              {t("bestiary.loading")}
            </p>
          )}
          {error && !pending && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {t(`bestiary.errors.${error}`, { defaultValue: error })}
            </p>
          )}
        </div>
      ) : (
      <>
      <section className="ui-panel-inset rounded-sm border border-ui-stone-light/15 p-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h3 className="font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
              {t("bosstiary.title")}
            </h3>
            <p className="mt-1 text-sm text-ui-muted">
              {t("bosstiary.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("wiki.bosstiary.filters")}>
            <button
              type="button"
              onClick={() => {
                setCategory("all");
                setPage(0);
              }}
              className={`ui-button min-w-24 rounded-sm border px-3 py-2 text-xs ${
                category === "all"
                  ? "ui-button-primary border-ui-accent-light/45 text-ui-text-bright"
                  : "ui-button-secondary border-ui-stone-light/15 text-ui-muted"
              }`}
            >
              {t("wiki.bosstiary.all")}
            </button>
            {BOSS_CATEGORIES.map((bossCategory) => (
              <button
                key={bossCategory}
                type="button"
                onClick={() => {
                  setCategory(bossCategory);
                  setPage(0);
                }}
                className={`ui-button min-w-24 rounded-sm border px-3 py-2 text-xs ${
                  category === bossCategory
                    ? "ui-button-primary border-ui-accent-light/45 text-ui-text-bright"
                    : "ui-button-secondary border-ui-stone-light/15 text-ui-muted"
                }`}
              >
                <span className="flex items-center justify-center gap-2">
                  <BosstiaryCategoryIcon category={bossCategory} />
                  {t(`bosstiary.category.${bossCategory}`)}
                </span>
              </button>
            ))}
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={t("wiki.search")}
              aria-label={t("wiki.search")}
              className="min-w-48 flex-1 rounded-sm border border-ui-stone-light/20 bg-black/35 px-3 py-2 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/60 lg:max-w-72"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ui-stone-light/10 pt-3 text-xs tracking-widest text-ui-muted uppercase">
          <span className="flex items-center gap-1">
            <BosstiaryMilestoneIcon active metal="bronze" />
            {t("wiki.bosstiary.prowess")}
          </span>
          <span className="flex items-center gap-1">
            <BosstiaryMilestoneIcon active metal="silver" />
            {t("wiki.bosstiary.expertise")}
          </span>
          <span className="flex items-center gap-1">
            <BosstiaryMilestoneIcon active metal="gold" />
            {t("wiki.bosstiary.mastery")}
          </span>
          {bosses && (
            <span className="ml-auto text-ui-gold">
              {t("bosstiary.bossPoints", {
                points: bosses.bossPoints.toLocaleString(),
              })}
            </span>
          )}
        </div>
      </section>

      {!bosses && (
        <p className="py-12 text-center text-sm text-ui-muted">
          {t("bestiary.loading")}
        </p>
      )}
      {bosses && (
        <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {visibleEntries.map((entry) => (
            <li key={entry.raceId}>
              <BosstiaryCard
                entry={entry}
                onSelect={(raceId) => {
                  setSelectedRaceId(raceId);
                  if (boss?.raceId !== raceId) onRequestBoss(raceId);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {bosses && visibleEntries.length === 0 && !pending && (
        <p className="py-12 text-center text-sm text-ui-muted">
          {query ? t("wiki.bosstiary.noResults") : t("bosstiary.empty")}
        </p>
      )}
      {error && !pending && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t(`bestiary.errors.${error}`, { defaultValue: error })}
        </p>
      )}

      </>
      )}
    </WikiModalFrame>
  );
}
