import type { SpellDefinition } from "../../Spell";

/**
 * Paladin red revelation. The cast only arms the grenade: the impact
 * position clamps to 4 tiles of the caster (Canary getWithinRange) and the
 * 5x5 holy blast detonates 3 s later through the tick-owned queue. The
 * grade/stage damage multipliers live in the wheel augment table.
 */
export const exevoTempoMasSan: SpellDefinition = {
  id: "exevo-tempo-mas-san",
  numericId: 258,
  sourcePath: "data/scripts/spells/attack/divine_grenade.lua",
  name: "Divine Grenade",
  words: "exevo tempo mas san",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Paladin", "Royal Paladin"],
  requiredLevel: 300,
  requiredMagicLevel: 0,
  manaCost: 160,
  soulCost: 0,
  groups: ["attack"],
  cooldownMs: 26_000,
  groupCooldownMs: [2000],
  range: 7,
  lineOfSight: true,
  targetKind: "target",
  aggressive: false,
  needWeapon: false,
  damageType: "holy",
  formula: {
    kind: "level-magic",
    minimum: ({ level, magicLevel }) => level / 5 + magicLevel * 4,
    maximum: ({ level, magicLevel }) => level / 5 + magicLevel * 6,
  },
  effectId: 40,
  missileId: 38,
  blockArmor: false,
  blockShield: false,
  area: { shape: "circle", radius: 2 },
  delayed: { delayMs: 3000, clampRange: 4, fuseEffectId: 245 },
  dispel: null,
  condition: null,
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: null,
  wheelRevelation: { domain: "red", minimumStage: 1 },
};
