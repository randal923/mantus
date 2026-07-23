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
import { gemIconStyle } from "../../lib/wheel/gemSheets";
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
    <section className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
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
