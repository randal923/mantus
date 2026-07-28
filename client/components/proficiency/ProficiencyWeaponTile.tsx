"use client";

import type { ProficiencyWeaponState } from "@tibia/protocol";
import { useAppTranslation } from "../../i18n/useAppTranslation";
import { SpriteIcon } from "../inventory/SpriteIcon";
import { PixelImage } from "../ui/PixelImage";
import { PROFICIENCY_UI_SCALE } from "./proficiencyUiScale";

interface ProficiencyWeaponTileProps {
  weapon: ProficiencyWeaponState;
  /** Profile name from the static catalog; falls back to the id. */
  name: string;
  /** Representative item sprite, or null when unmapped. */
  spriteId: number | null;
  selected: boolean;
  onSelect: () => void;
}

/**
 * One tracked weapon as OTClient's ItemBox: a 34px item cell with a tiny
 * star per unlocked perk level along the bottom (gold once mastered).
 */
export function ProficiencyWeaponTile({
  weapon,
  name,
  spriteId,
  selected,
  onSelect,
}: ProficiencyWeaponTileProps) {
  const { t } = useAppTranslation();
  const scale = PROFICIENCY_UI_SCALE;
  const stars = Math.min(7, weapon.unlockedLevels);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={name}
      title={
        weapon.mastered ? `${name} · ${t("proficiency.mastered")}` : name
      }
      onClick={onSelect}
      className={`relative flex items-start justify-center overflow-hidden border bg-black/45 transition-colors ${
        selected
          ? "border-white"
          : "border-ui-stone-light/25 hover:border-ui-gold/50"
      }`}
      style={{ width: 34 * scale, height: 34 * scale }}
    >
      {spriteId === null ? (
        <span aria-hidden className="mt-1 text-base text-ui-muted">
          ?
        </span>
      ) : (
        <SpriteIcon spriteId={spriteId} scale={scale} />
      )}
      {stars > 0 && (
        <span className="absolute inset-x-0 bottom-0 flex justify-center gap-px bg-black/50">
          {Array.from({ length: stars }, (_, index) => (
            <PixelImage
              key={index}
              src={`ui/proficiency/icon-star-tiny-${
                weapon.mastered ? "gold" : "silver"
              }.png`}
              sheetWidth={5}
              sheetHeight={5}
              scale={1}
            />
          ))}
        </span>
      )}
    </button>
  );
}
