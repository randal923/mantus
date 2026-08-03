import type { SpellDefinition } from "../../Spell";

/**
 * Paladin blue revelation. Canary lays a 3x3 zone of owned items and buffs
 * the owner while they stand in it; here the +8 % damage rides a plain 5 s
 * self condition instead (zone semantics are a recorded deviation in
 * TODO.md). The grade-3 step raises it to +10 % via the augment table.
 */
export const utevoGravSan: SpellDefinition = {
  id: "utevo-grav-san",
  numericId: 268,
  sourcePath: "data/scripts/spells/support/divine_empowerment.lua",
  name: "Divine Empowerment",
  words: "utevo grav san",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Paladin", "Royal Paladin"],
  requiredLevel: 300,
  requiredMagicLevel: 0,
  manaCost: 500,
  soulCost: 0,
  groups: ["support"],
  cooldownMs: 32_000,
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
  effectId: 50,
  missileId: null,
  blockArmor: false,
  blockShield: false,
  area: { shape: "single" },
  dispel: null,
  condition: {
    type: "attributes",
    durationMs: 5000,
    damageDealtPercent: 108,
  },
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: null,
  wheelRevelation: { domain: "blue", minimumStage: 1 },
};
