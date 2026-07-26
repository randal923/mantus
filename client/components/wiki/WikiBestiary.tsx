"use client";

import { useMemo, useState } from "react";
import type {
  AnimusStateMessage,
  BestiaryCreatureEntry,
  BestiaryClass,
  BestiaryCreaturesStateMessage,
  BestiaryMonsterStateMessage,
  BoostedStateMessage,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { BestiaryCreatureCell } from "../bestiary/BestiaryCreatureCell";
import { BestiaryMonsterSheet } from "../bestiary/BestiaryMonsterSheet";
import { BoostedTodaySection } from "../boosted/BoostedTodaySection";
import { Button } from "../ui/Button";
import { WikiBestiaryClassCard } from "./WikiBestiaryClassCard";
import { WikiCurrencyIcon } from "./WikiCurrencyIcon";
import { WikiModalFrame, type WikiTab } from "./WikiModalFrame";

const PAGE_SIZE = 15;
const EMPTY_ENTRIES: ReadonlyArray<BestiaryCreatureEntry> = [];

type BestiaryView =
  | { readonly kind: "classes" }
  | { readonly kind: "class"; readonly className: BestiaryClass }
  | {
      readonly kind: "monster";
      readonly raceId: number;
      readonly className: BestiaryClass;
    };

interface WikiBestiaryProps {
  activeTab: WikiTab;
  creatures: BestiaryCreaturesStateMessage | null;
  monster: BestiaryMonsterStateMessage | null;
  boosted?: BoostedStateMessage | null;
  /** Animus mastery projection (mastered races + current bonus). */
  animus?: AnimusStateMessage | null;
  /** Races on the own kill tracker (server projection). */
  trackedRaceIds?: ReadonlyArray<number>;
  pending: boolean;
  error: string | null;
  initialRaceId?: number;
  onRequestMonster: (raceId: number) => void;
  onToggleTrack?: (raceId: number, enabled: boolean) => void;
  onSelectTab: (tab: WikiTab) => void;
  onClose: () => void;
}

export function WikiBestiary({
  activeTab,
  creatures,
  monster,
  boosted = null,
  animus = null,
  trackedRaceIds = [],
  pending,
  error,
  initialRaceId,
  onRequestMonster,
  onToggleTrack,
  onSelectTab,
  onClose,
}: WikiBestiaryProps) {
  const { t } = useAppTranslation();
  const initialEntry = creatures?.entries.find(
    (entry) => entry.raceId === initialRaceId,
  );
  const [view, setView] = useState<BestiaryView>(
    initialEntry
      ? {
          kind: "monster",
          raceId: initialEntry.raceId,
          className: initialEntry.className,
        }
      : { kind: "classes" },
  );
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const entries = creatures?.entries ?? EMPTY_ENTRIES;
  const sections = useMemo(() => {
    const grouped = new Map<BestiaryClass, typeof entries>();
    for (const entry of entries) {
      grouped.set(entry.className, [
        ...(grouped.get(entry.className) ?? []),
        entry,
      ]);
    }
    return [...grouped.entries()].map(([className, classEntries]) => ({
      className,
      entries: classEntries,
    }));
  }, [entries]);
  const normalizedQuery = query.trim().toLowerCase();
  const classEntries =
    view.kind === "class"
      ? entries.filter((entry) => entry.className === view.className)
      : entries;
  const searchedEntries = normalizedQuery
    ? classEntries.filter(
        (entry) => entry.name.toLowerCase().includes(normalizedQuery),
      )
    : classEntries;
  const showingClasses = view.kind === "classes" && !normalizedQuery;
  const totalResults = showingClasses ? sections.length : searchedEntries.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleSections = sections.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const visibleEntries = searchedEntries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const monsterReady =
    view.kind === "monster" && monster?.raceId === view.raceId;

  return (
    <WikiModalFrame
      activeTab={activeTab}
      pagination={
        view.kind === "monster"
          ? undefined
          : {
              currentPage: currentPage + 1,
              totalPages,
              disabled: pending,
              onPrevious: () => setPage(currentPage - 1),
              onNext: () => setPage(currentPage + 1),
            }
      }
      onSelectTab={onSelectTab}
      onClose={onClose}
    >
      <>
      {view.kind !== "monster" && (
        <div className="mb-4">
          <BoostedTodaySection boosted={boosted} />
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {view.kind !== "classes" && (
            <Button
              size="sm"
              onClick={() => {
                setQuery("");
                setPage(0);
                setView(
                  view.kind === "monster"
                    ? { kind: "class", className: view.className }
                    : { kind: "classes" },
                );
              }}
            >
              {t("bestiary.back")}
            </Button>
          )}
          <span className="min-w-0">
            <h3 className="font-display text-sm font-bold tracking-widest text-ui-gold uppercase">
              {view.kind === "classes"
                ? t("wiki.bestiary.classes")
                : view.kind === "class"
                  ? view.className
                  : monsterReady
                    ? monster.name
                    : t("bestiary.loading")}
            </h3>
            <p className="mt-1 text-sm text-ui-muted">
              {t("bestiary.subtitle")}
            </p>
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {creatures && (
              <span className="flex items-center gap-2 rounded-full border border-ui-gold/25 bg-black/25 px-3 py-1 text-sm text-ui-gold">
                <WikiCurrencyIcon name="charm" />
                {t("bestiary.charmPoints", {
                  points: creatures.charmPoints.toLocaleString(),
                })}
              </span>
            )}
            {animus && animus.raceIds.length > 0 && (
              <span
                title={t("bestiary.animus.title")}
                className="rounded-full border border-ui-accent-light/30 bg-black/25 px-3 py-1 text-sm text-ui-accent-light"
              >
                {t("bestiary.animus.chip", {
                  masteries: animus.raceIds.length,
                  bonus: (animus.bonusTenthsPercent / 10).toFixed(1),
                })}
              </span>
            )}
          </div>
          {view.kind !== "monster" && (
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder={t("bestiary.searchPlaceholder")}
              aria-label={t("bestiary.searchPlaceholder")}
              className="w-full rounded-sm border border-ui-stone-light/20 bg-black/35 px-3 py-2 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/60 sm:w-64"
            />
          )}
        </div>
      </div>

      {!creatures && (
        <p className="py-12 text-center text-sm text-ui-muted">
          {t("bestiary.loading")}
        </p>
      )}

      {creatures && view.kind !== "monster" && showingClasses && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visibleSections.map((section) => (
            <li key={section.className}>
              <WikiBestiaryClassCard
                className={section.className}
                entries={section.entries}
                onSelect={(className) => {
                  setView({ kind: "class", className });
                  setPage(0);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {creatures && view.kind !== "monster" && !showingClasses && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {visibleEntries.map((entry) => (
            <li key={entry.raceId}>
              <BestiaryCreatureCell
                entry={entry}
                onSelect={(raceId) => {
                  setView({
                    kind: "monster",
                    raceId,
                    className: entry.className,
                  });
                  if (monster?.raceId !== raceId) onRequestMonster(raceId);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {creatures &&
        view.kind !== "monster" &&
        !showingClasses &&
        visibleEntries.length === 0 && (
          <p className="py-12 text-center text-sm text-ui-muted">
            {t("bestiary.noResults")}
          </p>
        )}

      {view.kind === "monster" &&
        (monsterReady ? (
          <BestiaryMonsterSheet
            monster={monster}
            tracked={trackedRaceIds.includes(monster.raceId)}
            animusBonusTenthsPercent={
              animus?.raceIds.includes(monster.raceId)
                ? animus.bonusTenthsPercent
                : null
            }
            onToggleTrack={
              onToggleTrack
                ? (enabled) => onToggleTrack(monster.raceId, enabled)
                : undefined
            }
          />
        ) : (
          <p className="py-12 text-center text-sm text-ui-muted">
            {t("bestiary.loading")}
          </p>
        ))}

      {error && !pending && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t(`bestiary.errors.${error}`, { defaultValue: error })}
        </p>
      )}

      </>
    </WikiModalFrame>
  );
}
