import type { Player } from "../Player";
import type { SpellDefinition } from "./Spell";
import {
  WHEEL_AREA_CIRCLE5X5,
  WHEEL_AREA_WAVE7,
} from "./wheelUpgradedAreas";

export interface WheelAugmentGrade {
  /** Percent added to the rolled damage (Canary damageMultiplier). */
  readonly damagePercent?: number;
  /** Percent added to the rolled healing (Canary healingMultiplier). */
  readonly healPercent?: number;
  readonly criticalChance?: number;
  readonly criticalDamagePercent?: number;
  /** Always-on leech percent for this spell's damage. */
  readonly lifeLeechPercent?: number;
  readonly manaLeechPercent?: number;
  readonly manaCostReduction?: number;
  readonly cooldownReductionMs?: number;
  /** Applies to the spell's second cooldown group (Canary secondary group). */
  readonly secondaryGroupCooldownReductionMs?: number;
  /** Replaces the combat area at this grade. */
  readonly area?: SpellDefinition["area"];
  /** Overrides the spell condition's damage-dealt buff (Sap Strength). */
  readonly conditionDamageDealtPercent?: number;
  /** Extra chain targets (Chivalrous Challenge, Divine Dazzle). */
  readonly additionalTargets?: number;
  /** Extra pull/challenge duration for chain spells. */
  readonly durationExtensionMs?: number;
}

interface WheelSpellAugment {
  /** Key into `WheelBonuses.spellGrades` (the Canary spell/group name). */
  readonly grantName: string;
  /** Effects per grade, index 0 = grade 1; higher grades are cumulative. */
  readonly grades: ReadonlyArray<WheelAugmentGrade>;
}

/**
 * Wheel of Destiny spell augments for every *supported* catalog spell,
 * transcribed from Canary io_wheel.cpp `initialize*Spells` (grades 1-2) and
 * the revelation bonus registrations in player_wheel.cpp (grades 2-3 for
 * Twin Burst). Values follow Canary's units: percents raw, cooldowns in ms,
 * leech in percent. Unsupported spells (Sharpshooter, Swift Foot, Mass
 * Healing, Great Death Beam, the Monk set) gain their augments when they
 * ship.
 */
