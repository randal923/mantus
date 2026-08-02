"use client";

import Image from "next/image";
import {
  GEM_QUALITIES,
  GEM_REVEAL_COSTS,
  GEM_VOCATION_NAMES,
  type GemQuality,
  type GemStateMessage,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemLargeIconStyle } from "../../lib/wheel/gemLargeIconStyle";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemRevealPanelProps {
  gems: GemStateMessage;
  vocation: WheelBaseVocation;
  pending: boolean;
  onReveal: (quality: GemQuality) => void;
}

const COUNT_KEYS: Readonly<Record<GemQuality, keyof GemStateMessage["resources"]>> =
  {
    lesser: "lesserGems",
    regular: "regularGems",
    greater: "greaterGems",
  };

/** Tibia-style revelation column for converting unrevealed gem balances. */
export function GemRevealPanel({
  gems,
  vocation,
  pending,
  onReveal,
}: GemRevealPanelProps) {
  const { t, i18n } = useAppTranslation();

  return (
    <section className="ui-panel-inset overflow-hidden rounded border border-ui-stone-light/20">
      <header
        title={t("wheel.gems.reveal.help")}
        className="border-b border-ui-stone-light/15 bg-white/3 px-2 py-1 text-center"
      >
        <h3 className="font-display text-xs tracking-wide text-ui-text-bright uppercase">
          {t("wheel.gems.reveal.title")}
        </h3>
      </header>
      <ul className="divide-y divide-ui-stone-light/10 px-1.5">
        {GEM_QUALITIES.map((quality) => {
          const owned = gems.resources[COUNT_KEYS[quality]];
          const cost = GEM_REVEAL_COSTS[quality];
          const hasGold = gems.resources.gold >= cost;
          const enabled = !pending && owned > 0 && hasGold;

          return (
            <li key={quality} className="flex min-h-36 flex-col items-center py-2">
              <GemSheetIcon
                style={gemLargeIconStyle(vocation, "green", quality)}
                label={t(`wheel.gems.quality.${quality}`)}
              />
              <p className="mt-1 whitespace-nowrap text-center text-xs font-semibold leading-4 text-ui-text-bright">
                {t(`wheel.gems.gemName.${quality}`, {
                  name: GEM_VOCATION_NAMES[vocation],
                })}{" "}
                <span className="whitespace-nowrap text-ui-muted">
                  (× {owned})
                </span>
              </p>
              <div className="mt-auto flex w-full items-center gap-1.5 pt-2">
                <button
                  type="button"
                  aria-label={`${t("wheel.gems.reveal.button")} · ${t(
                    `wheel.gems.quality.${quality}`,
                  )}`}
                  disabled={!enabled}
                  onClick={() => onReveal(quality)}
                  className="h-[25px] w-20 shrink-0 bg-[url('/assets/wheel/reveal-button.png')] bg-[length:80px_75px] bg-no-repeat [image-rendering:pixelated] enabled:active:bg-[position:0_-25px] disabled:bg-[position:0_-50px]"
                />
                <span
                  className={`flex h-7 min-w-0 flex-1 items-center justify-end gap-1.5 rounded border border-ui-stone-light/20 bg-black/35 px-2 text-sm font-semibold tabular-nums ${
                    hasGold ? "text-ui-text" : "text-ui-accent-light"
                  }`}
                >
                  <span className="truncate">
                    {cost.toLocaleString(i18n.language)}
                  </span>
                  <Image
                    src="/assets/cyclopedia/currency/gold.png"
                    alt=""
                    aria-hidden
                    width={14}
                    height={14}
                    className="shrink-0 [image-rendering:pixelated]"
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
