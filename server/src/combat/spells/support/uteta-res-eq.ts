import type { SpellDefinition } from "../../Spell";

/**
 * Knight purple revelation: 15 s as lookType 1593 with 100 % crit and the
 * per-stage damage reduction; grades 2/3 cut the 2 h cooldown by 30 min
 * each through the augment table.
 */
export const utetaResEq: SpellDefinition = {
  id: "uteta-res-eq",
  numericId: 264,
  sourcePath: "data/scripts/spells/support/avatar_of_steel.lua",
  name: "Avatar of Steel",
  words: "uteta res eq",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Knight", "Elite Knight"],
  requiredLevel: 300,
  requiredMagicLevel: 0,
  manaCost: 800,
  soulCost: 0,
  groups: ["support"],
  cooldownMs: 7_200_000,
  groupCooldownMs: [2000],
  range: 0,
  lineOfSight: false,
  targetKind: "self",
  aggressive: false,
  needWeapon: false,
  damageType: "healing",
  formula: {
    kind: "fixed",
    minimum: () => 0,
    maximum: () => 0,
  },
  effectId: 244,
  missileId: null,
  blockArmor: false,
  blockShield: false,
  area: { shape: "single" },
  dispel: null,
  condition: null,
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: "avatar",
  wheelRevelation: { domain: "purple", minimumStage: 1 },
};
