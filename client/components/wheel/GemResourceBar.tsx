"use client";

import Image from "next/image";
import type { GemResources } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { fragmentIconStyle } from "../../lib/wheel/gemSheets";
import { GemSheetIcon } from "./GemSheetIcon";

interface GemResourceBarProps {
  resources: GemResources;
}

/** Bank gold and fragment balances shared by both gem tabs. */
export function GemResourceBar({ resources }: GemResourceBarProps) {
  const { t } = useAppTranslation();
  return (
    <div className="flex flex-wrap items-center gap-4 rounded border border-ui-gold/15 bg-black/25 px-3 py-2 text-xs">
      <span className="flex items-center gap-1.5" title={t("wheel.gems.gold")}>
        <Image
          src="/assets/cyclopedia/currency/gold.png"
          alt=""
          aria-hidden
          width={12}
          height={12}
          className="[image-rendering:pixelated]"
        />
        <span className="text-ui-gold">
          {resources.gold.toLocaleString()}
        </span>
      </span>
      <span
        className="flex items-center gap-1.5"
        title={t("wheel.gems.lesserFragments")}
      >
        <GemSheetIcon style={fragmentIconStyle("lesser")} />
        {resources.lesserFragments}
      </span>
      <span
        className="flex items-center gap-1.5"
        title={t("wheel.gems.greaterFragments")}
      >
        <GemSheetIcon style={fragmentIconStyle("greater")} />
        {resources.greaterFragments}
      </span>
    </div>
  );
}
