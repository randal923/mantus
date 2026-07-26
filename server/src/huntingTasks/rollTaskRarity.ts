import type { WorldActionRng } from "../action/WorldActionRng";

/**
 * Star (rarity) roll, transcribed from pinned Canary
 * TaskHuntingSlot::reloadReward (ioprey.cpp:214-248): strictly increasing —
 * 4★ and 5★ pin to 5★; below that the roll window narrows with the current
 * star so a reroll can never lower it.
 */
export function rollTaskRarity(current: number, rng: WorldActionRng): number {
  if (current >= 4) return 5;
  let chance: number;
  if (current === 1) chance = rng.integer(0, 70);
  else if (current === 2) chance = rng.integer(0, 45);
  else if (current === 3) chance = rng.integer(0, 20);
  else return current;
  if (chance <= 5) return 5;
  if (chance <= 20) return 4;
  if (chance <= 45) return 3;
  if (chance <= 70) return 2;
  return 1;
}
