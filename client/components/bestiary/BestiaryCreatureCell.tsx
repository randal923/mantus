"use client";

import type { BestiaryCreatureEntry } from "@tibia/protocol";
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
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.raceId)}
      title={entry.name}
      className="ui-panel-inset flex w-full flex-col items-center gap-1 rounded-sm border border-ui-stone-light/20 p-2 transition-colors hover:border-ui-gold/60 focus-visible:border-ui-gold focus-visible:outline-none"
    >
      <LazyMount
        placeholderHeight={64}
        className="flex h-16 items-center justify-center"
      >
        <AnimatedOutfit outfit={entry.outfit} fit={64} />
      </LazyMount>
      <span className="w-full truncate text-center text-sm text-ui-text-bright">
        {entry.name}
      </span>
      <span
        aria-label={`${entry.stage} / 4`}
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
