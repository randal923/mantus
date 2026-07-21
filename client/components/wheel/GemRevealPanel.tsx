"use client";

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
  const { t } = useAppTranslation();
  return (
    <section className="rounded border border-ui-gold/15 bg-black/25 p-3">
      <h3 className="mb-2 font-display text-sm tracking-wide text-ui-text-bright">
        {t("wheel.gems.reveal.title")}
      </h3>
      <p className="mb-2 text-[10px] leading-4 text-ui-muted">
        {t("wheel.gems.reveal.help")}
      </p>
      <ul className="flex flex-col gap-2">
        {GEM_QUALITIES.map((quality) => {
          const owned = gems.resources[COUNT_KEYS[quality]];
          const cost = GEM_REVEAL_COSTS[quality];
          return (
            <li key={quality} className="flex items-center gap-2 text-xs">
              <GemSheetIcon
                style={gemIconStyle(vocation, "green", quality)}
                label={t(`wheel.gems.quality.${quality}`)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {t(`wheel.gems.quality.${quality}`)} (x {owned})
                </span>
                <span className="block text-[10px] text-ui-gold">
                  {cost.toLocaleString()} {t("wheel.gems.goldSuffix")}
                </span>
              </span>
              <Button
                size="sm"
                disabled={pending || owned < 1 || gems.resources.gold < cost}
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
