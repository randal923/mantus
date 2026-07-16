import { MAX_CHARACTER_LEVEL } from "@tibia/protocol";

export function getExperienceForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_CHARACTER_LEVEL) {
    throw new Error("character level is out of range");
  }
  return Math.floor(
    ((((level - 6) * level + 17) * level - 12) * 100) / 6,
  );
}
