import type { WheelBaseVocation, WheelDomain } from "./wheel";
import { WHEEL_SLICES } from "./wheel";

/**
 * The five augment slice pairs; filling one slice of a pair grants the
 * spell's grade 1 boost, filling both grants grade 2 (Canary registers the
 * same spell on both slots and `upgradeSpell` bumps the grade per grant —
 * io_wheel.cpp:433-1045, player_wheel.cpp:2394-2396). Order matches the
 * augment tables in io_wheel.cpp `initialize*Spells`.
 */
export const WHEEL_AUGMENT_SLICE_PAIRS: ReadonlyArray<
  readonly [number, number]
> = [
  [6, 21],
  [8, 24],
  [11, 26],
  [13, 29],
  [16, 31],
];

/** Canary spell name per augment pair, by base vocation (io_wheel.cpp). */
export const WHEEL_AUGMENT_SPELLS: ReadonlyArray<
  Readonly<Record<WheelBaseVocation, string>>
> = [
  {
    Knight: "Front Sweep",
    Paladin: "Sharpshooter",
    Sorcerer: "Any_Focus_Mage_Spell",
    Druid: "Strong Ice Wave",
    Monk: "Sweeping Takedown",
  },
  {
    Knight: "Groundshaker",
    Paladin: "Strong Ethereal Spear",
    Sorcerer: "Magic Shield",
    Druid: "Mass Healing",
    Monk: "Mass Spirit Mend",
  },
  {
    Knight: "Chivalrous Challenge",
    Paladin: "Divine Dazzle",
    Sorcerer: "Sap Strength",
    Druid: "Nature's Embrace",
    Monk: "Mystic Repulse",
  },
  {
    Knight: "Intense Wound Cleansing",
    Paladin: "Swift Foot",
    Sorcerer: "Energy Wave",
    Druid: "Terra Wave",
    Monk: "Chained Penance",
  },
  {
    Knight: "Fierce Berserk",
    Paladin: "Divine Caldera",
    Sorcerer: "Great Fire Wave",
    Druid: "Heal Friend",
    Monk: "Flurry of Blows",
  },
];

/**
 * Revelation-granted spell grades: the domain's stage grants the spell that
 * many times (player_wheel.cpp:2714-2791). Divine Empowerment and Drain
 * Body use Canary's `i <= stageValue` loop, i.e. stage + 1 grants.
 */
const REVELATION_SPELL_GRADES: ReadonlyArray<{
  readonly domain: WheelDomain;
  readonly vocation: WheelBaseVocation;
  readonly spells: ReadonlyArray<string>;
  readonly extraGrant?: boolean;
}> = [
  { domain: "red", vocation: "Knight", spells: ["Executioner's Throw"] },
  { domain: "red", vocation: "Paladin", spells: ["Divine Grenade"] },
  { domain: "red", vocation: "Sorcerer", spells: ["Great Death Beam"] },
  { domain: "red", vocation: "Monk", spells: ["Spiritual Outburst"] },
  {
    domain: "blue",
    vocation: "Paladin",
    spells: ["Divine Empowerment"],
    extraGrant: true,
  },
  {
    domain: "blue",
    vocation: "Sorcerer",
    spells: ["Drain Body"],
    extraGrant: true,
  },
  { domain: "blue", vocation: "Druid", spells: ["Ice Burst", "Terra Burst"] },
  { domain: "purple", vocation: "Knight", spells: ["Avatar of Steel"] },
  { domain: "purple", vocation: "Paladin", spells: ["Avatar of Light"] },
  { domain: "purple", vocation: "Sorcerer", spells: ["Avatar of Storm"] },
  { domain: "purple", vocation: "Druid", spells: ["Avatar of Nature"] },
  { domain: "purple", vocation: "Monk", spells: ["Avatar of Balance"] },
];

const MAX_SPELL_GRADE = 3;

/**
 * Wheel spell grades (0..3) per Canary spell name, from a slice allocation
 * and the already-derived revelation stages. Grade boosts are cumulative at
 * application time (Canary Spell::getWheelOfDestinyBoost, spells.cpp:708).
 */
export function computeWheelSpellGrades(
  slices: ReadonlyArray<number>,
  vocation: WheelBaseVocation,
  revelationStages: Readonly<Record<WheelDomain, number>>,
): Readonly<Record<string, number>> {
  const grades: Record<string, number> = {};
  const add = (spell: string, amount: number) => {
    if (amount <= 0) return;
    grades[spell] = Math.min(
      MAX_SPELL_GRADE,
      (grades[spell] ?? 0) + amount,
    );
  };
  WHEEL_AUGMENT_SLICE_PAIRS.forEach((pair, index) => {
    const spell = WHEEL_AUGMENT_SPELLS[index]?.[vocation];
    if (!spell) return;
    const filled = pair.filter((sliceId) => {
      const definition = WHEEL_SLICES[sliceId - 1];
      return (
        definition !== undefined &&
        (slices[sliceId - 1] ?? 0) === definition.maxPoints
      );
    }).length;
    add(spell, filled);
  });
  for (const grant of REVELATION_SPELL_GRADES) {
    if (grant.vocation !== vocation) continue;
    const stage = revelationStages[grant.domain] ?? 0;
    if (stage <= 0) continue;
    for (const spell of grant.spells) {
      add(spell, stage + (grant.extraGrant ? 1 : 0));
    }
  }
  return grades;
}
