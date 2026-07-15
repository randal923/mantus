import type { ItemRarity } from "@tibia/protocol";

interface RarityStyle {
  name: string;
  typeLine: string;
  border: string;
  glow: string;
}

export const RARITY_STYLES: Readonly<Record<ItemRarity, RarityStyle>> = {
  common: {
    name: "text-ui-text-bright",
    typeLine: "text-ui-muted",
    border: "border-ui-stone-light/30",
    glow: "from-ui-stone-light/10",
  },
  uncommon: {
    name: "text-emerald-300",
    typeLine: "text-emerald-200/60",
    border: "border-emerald-400/35",
    glow: "from-emerald-400/15",
  },
  rare: {
    name: "text-sky-300",
    typeLine: "text-sky-200/60",
    border: "border-sky-400/35",
    glow: "from-sky-400/15",
  },
  epic: {
    name: "text-purple-300",
    typeLine: "text-purple-200/60",
    border: "border-purple-400/40",
    glow: "from-purple-400/15",
  },
  legendary: {
    name: "text-amber-300",
    typeLine: "text-amber-200/60",
    border: "border-amber-400/40",
    glow: "from-amber-300/20",
  },
};
