import type { ExerciseTrainingTarget } from "../progression/exerciseTraining";

export interface ExerciseWeaponDefinition {
  /** Which skill the weapon trains; "magic" spends mana instead. */
  readonly target: ExerciseTrainingTarget;
  /** Canary's allowFarUse: ranged and magic weapons reach across the screen. */
  readonly allowFarUse: boolean;
  /** Distance missile drawn from the trainer to the dummy, 0 for melee. */
  readonly missileId: number;
}

/** CONST_ANI_FIRE, CONST_ANI_SMALLICE, CONST_ANI_SIMPLEARROW. */
const FIRE = 4;
const SMALL_ICE = 37;
const SIMPLE_ARROW = 54;

/**
 * Every weapon's four tiers — training / exercise / durable / lasting — differ
 * only in charge count, so they share one row here.
 */
const WEAPON_TIERS: ReadonlyArray<{
  readonly ids: ReadonlyArray<number>;
  readonly definition: ExerciseWeaponDefinition;
}> = [
  {
    ids: [50292, 50293, 50294, 50295],
    definition: { target: "fist", allowFarUse: false, missileId: 0 },
  },
  {
    ids: [28540, 28552, 35279, 35285],
    definition: { target: "sword", allowFarUse: false, missileId: 0 },
  },
  {
    ids: [28541, 28553, 35280, 35286],
    definition: { target: "axe", allowFarUse: false, missileId: 0 },
  },
  {
    ids: [28542, 28554, 35281, 35287],
    definition: { target: "club", allowFarUse: false, missileId: 0 },
  },
  {
    ids: [44064, 44065, 44066, 44067],
    definition: { target: "shielding", allowFarUse: false, missileId: 0 },
  },
  {
    ids: [28543, 28555, 35282, 35288],
    definition: {
      target: "distance",
      allowFarUse: true,
      missileId: SIMPLE_ARROW,
    },
  },
  {
    ids: [28544, 28556, 35283, 35289],
    definition: { target: "magic", allowFarUse: true, missileId: SMALL_ICE },
  },
  {
    ids: [28545, 28557, 35284, 35290],
    definition: { target: "magic", allowFarUse: true, missileId: FIRE },
  },
];

/**
 * Exercise and training weapons by catalog type id, transcribed from Canary's
 * `data/scripts/actions/items/exercise_training_weapons.lua`.
 */
const EXERCISE_WEAPONS: ReadonlyMap<number, ExerciseWeaponDefinition> = new Map(
  WEAPON_TIERS.flatMap((tier) =>
    tier.ids.map((id): [number, ExerciseWeaponDefinition] => [
      id,
      tier.definition,
    ]),
  ),
);

export function getExerciseWeaponDefinition(
  typeId: number,
): ExerciseWeaponDefinition | undefined {
  return EXERCISE_WEAPONS.get(typeId);
}
