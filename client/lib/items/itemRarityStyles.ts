import type { ItemDisplayRarity } from "@tibia/protocol";

interface ItemRarityStyle {
  /** Slot/cell border colour. */
  readonly border: string;
  /** Text colour for a grade label. */
  readonly label: string;
  /** Soft inner glow, so a graded item reads at a glance in a full bag. */
  readonly glow: string;
}

/**
 * Tailwind needs literal class strings, so each grade carries its own set
 * (same pattern as ItemTooltip and BestiaryLootList). Shared by every grid
 * that draws items — inventory slots, trade offers, loot-filter cells — so a
 * legendary looks the same everywhere it appears.
 */
export const ITEM_RARITY_STYLES: Record<ItemDisplayRarity, ItemRarityStyle> = {
  common: {
    border: "border-rarity-common/50",
    label: "text-rarity-common",
    glow: "shadow-[inset_0_0_10px_rgba(168,173,181,0.18)]",
  },
  uncommon: {
    border: "border-rarity-uncommon/60",
    label: "text-rarity-uncommon",
    glow: "shadow-[inset_0_0_10px_rgba(123,179,86,0.28)]",
  },
  rare: {
    border: "border-rarity-rare/60",
    label: "text-rarity-rare",
    glow: "shadow-[inset_0_0_10px_rgba(217,178,60,0.28)]",
  },
  epic: {
    border: "border-rarity-epic/60",
    label: "text-rarity-epic",
    glow: "shadow-[inset_0_0_10px_rgba(166,120,212,0.30)]",
  },
  legendary: {
    border: "border-rarity-legendary/70",
    label: "text-rarity-legendary",
    glow: "shadow-[inset_0_0_12px_rgba(207,122,36,0.34)]",
  },
};
