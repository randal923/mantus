"use client";

import type { BestiaryCreatureEntry } from "@tibia/protocol";
import { normalizeHuntName } from "../../lib/hunt-finder/normalizeHuntName";
import { AnimatedOutfit } from "../bestiary/AnimatedOutfit";

interface HuntMonsterSpriteProps {
  name: string;
  creaturesByName: ReadonlyMap<string, BestiaryCreatureEntry>;
  fit?: number;
}

export function HuntMonsterSprite({
  name,
  creaturesByName,
  fit = 64,
}: HuntMonsterSpriteProps) {
  const creature = creaturesByName.get(normalizeHuntName(name));
  if (creature) return <AnimatedOutfit outfit={creature.outfit} fit={fit} />;

  return (
    <span
      aria-hidden
      className="flex size-12 items-center justify-center rounded-full border border-ui-stone-light/20 bg-black/40 font-display text-sm font-bold text-ui-muted"
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
