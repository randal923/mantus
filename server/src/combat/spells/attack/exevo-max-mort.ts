import type { SpellDefinition } from "../../Spell";

/**
 * Sorcerer red revelation. The base beam is Canary's AREA_BEAM6; grades 2/3
 * lengthen it to BEAM7/BEAM8 through the augment table, and Beam Mastery's
 * per-target damage and cooldown refunds apply like the energy beams.
 */
export const exevoMaxMort: SpellDefinition = {
  id: "exevo-max-mort",
  numericId: 260,
  sourcePath: "data/scripts/spells/attack/great_death_beam.lua",
  name: "Great Death Beam",
  words: "exevo max mort",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Sorcerer", "Master Sorcerer"],
  requiredLevel: 300,
  requiredMagicLevel: 0,
  manaCost: 140,
  soulCost: 0,
  groups: ["attack", "greatbeams"],
  cooldownMs: 10_000,
  groupCooldownMs: [2000, 6000],
  range: 0,
  lineOfSight: false,
  targetKind: "direction",
  aggressive: false,
  needWeapon: false,
  damageType: "death",
  formula: {
    kind: "level-magic",
    minimum: ({ level, magicLevel }) => level / 5 + magicLevel * 5.5,
    maximum: ({ level, magicLevel }) => level / 5 + magicLevel * 9,
  },
  effectId: 18,
  missileId: null,
  blockArmor: false,
  blockShield: false,
  area: {
    shape: "tiles",
    offsets: [
      { x: 0, y: -5 },
      { x: 0, y: -4 },
      { x: 0, y: -3 },
      { x: 0, y: -2 },
      { x: 0, y: -1 },
      { x: 0, y: 0 },
    ],
    diagonalOffsets: [
      { x: -5, y: -5 },
      { x: -4, y: -4 },
      { x: -3, y: -3 },
      { x: -2, y: -2 },
      { x: -1, y: -1 },
      { x: 0, y: 0 },
    ],
    directional: true,
  },
  dispel: null,
  condition: null,
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: null,
  wheelRevelation: { domain: "red", minimumStage: 1 },
};
