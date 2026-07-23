"use client";

import Image from "next/image";
import { useState } from "react";
import {
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type GemStateMessage,
  type WheelBaseVocation,
  type GemQuality,
  type WheelDomain,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import {
  domainIconStyle,
  gemIconStyle,
} from "../../lib/wheel/gemSheets";
import { Dropdown } from "../ui/Dropdown";
import { GemSheetIcon } from "./GemSheetIcon";

type GemQualityFilter = GemQuality | "all";
type GemDomainFilter = WheelDomain | "all";

interface GemListProps {
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  selectedGemId: string | null;
  onSelect: (gemId: string) => void;
}

/** Filterable grid of revealed gems. */
export function GemList({
  gems,
  vocation,
  selectedGemId,
  onSelect,
}: GemListProps) {
  const { t } = useAppTranslation();
  const [quality, setQuality] = useState<GemQualityFilter>("all");
  const [domain, setDomain] = useState<GemDomainFilter>("all");

  const equippedIds = new Set(Object.values(gems.equipped));
  const filtered = gems.revealed.filter(
    (gem) =>
      (quality === "all" || gem.quality === quality) &&
      (domain === "all" || gem.domain === domain),
  );

  return (
    <section className="ui-panel-inset flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-ui-stone-light/15">
      <header className="flex items-center justify-between gap-3 border-b border-ui-stone-light/15 bg-white/3 px-4 py-3">
        <h3 className="font-display text-sm tracking-wider text-ui-text-bright uppercase">
          {t("wheel.gems.collectionTitle")}
        </h3>
        <span className="rounded-full border border-ui-stone-light/15 bg-black/30 px-2 py-0.5 text-xs tabular-nums text-ui-muted">
          {t("wheel.gems.count", { count: filtered.length })}
        </span>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-ui-stone-light/10 p-3 text-sm">
        <Dropdown<GemQualityFilter>
          ariaLabel={t("wheel.gems.filters.quality")}
          value={quality}
          options={[
            {
              value: "all",
              label: t("wheel.gems.filters.allQualities"),
            },
            ...GEM_QUALITIES.map((value) => ({
              value,
              label: t(`wheel.gems.quality.${value}`),
            })),
          ]}
          onChange={setQuality}
          className="w-full sm:w-48"
        />
        <Dropdown<GemDomainFilter>
          ariaLabel={t("wheel.gems.filters.domain")}
          value={domain}
          options={[
            { value: "all", label: t("wheel.gems.filters.allDomains") },
            ...WHEEL_DOMAINS.map((value) => ({
              value,
              label: t(`wheel.domain.${value}`),
            })),
          ]}
          onChange={setDomain}
          className="w-full sm:w-48"
        />
      </div>
      {filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm leading-6 text-ui-muted">
          {t("wheel.gems.empty")}
        </p>
      ) : (
        <ul className="ui-scrollbar grid max-h-96 grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 overflow-y-auto p-3">
          {filtered.map((gem) => (
            <li key={gem.id}>
              <button
                type="button"
                onClick={() => onSelect(gem.id)}
                aria-pressed={selectedGemId === gem.id}
                className={`group relative flex min-h-28 w-full flex-col items-center rounded-md border p-3 text-center transition-[border-color,background-color,box-shadow] ${
                  selectedGemId === gem.id
                    ? "border-ui-accent-light/60 bg-ui-gold/10 shadow-inner shadow-ui-gold/10"
                    : "border-ui-stone-light/15 bg-black/25 hover:border-ui-gold/40 hover:bg-ui-gold/5"
                }`}
              >
                <span className="flex size-11 items-center justify-center rounded-full border border-ui-gold/15 bg-black/30 shadow-inner shadow-black/50">
                  <GemSheetIcon
                    style={gemIconStyle(vocation, gem.domain, gem.quality)}
                    label={t(`wheel.gems.quality.${gem.quality}`)}
                  />
                </span>
                <span className="mt-2 block w-full truncate text-xs text-ui-text-bright">
                  {t(`wheel.gems.quality.${gem.quality}`)}
                </span>
                <span className="mt-auto flex items-center gap-1 pt-1 text-xs text-ui-muted">
                  <GemSheetIcon style={domainIconStyle(gem.domain)} />
                  <span>{t(`wheel.domain.${gem.domain}`)}</span>
                </span>
                {gem.locked && (
                  <Image
                    src="/assets/wheel/icon-locked.png"
                    alt={t("wheel.gems.locked")}
                    title={t("wheel.gems.locked")}
                    width={8}
                    height={12}
                    className="absolute top-2 left-2 [image-rendering:pixelated]"
                  />
                )}
                {equippedIds.has(gem.id) && (
                  <span
                    title={t("wheel.gems.equipped")}
                    className="absolute top-2 right-2 size-2 rounded-full bg-ui-accent-light shadow-sm shadow-ui-accent"
                  >
                    <span className="sr-only">{t("wheel.gems.equipped")}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
