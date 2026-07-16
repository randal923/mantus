import { MAX_MAGIC_LEVEL, MAX_PROGRESSION_VALUE } from "@tibia/protocol";
import type { Vocation } from "./Vocation";

export function getManaForNextMagicLevel(
  vocation: Vocation,
  currentMagicLevel: number,
): number {
  if (
    !Number.isInteger(currentMagicLevel) ||
    currentMagicLevel < 0 ||
    currentMagicLevel > MAX_MAGIC_LEVEL
  ) {
    throw new Error("magic level is out of range");
  }
  if (currentMagicLevel === MAX_MAGIC_LEVEL) return 0;
  const mana =
    1_600 *
    vocation.magicProgressionMultiplier ** currentMagicLevel;
  return Math.min(MAX_PROGRESSION_VALUE, Math.floor(mana));
}
