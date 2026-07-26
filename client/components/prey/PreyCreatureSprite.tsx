"use client";

import { useMemo } from "react";
import type { CreatureOutfit } from "@tibia/protocol";
import { AnimatedOutfit } from "../bestiary/AnimatedOutfit";

interface PreyCreatureSpriteProps {
  lookTypeId: number;
  /** Square box (px) the sprite fits into. */
  fit: number;
  className?: string;
}

/**
 * Prey and hunting-task monsters arrive as bare look type ids; this wraps
 * them in a stable uncolored outfit so the bestiary sprite pipeline renders
 * them without re-running its effect every parent render.
 */
export function PreyCreatureSprite({
  lookTypeId,
  fit,
  className,
}: PreyCreatureSpriteProps) {
  const outfit = useMemo<CreatureOutfit>(
    () => ({
      lookType: lookTypeId,
      head: 0,
      body: 0,
      legs: 0,
      feet: 0,
      addons: 0,
    }),
    [lookTypeId],
  );
  return <AnimatedOutfit outfit={outfit} fit={fit} className={className} />;
}
