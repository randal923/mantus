import type { Skill } from "@tibia/protocol";

/** Sums two per-skill boost maps without mutating either. */
export function combineSkillBoosts(
  first: Readonly<Partial<Record<Skill, number>>>,
  second: Readonly<Partial<Record<Skill, number>>>,
): Readonly<Partial<Record<Skill, number>>> {
  const entries = Object.entries(second) as ReadonlyArray<[Skill, number]>;
  if (entries.length === 0) return first;
  const combined: Partial<Record<Skill, number>> = { ...first };
  for (const [skill, value] of entries) {
    combined[skill] = (combined[skill] ?? 0) + value;
  }
  return combined;
}