const AUGMENTS_BY_SPELL_ID: Readonly<Record<string, WheelSpellAugment>> = {
  // --- Knight (io_wheel.cpp:256-276) ----------------------------------
  "exori-min": {
    grantName: "Front Sweep",
    grades: [{ lifeLeechPercent: 5 }, { damagePercent: 14 }],
  },
  "exori-mas": {
    grantName: "Groundshaker",
    grades: [{ damagePercent: 13 }, { cooldownReductionMs: 2_000 }],
  },
  "exeta-amp-res": {
    grantName: "Chivalrous Challenge",
    grades: [{ manaCostReduction: 20 }, { additionalTargets: 1 }],
  },
  "exura-gran-ico": {
    grantName: "Intense Wound Cleansing",
    grades: [{ healPercent: 125 }, { cooldownReductionMs: 300_000 }],
  },
  "exori-gran": {
    grantName: "Fierce Berserk",
    grades: [{ manaCostReduction: 30 }, { damagePercent: 10 }],
  },
  // --- Paladin (io_wheel.cpp:278-299) ---------------------------------
  "exori-gran-con": {
    grantName: "Strong Ethereal Spear",
    grades: [{ cooldownReductionMs: 2_000 }, { damagePercent: 380 }],
  },
  "exana-amp-res": {
    grantName: "Divine Dazzle",
    grades: [
      { additionalTargets: 1 },
      { durationExtensionMs: 4_000, cooldownReductionMs: 4_000 },
    ],
  },
  "exevo-mas-san": {
    grantName: "Divine Caldera",
    grades: [{ manaCostReduction: 20 }, { damagePercent: 9 }],
  },
  // --- Sorcerer (io_wheel.cpp:301-322) --------------------------------
  "utamo-vita": {
    grantName: "Magic Shield",
    grades: [{}, { cooldownReductionMs: 6_000 }],
  },
  "exori-kor": {
    grantName: "Sap Strength",
    grades: [
      { area: WHEEL_AREA_CIRCLE5X5 },
      // sap_strength.lua:23-27: the UPGRADED grade debuffs to 80 instead of 90.
      { conditionDamageDealtPercent: 80 },
    ],
  },
  "exevo-vis-hur": {
    grantName: "Energy Wave",
    grades: [{ damagePercent: 5 }, { area: WHEEL_AREA_WAVE7 }],
  },
  "exevo-gran-flam-hur": {
    grantName: "Great Fire Wave",
    grades: [
      { criticalDamagePercent: 15, criticalChance: 10 },
      { damagePercent: 5 },
    ],
  },
  "exevo-gran-mas-frigo": {
    grantName: "Any_Focus_Mage_Spell",
    grades: [
      { damagePercent: 5 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
  "exevo-gran-mas-flam": {
    grantName: "Any_Focus_Mage_Spell",
    grades: [
      { damagePercent: 5 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
  "exevo-gran-mas-vis": {
    grantName: "Any_Focus_Mage_Spell",
    grades: [
      { damagePercent: 5 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
  "exevo-gran-mas-tera": {
    grantName: "Any_Focus_Mage_Spell",
    grades: [
      { damagePercent: 5 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
  // --- Druid (io_wheel.cpp:234-254) -----------------------------------
  "exevo-gran-frigo-hur": {
    grantName: "Strong Ice Wave",
    grades: [{ manaLeechPercent: 3 }, { damagePercent: 10 }],
  },
  "exura-gran-sio": {
    grantName: "Nature's Embrace",
    grades: [{ healPercent: 11 }, { cooldownReductionMs: 10_000 }],
  },
  "exevo-tera-hur": {
    grantName: "Terra Wave",
    grades: [{ damagePercent: 7 }, { lifeLeechPercent: 5 }],
  },
  "exura-sio": {
    grantName: "Heal Friend",
    grades: [{ manaCostReduction: 10 }, { healPercent: 6 }],
  },
  // --- Druid Twin Burst revelation (player_wheel.cpp:2247-2257) -------
  "exevo-ulus-frigo": {
    grantName: "Ice Burst",
    grades: [
      {},
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
  "exevo-ulus-tera": {
    grantName: "Terra Burst",
    grades: [
      {},
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
      { cooldownReductionMs: 4_000, secondaryGroupCooldownReductionMs: 4_000 },
    ],
  },
};

const EMPTY_AUGMENT: WheelAugmentGrade = {};

/**
 * The cumulative augment for a spell at the caster's current wheel grade,
 * re-read from the server-owned allocation at execution time (never from
 * the client). Returns the empty augment when nothing applies.
 */
export function wheelSpellAugmentFor(
  player: Player,
  spell: SpellDefinition,
): WheelAugmentGrade {
  const augment = AUGMENTS_BY_SPELL_ID[spell.id];
  if (!augment) return EMPTY_AUGMENT;
  const grade = player.wheelBonuses.spellGrades[augment.grantName] ?? 0;
  if (grade <= 0) return EMPTY_AUGMENT;
  const combined: {
    -readonly [K in keyof WheelAugmentGrade]: WheelAugmentGrade[K];
  } = {};
  for (const effects of augment.grades.slice(0, grade)) {
    if (effects.damagePercent) {
      combined.damagePercent =
        (combined.damagePercent ?? 0) + effects.damagePercent;
    }
    if (effects.healPercent) {
      combined.healPercent = (combined.healPercent ?? 0) + effects.healPercent;
    }
    if (effects.criticalChance) {
      combined.criticalChance =
        (combined.criticalChance ?? 0) + effects.criticalChance;
    }
    if (effects.criticalDamagePercent) {
      combined.criticalDamagePercent =
        (combined.criticalDamagePercent ?? 0) + effects.criticalDamagePercent;
    }
    if (effects.lifeLeechPercent) {
      combined.lifeLeechPercent =
        (combined.lifeLeechPercent ?? 0) + effects.lifeLeechPercent;
    }
    if (effects.manaLeechPercent) {
      combined.manaLeechPercent =
        (combined.manaLeechPercent ?? 0) + effects.manaLeechPercent;
    }
    if (effects.manaCostReduction) {
      combined.manaCostReduction =
        (combined.manaCostReduction ?? 0) + effects.manaCostReduction;
    }
    if (effects.cooldownReductionMs) {
      combined.cooldownReductionMs =
        (combined.cooldownReductionMs ?? 0) + effects.cooldownReductionMs;
    }
    if (effects.secondaryGroupCooldownReductionMs) {
      combined.secondaryGroupCooldownReductionMs =
        (combined.secondaryGroupCooldownReductionMs ?? 0) +
        effects.secondaryGroupCooldownReductionMs;
    }
    if (effects.additionalTargets) {
      combined.additionalTargets =
        (combined.additionalTargets ?? 0) + effects.additionalTargets;
    }
    if (effects.durationExtensionMs) {
      combined.durationExtensionMs =
        (combined.durationExtensionMs ?? 0) + effects.durationExtensionMs;
    }
    if (effects.area) combined.area = effects.area;
    if (effects.conditionDamageDealtPercent) {
      combined.conditionDamageDealtPercent =
        effects.conditionDamageDealtPercent;
    }
  }
  return combined;
}
