import type { ExerciseTrainingTarget } from "../progression/exerciseTraining";

/**
 * Every exercise-weapon family, one row per skill trained.
 *
 * A family's tiers differ only in how many charges they carry, so the skill,
 * the reach and the missile live here once. `canaryIds` are Canary's four
 * stock tiers — training / exercise / durable / lasting, transcribed from
 * `data/scripts/actions/items/exercise_training_weapons.lua`. `epicId` and
 * `legendaryId` are this server's own two tiers: same weapons, ten times the
 * training speed, sold only in the Mantus Store.
 *
 * This is the single source for those ids. The item catalog mints types for
 * them, the store writes offers from them, and the training handler reads
 * their behaviour from them, so a new family is added in one place.
 */
export interface ExerciseWeaponFamily {
  /** Which skill the family trains; "magic" spends mana instead. */
  readonly target: ExerciseTrainingTarget;
  /** Canary's allowFarUse: ranged and magic weapons reach across the screen. */
  readonly allowFarUse: boolean;
  /** Distance missile the stock tiers draw, 0 for melee. */
  readonly missileId: number;
  /** training / exercise / durable / lasting; the last one is the appearance. */
  readonly canaryIds: readonly [number, number, number, number];
  readonly epicId: number;
  readonly legendaryId: number;
  /** How the store names the weapon: "Epic Exercise <noun>". */
  readonly noun: string;
  /** How an offer describes what it trains: "train <trains> on a dummy". */
  readonly trains: string;
}

/** CONST_ANI_FIRE, CONST_ANI_SMALLICE, CONST_ANI_SIMPLEARROW. */
const FIRE = 4;
const SMALL_ICE = 37;
const SIMPLE_ARROW = 54;

export const EXERCISE_WEAPON_FAMILIES: ReadonlyArray<ExerciseWeaponFamily> = [
  {
    target: "fist",
    allowFarUse: false,
    missileId: 0,
    canaryIds: [50_292, 50_293, 50_294, 50_295],
    epicId: 60_001,
    legendaryId: 60_101,
    noun: "Wraps",
    trains: "your fist skill",
  },
  {
    target: "sword",
    allowFarUse: false,
    missileId: 0,
    canaryIds: [28_540, 28_552, 35_279, 35_285],
    epicId: 60_002,
    legendaryId: 60_102,
    noun: "Sword",
    trains: "your sword fighting skill",
  },
  {
    target: "axe",
    allowFarUse: false,
    missileId: 0,
    canaryIds: [28_541, 28_553, 35_280, 35_286],
    epicId: 60_003,
    legendaryId: 60_103,
    noun: "Axe",
    trains: "your axe fighting skill",
  },
  {
    target: "club",
    allowFarUse: false,
    missileId: 0,
    canaryIds: [28_542, 28_554, 35_281, 35_287],
    epicId: 60_004,
    legendaryId: 60_104,
    noun: "Club",
    trains: "your club fighting skill",
  },
  {
    target: "shielding",
    allowFarUse: false,
    missileId: 0,
    canaryIds: [44_064, 44_065, 44_066, 44_067],
    epicId: 60_005,
    legendaryId: 60_105,
    noun: "Shield",
    trains: "your shielding skill",
  },
  {
    target: "distance",
    allowFarUse: true,
    missileId: SIMPLE_ARROW,
    canaryIds: [28_543, 28_555, 35_282, 35_288],
    epicId: 60_006,
    legendaryId: 60_106,
    noun: "Bow",
    trains: "your distance fighting skill",
  },
  {
    target: "magic",
    allowFarUse: true,
    missileId: SMALL_ICE,
    canaryIds: [28_544, 28_556, 35_283, 35_289],
    epicId: 60_007,
    legendaryId: 60_107,
    noun: "Rod",
    trains: "your magic level",
  },
  {
    target: "magic",
    allowFarUse: true,
    missileId: FIRE,
    canaryIds: [28_545, 28_557, 35_284, 35_290],
    epicId: 60_008,
    legendaryId: 60_108,
    noun: "Wand",
    trains: "your magic level",
  },
];
