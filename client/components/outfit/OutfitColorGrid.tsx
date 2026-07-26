"use client";

import { useEffect, useState } from "react";
import type { RGB } from "../../lib/render/AssetStore";
import { getSharedAssetStore } from "../../lib/render/getSharedAssetStore";

interface OutfitColorGridProps {
  label: string;
  selected: number;
  onSelect: (index: number) => void;
}

/** The pinned 133-color outfit palette as a 19x7 swatch grid. */
export function OutfitColorGrid({
  label,
  selected,
  onSelect,
}: OutfitColorGridProps) {
  const [palette, setPalette] = useState<ReadonlyArray<RGB>>([]);

  useEffect(() => {
    let cancelled = false;
    const store = getSharedAssetStore();
    void store
      .load()
      .then(() => {
        if (!cancelled) setPalette(store.outfitPalette);
      })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : "unknown";
        console.warn(`failed to load the outfit palette: ${reason}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid w-fit grid-cols-[repeat(19,minmax(0,1fr))] gap-0.5"
    >
      {palette.map((color, index) => (
        <button
          key={index}
          type="button"
          role="radio"
          aria-checked={selected === index}
          aria-label={`${label} ${index}`}
          onClick={() => onSelect(index)}
          className={`size-4 rounded-xs border ${
            selected === index
              ? "border-ui-gold ring-1 ring-ui-gold/70"
              : "border-black/50 hover:border-ui-gold/60"
          }`}
          style={{
            backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
          }}
        />
      ))}
    </div>
  );
}
