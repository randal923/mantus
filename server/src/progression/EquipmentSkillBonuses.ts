import type { Skill } from "@tibia/protocol";

/**
 * Equipment-derived skill and magic-level deltas, held on the progression so
 * every projection call site can read them without the item handler.
 * Display-only: combat re-reads the equipped items at execution time.
 */
export interface EquipmentSkillBonuses {
  readonly skills: Readonly<Partial<Record<Skill, number>>>;
  readonly magicLevel: number;
}

export const EMPTY_SKILL_BONUSES: EquipmentSkillBonuses = {
  skills: {},
  magicLevel: 0,
};

/** Value equality, so a per-tick sync only invalidates on a real change. */
export function sameSkillBonuses(
  left: EquipmentSkillBonuses,
  right: EquipmentSkillBonuses,
): boolean {
  if (left.magicLevel !== right.magicLevel) return false;
  const keys = new Set([
    ...Object.keys(left.skills),
    ...Object.keys(right.skills),
  ]);
  for (const key of keys) {
    const skill = key as Skill;
    if ((left.skills[skill] ?? 0) !== (right.skills[skill] ?? 0)) return false;
  }
  return true;
}
