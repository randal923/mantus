"use client";

import Image from "next/image";
import { useState } from "react";
import {
  GEM_QUALITIES,
  WHEEL_DOMAINS,
  type GemStateMessage,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemIconStyle } from "../../lib/wheel/gemSheets";
import { GemSheetIcon } from "./GemSheetIcon";

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
  const [quality, setQuality] = useState<string>("all");
  const [domain, setDomain] = useState<string>("all");

  const equippedIds = new Set(Object.values(gems.equipped));
  const filtered = gems.revealed.filter(
    (gem) =>
      (quality === "all" || gem.quality === quality) &&
      (domain === "all" || gem.domain === domain),
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 text-sm">
        <select
          value={quality}
          onChange={(event) => setQuality(event.target.value)}
          aria-label={t("wheel.gems.filters.quality")}
          className="ui-button-secondary rounded border border-ui-stone-light/15 bg-black/40 px-2 py-1"
        >
          <option value="all">{t("wheel.gems.filters.allQualities")}</option>
          {GEM_QUALITIES.map((value) => (
            <option key={value} value={value}>
              {t(`wheel.gems.quality.${value}`)}
            </option>
          ))}
        </select>
        <select
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          aria-label={t("wheel.gems.filters.domain")}
          className="ui-button-secondary rounded border border-ui-stone-light/15 bg-black/40 px-2 py-1"
        >
          <option value="all">{t("wheel.gems.filters.allDomains")}</option>
          {WHEEL_DOMAINS.map((value) => (
            <option key={value} value={value}>
              {t(`wheel.domain.${value}`)}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-ui-muted">
          {t("wheel.gems.count", { count: filtered.length })}
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded border border-ui-stone-light/10 bg-black/20 p-4 text-center text-sm text-ui-muted">
          {t("wheel.gems.empty")}
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-2">
          {filtered.map((gem) => (
            <li key={gem.id}>
              <button
                type="button"
                onClick={() => onSelect(gem.id)}
                aria-pressed={selectedGemId === gem.id}
                className={`relative flex w-full flex-col items-center rounded border p-2 ${
                  selectedGemId === gem.id
                    ? "border-ui-accent-light/60 bg-ui-gold/10"
                    : "border-ui-stone-light/15 bg-black/30 hover:border-ui-gold/40"
                }`}
              >
                <GemSheetIcon
                  style={gemIconStyle(vocation, gem.domain, gem.quality)}
                  label={t(`wheel.gems.quality.${gem.quality}`)}
                />
                {gem.locked && (
                  <Image
                    src="/assets/wheel/icon-locked.png"
                    alt={t("wheel.gems.locked")}
                    title={t("wheel.gems.locked")}
                    width={8}
                    height={12}
                    className="absolute top-0.5 left-0.5 [image-rendering:pixelated]"
                  />
                )}
                {equippedIds.has(gem.id) && (
                  <span
                    title={t("wheel.gems.equipped")}
                    className="absolute top-0.5 right-0.5 text-[9px] text-ui-accent-light"
                  >
                    ●
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
