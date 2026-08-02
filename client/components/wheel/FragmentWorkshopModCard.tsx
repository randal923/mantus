"use client";

import Image from "next/image";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { FragmentWorkshopModArtwork } from "./FragmentWorkshopModArtwork";
import type { FragmentWorkshopModOption } from "./FragmentWorkshopModOption";

interface FragmentWorkshopModCardProps {
  mod: FragmentWorkshopModOption;
  selected: boolean;
  onSelect: () => void;
}

const GRADE_NUMERALS = ["I", "II", "III", "IV"] as const;

/** One image-backed mod cell in the Fragment Workshop's paged grid. */
export function FragmentWorkshopModCard({
  mod,
  selected,
  onSelect,
}: FragmentWorkshopModCardProps) {
  const { t } = useAppTranslation();
  const grade = GRADE_NUMERALS[mod.grade] ?? GRADE_NUMERALS[0];
  const label = [mod.name, ...mod.lines, t("wheel.gems.grade", { grade })]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
      className={`relative flex min-h-20 w-full items-center justify-center border bg-black/20 shadow-inner shadow-black/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-gold/80 ${
        selected
          ? "border-ui-text-bright bg-white/6 ring-1 ring-inset ring-ui-text-bright/70"
          : "border-ui-stone-light/25 hover:border-ui-stone-light/55 hover:bg-white/3"
      }`}
    >
      {mod.socketed && (
        <Image
          src="/assets/wheel/icon-socketed.png"
          alt=""
          aria-hidden
          width={12}
          height={12}
          className="absolute top-2 left-2 [image-rendering:pixelated]"
        />
      )}
      {mod.owned > 0 && (
        <span className="absolute top-1.5 right-2 text-xs font-semibold tabular-nums text-ui-text">
          × {mod.owned}
        </span>
      )}
      <FragmentWorkshopModArtwork
        kind={mod.kind}
        modId={mod.id}
        grade={mod.grade}
      />
    </button>
  );
}
