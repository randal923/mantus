"use client";

import { useState } from "react";
import {
  GEM_BASIC_MODS,
  GEM_SUPREME_MODS,
  type GemAction,
  type GemActionFailedReason,
  type GemStateMessage,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemModLines } from "../../lib/wheel/gemModLines";
import { FragmentWorkshopGradePanel } from "./FragmentWorkshopGradePanel";
import { FragmentWorkshopModCard } from "./FragmentWorkshopModCard";
import type {
  FragmentWorkshopFilter,
  FragmentWorkshopModKind,
  FragmentWorkshopModOption,
} from "./FragmentWorkshopModOption";
import { GemResourceBar } from "./GemResourceBar";

interface FragmentWorkshopTabProps {
  gems: GemStateMessage | null;
  vocation: WheelBaseVocation;
  pending: boolean;
  error: GemActionFailedReason | null;
  onAction: (action: GemAction) => void;
}

interface FragmentWorkshopSelection {
  kind: FragmentWorkshopModKind;
  id: number;
}

const PAGE_SIZE = 30;

/** Fragment Workshop: Tibia-style grade ladder and paged mod grid. */
export function FragmentWorkshopTab({
  gems,
  vocation,
  pending,
  error,
  onAction,
}: FragmentWorkshopTabProps) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FragmentWorkshopFilter>("all");
  const [page, setPage] = useState(1);
  const [selection, setSelection] =
    useState<FragmentWorkshopSelection | null>(null);

  if (!gems) {
    return (
      <p className="p-6 text-center text-sm text-ui-muted">
        {t("wheel.gems.loading")}
      </p>
    );
  }

  const equippedIds = new Set(Object.values(gems.equipped));
  const supremeMods: FragmentWorkshopModOption[] = GEM_SUPREME_MODS.filter(
    (mod) => mod.vocations === "all" || mod.vocations.includes(vocation),
  ).map((mod) => {
    const grade =
      gems.grades.supreme.find((entry) => entry.modId === mod.id)?.grade ?? 0;
    return {
      kind: "supreme",
      id: mod.id,
      name: mod.name,
      grade,
      lines: gemModLines("supreme", mod.id, grade, vocation),
      owned: gems.revealed.filter((gem) => gem.supremeModId === mod.id).length,
      socketed: gems.revealed.some(
        (gem) => equippedIds.has(gem.id) && gem.supremeModId === mod.id,
      ),
    };
  });
  const basicMods: FragmentWorkshopModOption[] = GEM_BASIC_MODS.map((mod) => {
    const grade =
      gems.grades.basic.find((entry) => entry.modId === mod.id)?.grade ?? 0;
    return {
      kind: "basic",
      id: mod.id,
      name: undefined,
      grade,
      lines: gemModLines("basic", mod.id, grade, vocation),
      owned: gems.revealed.filter((gem) => gem.basicModIds.includes(mod.id))
        .length,
      socketed: gems.revealed.some(
        (gem) =>
          equippedIds.has(gem.id) && gem.basicModIds.includes(mod.id),
      ),
    };
  });
  const mods = [...supremeMods, ...basicMods];
  const normalizedSearch = search.trim().toLowerCase();
  const filteredMods = mods.filter((mod) => {
    if (
      normalizedSearch &&
      ![mod.name, ...mod.lines]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    ) {
      return false;
    }
    if (filter === "basic" || filter === "supreme") {
      return mod.kind === filter;
    }
    if (filter === "socketed") return mod.socketed;
    if (filter.startsWith("grade-")) {
      return mod.grade === Number(filter.slice(-1));
    }
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredMods.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageMods = filteredMods.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectedMod =
    filteredMods.find(
      (mod) => mod.kind === selection?.kind && mod.id === selection.id,
    ) ??
    pageMods[0] ??
    null;
  const filterOptions: ReadonlyArray<{
    value: FragmentWorkshopFilter;
    label: string;
  }> = [
    { value: "all", label: t("wheel.gems.workshop.filters.all") },
    { value: "basic", label: t("wheel.gems.workshop.basic") },
    { value: "supreme", label: t("wheel.gems.workshop.supreme") },
    { value: "socketed", label: t("wheel.gems.workshop.filters.socketed") },
    { value: "grade-0", label: t("wheel.gems.grade", { grade: "I" }) },
    { value: "grade-1", label: t("wheel.gems.grade", { grade: "II" }) },
    { value: "grade-2", label: t("wheel.gems.grade", { grade: "III" }) },
    { value: "grade-3", label: t("wheel.gems.grade", { grade: "IV" }) },
  ];

  return (
    <div className="flex min-h-full flex-col gap-3">
      {error && (
        <p
          role="alert"
          className="rounded border border-ui-accent/25 bg-ui-accent/10 px-3 py-2 text-sm text-ui-accent-light"
        >
          {t(`wheel.gems.errors.${error}`)}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)]">
        <FragmentWorkshopGradePanel
          mod={selectedMod}
          vocation={vocation}
          resources={gems.resources}
          pending={pending}
          onImprove={() => {
            if (!selectedMod) return;
            onAction({
              kind: "improve-grade",
              modKind: selectedMod.kind,
              modId: selectedMod.id,
            });
          }}
        />

        <section
          aria-labelledby="fragment-workshop-mods"
          className="flex min-w-0 flex-col gap-2"
        >
          <h3 id="fragment-workshop-mods" className="sr-only">
            {t("wheel.gems.workshop.mods")}
          </h3>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem] lg:grid-cols-[minmax(0,1fr)_10rem_minmax(12rem,1fr)]">
            <label className="relative min-w-0">
              <span className="sr-only">
                {t("wheel.gems.workshop.search")}
              </span>
              <input
                type="search"
                value={search}
                maxLength={50}
                placeholder={t("wheel.gems.workshop.searchPlaceholder")}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded border border-ui-stone-light/25 bg-black/30 px-3 pr-9 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/55"
              />
              {search && (
                <button
                  type="button"
                  aria-label={t("wheel.gems.workshop.clearSearch")}
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                  className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-ui-muted hover:bg-white/5 hover:text-ui-text-bright"
                >
                  ×
                </button>
              )}
            </label>
            <label>
              <span className="sr-only">
                {t("wheel.gems.workshop.filter")}
              </span>
              <select
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value as FragmentWorkshopFilter);
                  setPage(1);
                }}
                className="ui-dropdown h-9 w-full rounded border border-ui-stone-light/25 py-2 pr-3 pl-4 text-left text-sm leading-none text-ui-text-bright outline-none [text-align-last:left] focus:border-ui-gold/55"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <nav
              aria-label={t("wheel.gems.workshop.pagination")}
              className="flex h-9 items-center justify-between gap-2 rounded border border-ui-stone-light/20 bg-black/20 px-1.5 sm:col-span-2 lg:col-span-1"
            >
              <button
                type="button"
                disabled={currentPage <= 1}
                aria-label={t("wheel.gems.workshop.previousPage")}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                className="ui-button ui-button-secondary flex size-7 items-center justify-center rounded border border-ui-stone-light/20 disabled:opacity-40"
              >
                ‹
              </button>
              <span className="truncate text-center text-xs font-semibold tabular-nums text-ui-text">
                {t("wheel.gems.workshop.pageSummary", {
                  page: currentPage,
                  total: totalPages,
                  count: filteredMods.length,
                })}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                aria-label={t("wheel.gems.workshop.nextPage")}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
                className="ui-button ui-button-secondary flex size-7 items-center justify-center rounded border border-ui-stone-light/20 disabled:opacity-40"
              >
                ›
              </button>
            </nav>
          </div>

          <div className="ui-panel-inset min-h-[32rem] rounded-md border border-ui-stone-light/20 p-2">
            {pageMods.length > 0 ? (
              <ul
                aria-label={t("wheel.gems.workshop.mods")}
                className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5"
              >
                {pageMods.map((mod) => (
                  <li key={`${mod.kind}-${mod.id}`} className="min-w-0">
                    <FragmentWorkshopModCard
                      mod={mod}
                      selected={
                        selectedMod?.kind === mod.kind &&
                        selectedMod.id === mod.id
                      }
                      onSelect={() =>
                        setSelection({ kind: mod.kind, id: mod.id })
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex min-h-96 items-center justify-center px-6 text-center text-sm text-ui-muted">
                {t("wheel.gems.workshop.noMatches")}
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-ui-stone-light/15 pt-3">
        <GemResourceBar resources={gems.resources} />
      </div>
    </div>
  );
}
