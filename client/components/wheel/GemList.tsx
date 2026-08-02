"use client";

import Image from "next/image";
import { useState } from "react";
import {
  GEM_QUALITIES,
  GEM_VOCATION_NAMES,
  WHEEL_DOMAINS,
  type GemQuality,
  type GemStateMessage,
  type WheelBaseVocation,
  type WheelDomain,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemModLines } from "../../lib/wheel/gemModLines";
import { domainIconStyle, gemIconStyle } from "../../lib/wheel/gemSheets";
import { FragmentWorkshopModArtwork } from "./FragmentWorkshopModArtwork";
import { GemSheetIcon } from "./GemSheetIcon";

type GemQualityFilter = GemQuality | "all";
type GemDomainFilter = WheelDomain | "all";

interface GemListProps {
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  selectedGemId: string | null;
  pending: boolean;
  onSelect: (gemId: string) => void;
  onToggleLock: (gemId: string) => void;
}

const PAGE_SIZE = 15;

/** Tibia's searchable, filterable, paged 5×3 revealed-gem grid. */
export function GemList({
  gems,
  vocation,
  selectedGemId,
  pending,
  onSelect,
  onToggleLock,
}: GemListProps) {
  const { t } = useAppTranslation();
  const [search, setSearch] = useState("");
  const [quality, setQuality] = useState<GemQualityFilter>("all");
  const [domain, setDomain] = useState<GemDomainFilter>("all");
  const [lockedOnly, setLockedOnly] = useState(false);
  const [page, setPage] = useState(1);

  const equippedIds = new Set(Object.values(gems.equipped));
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = gems.revealed.filter((gem) => {
    if (quality !== "all" && gem.quality !== quality) return false;
    if (domain !== "all" && gem.domain !== domain) return false;
    if (lockedOnly && !gem.locked) return false;
    if (!normalizedSearch) return true;

    const basicLines = gem.basicModIds.flatMap((modId) =>
      gemModLines(
        "basic",
        modId,
        gems.grades.basic.find((entry) => entry.modId === modId)?.grade ?? 0,
        vocation,
      ),
    );
    const supremeLines =
      gem.supremeModId === undefined
        ? []
        : gemModLines(
            "supreme",
            gem.supremeModId,
            gems.grades.supreme.find(
              (entry) => entry.modId === gem.supremeModId,
            )?.grade ?? 0,
            vocation,
          );
    const searchable = [
      t(`wheel.gems.gemName.${gem.quality}`, {
        name: GEM_VOCATION_NAMES[vocation],
      }),
      t(`wheel.domain.${gem.domain}`),
      ...basicLines,
      ...supremeLines,
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(normalizedSearch);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <section
      aria-labelledby="gem-collection-title"
      className="flex min-w-0 flex-col gap-2"
    >
      <h3 id="gem-collection-title" className="sr-only">
        {t("wheel.gems.collectionTitle")}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(8rem,1fr)_9rem_9rem_auto_minmax(12rem,1fr)]">
        <label className="relative min-w-0">
          <span className="sr-only">{t("wheel.gems.filters.search")}</span>
          <input
            type="search"
            value={search}
            maxLength={50}
            placeholder={t("wheel.gems.filters.searchPlaceholder")}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="h-9 w-full rounded border border-ui-stone-light/25 bg-black/30 px-3 pr-9 text-sm text-ui-text-bright outline-none placeholder:text-ui-muted focus:border-ui-gold/55"
          />
          {search && (
            <button
              type="button"
              aria-label={t("wheel.gems.filters.clearSearch")}
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
          <span className="sr-only">{t("wheel.gems.filters.domain")}</span>
          <select
            value={domain}
            onChange={(event) => {
              setDomain(event.target.value as GemDomainFilter);
              setPage(1);
            }}
            className="ui-dropdown h-9 w-full rounded border border-ui-stone-light/25 px-3 py-2 text-left text-sm leading-none text-ui-text-bright outline-none [text-align-last:left] focus:border-ui-gold/55"
          >
            <option value="all">{t("wheel.gems.filters.allAffinities")}</option>
            {WHEEL_DOMAINS.map((value) => (
              <option key={value} value={value}>
                {t(`wheel.domain.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">{t("wheel.gems.filters.quality")}</span>
          <select
            value={quality}
            onChange={(event) => {
              setQuality(event.target.value as GemQualityFilter);
              setPage(1);
            }}
            className="ui-dropdown h-9 w-full rounded border border-ui-stone-light/25 px-3 py-2 text-left text-sm leading-none text-ui-text-bright outline-none [text-align-last:left] focus:border-ui-gold/55"
          >
            <option value="all">{t("wheel.gems.filters.allQualities")}</option>
            {GEM_QUALITIES.map((value) => (
              <option key={value} value={value}>
                {t(`wheel.gems.quality.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap px-1 text-xs text-ui-text">
          <input
            type="checkbox"
            checked={lockedOnly}
            onChange={(event) => {
              setLockedOnly(event.target.checked);
              setPage(1);
            }}
            className="size-4 accent-ui-accent"
          />
          {t("wheel.gems.filters.lockedOnly")}
        </label>
        <nav
          aria-label={t("wheel.gems.filters.pagination")}
          className="flex h-9 items-center justify-between gap-2 rounded border border-ui-stone-light/20 bg-black/20 px-1.5 sm:col-span-2 lg:col-span-1"
        >
          <button
            type="button"
            disabled={currentPage <= 1}
            aria-label={t("wheel.gems.filters.previousPage")}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="ui-button ui-button-secondary flex size-7 items-center justify-center rounded border border-ui-stone-light/20 disabled:opacity-40"
          >
            ‹
          </button>
          <span className="truncate text-center text-xs font-semibold tabular-nums text-ui-text">
            {t("wheel.gems.filters.pageSummary", {
              page: currentPage,
              total: totalPages,
              count: filtered.length,
            })}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            aria-label={t("wheel.gems.filters.nextPage")}
            onClick={() =>
              setPage((value) => Math.min(totalPages, value + 1))
            }
            className="ui-button ui-button-secondary flex size-7 items-center justify-center rounded border border-ui-stone-light/20 disabled:opacity-40"
          >
            ›
          </button>
        </nav>
      </div>

      <div className="ui-panel-inset min-h-[21rem] rounded border border-ui-stone-light/20 p-1.5">
        {pageGems.length > 0 ? (
          <ul
            aria-label={t("wheel.gems.collectionTitle")}
            className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5"
          >
            {pageGems.map((gem) => {
              const mods = [
                ...gem.basicModIds.map((modId) => ({
                  kind: "basic" as const,
                  modId,
                  grade:
                    gems.grades.basic.find((entry) => entry.modId === modId)
                      ?.grade ?? 0,
                })),
                ...(gem.supremeModId === undefined
                  ? []
                  : [
                      {
                        kind: "supreme" as const,
                        modId: gem.supremeModId,
                        grade:
                          gems.grades.supreme.find(
                            (entry) => entry.modId === gem.supremeModId,
                          )?.grade ?? 0,
                      },
                    ]),
              ];
              const equipped = equippedIds.has(gem.id);
              const gemName = t(`wheel.gems.gemName.${gem.quality}`, {
                name: GEM_VOCATION_NAMES[vocation],
              });
              const label = [
                gemName,
                t(`wheel.domain.${gem.domain}`),
                ...mods.flatMap((mod) =>
                  gemModLines(
                    mod.kind,
                    mod.modId,
                    mod.grade,
                    vocation,
                  ),
                ),
                gem.locked ? t("wheel.gems.locked") : null,
                equipped ? t("wheel.gems.equipped") : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <li key={gem.id} className="relative min-w-0">
                  <button
                    type="button"
                    aria-pressed={selectedGemId === gem.id}
                    aria-label={label}
                    title={label}
                    onClick={() => onSelect(gem.id)}
                    className={`flex min-h-24 w-full flex-col items-center justify-between border bg-black/20 px-1 pt-2 pb-1 shadow-inner shadow-black/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-gold/80 ${
                      selectedGemId === gem.id
                        ? "border-ui-text-bright bg-white/6 ring-1 ring-inset ring-ui-text-bright/70"
                        : "border-ui-stone-light/25 hover:border-ui-stone-light/55 hover:bg-white/3"
                    }`}
                  >
                    <GemSheetIcon
                      style={gemIconStyle(
                        vocation,
                        gem.domain,
                        gem.quality,
                      )}
                    />
                    <span className="flex w-full items-end justify-center">
                      {mods.map((mod) => (
                        <FragmentWorkshopModArtwork
                          key={`${mod.kind}-${mod.modId}`}
                          kind={mod.kind}
                          modId={mod.modId}
                          grade={mod.grade}
                        />
                      ))}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={pending || equipped}
                    aria-label={
                      gem.locked
                        ? t("wheel.gems.actions.unlock")
                        : t("wheel.gems.actions.lock")
                    }
                    onClick={() => onToggleLock(gem.id)}
                    className="absolute top-1.5 left-1.5 z-10 flex size-6 items-center justify-center disabled:opacity-45"
                  >
                    <Image
                      src={
                        gem.locked
                          ? "/assets/wheel/icon-locked.png"
                          : "/assets/wheel/icon-unlocked.png"
                      }
                      alt=""
                      aria-hidden
                      width={8}
                      height={12}
                      className="[image-rendering:pixelated]"
                    />
                  </button>
                  {equipped && (
                    <span className="absolute top-1.5 right-1.5">
                      <GemSheetIcon style={domainIconStyle(gem.domain)} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex min-h-96 items-center justify-center px-6 text-center text-sm text-ui-muted">
            {t("wheel.gems.empty")}
          </p>
        )}
      </div>
    </section>
  );
}
