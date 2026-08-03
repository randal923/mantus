import type { ExerciseTrainingTarget } from "../progression/exerciseTraining";
import { CUSTOM_EXERCISE_TIERS } from "./CUSTOM_EXERCISE_TIERS";
import { EXERCISE_WEAPON_FAMILIES } from "./EXERCISE_WEAPON_FAMILIES";

export interface ExerciseWeaponDefinition {
  /** Which skill the weapon trains; "magic" spends mana instead. */
  readonly target: ExerciseTrainingTarget;
  /** Canary's allowFarUse: ranged and magic weapons reach across the screen. */
  readonly allowFarUse: boolean;
  /** Distance missile drawn from the trainer to the dummy, 0 for melee. */
  readonly missileId: number;
  /** Magic effect drawn on the dummy on every training hit. */
  readonly hitEffectId: number;
  /** Hits — and therefore charges — per hit of a stock exercise weapon. */
  readonly speedMultiplier: number;
}

/** CONST_ME_HITAREA, the puff Canary draws on the dummy every tick. */
const HIT_AREA = 10;

/**
 * Exercise and training weapons by catalog type id. Canary's four tiers are
 * transcribed from `data/scripts/actions/items/exercise_training_weapons.lua`
 * and differ only in charge count, so they share one row per family; the epic
 * and legendary tiers this server adds differ in pace and colour as well.
 */
const EXERCISE_WEAPONS: ReadonlyMap<number, ExerciseWeaponDefinition> = new Map(
  EXERCISE_WEAPON_FAMILIES.flatMap((family) => [
    ...family.canaryIds.map((id): [number, ExerciseWeaponDefinition] => [
      id,
      {
        target: family.target,
        allowFarUse: family.allowFarUse,
        missileId: family.missileId,
        hitEffectId: HIT_AREA,
        speedMultiplier: 1,
      },
    ]),
    ...CUSTOM_EXERCISE_TIERS.map(
      (tier): [number, ExerciseWeaponDefinition] => [
        family[tier.idKey],
        {
          target: family.target,
          allowFarUse: family.allowFarUse,
          // A melee weapon throws nothing; the tier's colour is the dummy's
          // hit effect alone.
          missileId: family.allowFarUse ? tier.missileId : 0,
          hitEffectId: tier.hitEffectId,
          speedMultiplier: tier.speedMultiplier,
        },
      ],
    ),
  ]),
);

export function getExerciseWeaponDefinition(
  typeId: number,
): ExerciseWeaponDefinition | undefined {
  return EXERCISE_WEAPONS.get(typeId);
}
