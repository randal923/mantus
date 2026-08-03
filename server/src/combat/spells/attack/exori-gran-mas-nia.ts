import { flatDamageHealing } from "../../flatDamageHealing";
import type { SpellDefinition } from "../../Spell";

/** Canary spiritual_outburst.lua SPELL_BASE_POWER. */
const BASE_POWER = 42;

/**
 * Monk red revelation. Chains through up to six targets within two tiles of
 * each other. The harmony spender legs (echo recast at five harmony, the
 * harmony multiplier, cooldown clearing) wait on the harmony system and are
 * recorded deviations in TODO.md.
 */
export const exoriGranMasNia: SpellDefinition = {
  id: "exori-gran-mas-nia",
  numericId: 295,
  sourcePath: "data/scripts/spells/attack/spiritual_outburst.lua",
  name: "Spiritual Outburst",
  words: "exori gran mas nia",
  origin: "spell",
  runeItemTypeId: null,
  charges: null,
  vocations: ["Monk", "Exalted Monk"],
  requiredLevel: 0,
  requiredMagicLevel: 0,
  manaCost: 425,
  soulCost: 0,
  groups: ["attack"],
  cooldownMs: 24_000,
  groupCooldownMs: [2000],
  range: 0,
  lineOfSight: false,
  targetKind: "self",
  aggressive: false,
  needWeapon: false,
  damageType: "physical",
  formula: {
    kind: "skill",
    minimum: ({ level, skill, attack }) =>
      -1 *
      (BASE_POWER * (skill / 100) * (attack / 10) + flatDamageHealing(level)) *
      0.9,
    maximum: ({ level, skill, attack }) =>
      -1 *
      (BASE_POWER * (skill / 100) * (attack / 10) + flatDamageHealing(level)) *
      1.1,
  },
  effectId: 285,
  missileId: null,
  blockArmor: false,
  blockShield: false,
  area: { shape: "single" },
  chain: { maxTargets: 6, hopDistance: 2 },
  dispel: null,
  condition: null,
  casterEffectId: 0,
  conjure: null,
  castRules: null,
  worldAction: null,
  playerAction: null,
  wheelRevelation: { domain: "red", minimumStage: 1 },
};
