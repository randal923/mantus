"use client";

import {
  WHEEL_DOMAINS,
  type GemStateMessage,
  type WheelBaseVocation,
  type WheelDomain,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { domainIconStyle, gemIconStyle } from "../../lib/wheel/gemSheets";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemVesselsProps {
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  resonances: Readonly<Record<WheelDomain, number>>;
  onSelectGem: (gemId: string) => void;
}

/**
 * The four domain vessels: equipped gem, and how many of its mods the
 * domain's resonance (maxed resonance slices, 0-3) currently activates.
 */
export function GemVessels({
  gems,
  vocation,
  resonances,
  onSelectGem,
}: GemVesselsProps) {
  const { t } = useAppTranslation();
  return (
    <section className="rounded border border-ui-gold/15 bg-black/25 p-3">
      <h3 className="mb-2 font-display text-sm tracking-wide text-ui-text-bright">
        {t("wheel.gems.vessels")}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {WHEEL_DOMAINS.map((domain) => {
          const gemId = gems.equipped[domain];
          const gem = gems.revealed.find((entry) => entry.id === gemId);
          return (
            <button
              key={domain}
              type="button"
              disabled={!gem}
              onClick={() => gem && onSelectGem(gem.id)}
              title={t(`wheel.domain.${domain}`)}
              className="flex flex-col items-center gap-1 rounded border border-ui-stone-light/15 bg-black/30 p-2 enabled:hover:border-ui-gold/40"
            >
              <GemSheetIcon
                style={domainIconStyle(domain)}
                label={t(`wheel.domain.${domain}`)}
              />
              {gem ? (
                <GemSheetIcon
                  style={gemIconStyle(vocation, gem.domain, gem.quality)}
                  label={t(`wheel.gems.quality.${gem.quality}`)}
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center text-lg text-ui-muted">
                  ·
                </span>
              )}
              <span className="text-[10px] text-ui-muted">
                {t("wheel.gems.resonanceCount", {
                  count: resonances[domain] ?? 0,
                })}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
