import type { SpellDefinition } from "../../Spell";

/**
 * Knight red revelation. The 3-5 target chain (grade-driven) and the
 * low-health execute bonus live in the caster's chain resolution and
 * wheelExecutionersThrow; both re-read the wheel state per cast.
 */
export const exoriAmpKor: SpellDefinition = {
  id: "exori-amp-kor",
  numericId: 261,
  sourcePath: "data/scripts/spells/attack/executioners_throw.lua",
  name: "Executioner's Throw",
  words: "exori amp kor",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Knight", "Elite Knight"],
  requiredLevel: 300,
  requiredMagicLevel: 0,
  manaCost: 225,
  soulCost: 0,
  groups: ["attack"],
  cooldownMs: 18_000,
  groupCooldownMs: [2000],
  range: 5,
  lineOfSight: true,
  targetKind: "target",
  aggressive: false,
  needWeapon: true,
  damageType: "physical",
  formula: {
    kind: "skill",
    minimum: ({ level, skill, attack }) =>
      -1 * (skill * attack * 0.17 + 17 + level / 5) * 1.28,
    maximum: ({ level, skill, attack }) =>
      -1 * (skill * attack * 0.2 + 40 + level / 5) * 1.28,
  },
  effectId: 10,
  missileId: null,
  blockArmor: true,
  blockShield: false,
  area: { shape: "single" },
  chain: { maxTargets: 3, hopDistance: 3 },
  dispel: null,
  condition: null,
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: null,
  wheelRevelation: { domain: "red", minimumStage: 1 },
};
