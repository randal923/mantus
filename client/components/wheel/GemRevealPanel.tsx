"use client";

import Image from "next/image";
import {
  GEM_QUALITIES,
  GEM_REVEAL_COSTS,
  type GemQuality,
  type GemStateMessage,
  type WheelBaseVocation,
} from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { gemIconStyle } from "../../lib/wheel/gemSheets";
import { Button } from "../ui/Button";
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

/** Reveal unrevealed gems for gold; mods are rolled by the server. */
export function GemRevealPanel({
  gems,
  vocation,
  pending,
  onReveal,
}: GemRevealPanelProps) {
  const { t, i18n } = useAppTranslation();
  return (
    <section className="ui-panel-inset overflow-hidden rounded-md border border-ui-stone-light/15">
      <header className="border-b border-ui-stone-light/15 bg-white/3 px-4 py-3">
        <h3 className="font-display text-sm tracking-wider text-ui-text-bright uppercase">
          {t("wheel.gems.reveal.title")}
        </h3>
      </header>
      <p className="border-b border-ui-stone-light/10 px-4 py-3 text-xs leading-5 text-ui-muted">
        {t("wheel.gems.reveal.help")}
      </p>
      <ul className="flex flex-col gap-2 p-3">
        {GEM_QUALITIES.map((quality) => {
          const owned = gems.resources[COUNT_KEYS[quality]];
          const cost = GEM_REVEAL_COSTS[quality];
          const hasGold = gems.resources.gold >= cost;
          return (
            <li
              key={quality}
              className="flex items-center gap-2 rounded-md border border-ui-stone-light/10 bg-black/20 p-2 text-sm"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded border border-ui-gold/15 bg-black/30">
                <GemSheetIcon
                  style={gemIconStyle(vocation, "green", quality)}
                  label={t(`wheel.gems.quality.${quality}`)}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ui-text-bright">
                  {t(`wheel.gems.quality.${quality}`)}
                </span>
                <span className="block text-xs text-ui-muted">
                  {t("wheel.gems.reveal.available", { count: owned })}
                </span>
                <span
                  className={`mt-1 flex items-center gap-1.5 text-xs tabular-nums ${
                    hasGold ? "text-ui-gold" : "text-ui-accent-light"
                  }`}
                >
                  <Image
                    src="/assets/cyclopedia/currency/gold.png"
                    alt=""
                    aria-hidden
                    width={12}
                    height={12}
                    className="[image-rendering:pixelated]"
                  />
                  {cost.toLocaleString(i18n.language)}
                </span>
              </span>
              <Button
                variant="primary"
                size="sm"
                disabled={pending || owned < 1 || !hasGold}
                onClick={() => onReveal(quality)}
              >
                {t("wheel.gems.reveal.button")}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
