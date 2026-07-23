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
    <section className="ui-panel-inset overflow-hidden rounded-md border border-ui-stone-light/15">
      <header className="border-b border-ui-stone-light/15 bg-white/3 px-4 py-3">
        <h3 className="font-display text-sm tracking-wider text-ui-text-bright uppercase">
          {t("wheel.gems.vessels")}
        </h3>
      </header>
      <div className="grid grid-cols-2 gap-2 p-3">
        {WHEEL_DOMAINS.map((domain) => {
          const gemId = gems.equipped[domain];
          const gem = gems.revealed.find((entry) => entry.id === gemId);
          const resonance = resonances[domain] ?? 0;
          return (
            <button
              key={domain}
              type="button"
              disabled={!gem}
              onClick={() => gem && onSelectGem(gem.id)}
              title={t(`wheel.domain.${domain}`)}
              className="group flex min-h-36 flex-col items-center rounded-md border border-ui-stone-light/15 bg-black/25 p-3 text-center transition-[border-color,background-color] enabled:hover:border-ui-gold/45 enabled:hover:bg-ui-gold/5 disabled:cursor-default"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-ui-text-bright">
                <GemSheetIcon
                  style={domainIconStyle(domain)}
                  label={t(`wheel.domain.${domain}`)}
                />
                {t(`wheel.domain.${domain}`)}
              </span>
              <span className="my-2 flex size-12 items-center justify-center rounded-full border border-ui-gold/15 bg-black/30 shadow-inner shadow-black/60">
                {gem ? (
                  <GemSheetIcon
                    style={gemIconStyle(vocation, gem.domain, gem.quality)}
                    label={t(`wheel.gems.quality.${gem.quality}`)}
                  />
                ) : (
                  <span className="text-xl text-ui-muted/60">·</span>
                )}
              </span>
              <span className="min-h-5 text-xs text-ui-muted">
                {gem
                  ? t(`wheel.gems.quality.${gem.quality}`)
                  : t("wheel.gems.emptyVessel")}
              </span>
              <span
                className="mt-auto flex flex-col items-center gap-1 pt-2"
                aria-label={t("wheel.gems.resonanceCount", {
                  count: resonance,
                })}
              >
                <span aria-hidden className="flex gap-1">
                  {[1, 2, 3].map((level) => (
                    <span
                      key={level}
                      className={`h-1.5 w-5 rounded-full ${
                        level <= resonance
                          ? "bg-ui-accent-light shadow-sm shadow-ui-accent/50"
                          : "bg-ui-stone-light/15"
                      }`}
                    />
                  ))}
                </span>
                <span aria-hidden className="text-xs text-ui-muted">
                  {t("wheel.gems.resonanceCount", { count: resonance })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
