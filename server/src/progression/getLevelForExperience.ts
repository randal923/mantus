import { MAX_CHARACTER_LEVEL } from "@tibia/protocol";
import { getExperienceForLevel } from "./getExperienceForLevel";

export function getLevelForExperience(experience: number): number {
  if (!Number.isSafeInteger(experience) || experience < 0) {
    throw new Error("experience is out of range");
  }
  let low = 1;
  let high = MAX_CHARACTER_LEVEL;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (getExperienceForLevel(middle) <= experience) low = middle;
    else high = middle - 1;
  }
  return low;
}
