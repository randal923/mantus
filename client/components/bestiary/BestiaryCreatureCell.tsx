"use client";

import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { AnimatedOutfit } from "./AnimatedOutfit";
import { LazyMount } from "./LazyMount";

interface BestiaryCreatureCellProps {
  entry: BestiaryCreatureEntry;
  onSelect: (raceId: number) => void;
}

/** One creature cell; the animated sprite mounts only while in view. */
export function BestiaryCreatureCell({
  entry,
  onSelect,
}: BestiaryCreatureCellProps) {
  const { t } = useAppTranslation();
  const locked = entry.stage === 0;

  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => onSelect(entry.raceId)}
      title={locked ? t("bestiary.unknown") : entry.name}
      className="ui-panel-inset flex w-full flex-col items-center gap-1 rounded-sm border border-ui-stone-light/20 p-2 transition-colors enabled:hover:border-ui-gold/60 disabled:opacity-70"
    >
      <LazyMount
        placeholderHeight={64}
        className="flex h-16 items-center justify-center"
      >
        <AnimatedOutfit outfit={entry.outfit} fit={64} silhouette={locked} />
      </LazyMount>
      <span className="w-full truncate text-center text-xs text-ui-text-bright">
        {locked ? t("bestiary.unknown") : entry.name}
      </span>
      <span
        aria-label={t("bestiary.stageOf", { stage: entry.stage })}
        className="flex gap-0.5"
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1.5 w-3 rounded-xs ${
              entry.stage >= step ? "bg-ui-gold" : "bg-black/50"
            }`}
          />
        ))}
      </span>
    </button>
  );
}
