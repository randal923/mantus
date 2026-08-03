/**
 * The two exercise-weapon tiers this server adds on top of Canary's four.
 *
 * They train the same skills for the same tries per hit; what they change is
 * pace. `speedMultiplier` divides the interval between training hits, so a
 * tier that hits twice as fast also burns through its charges twice as fast —
 * the weapon is not stronger, it is quicker, and it is priced and stocked
 * accordingly.
 */
export interface CustomExerciseTier {
  /** Which id of a family this tier occupies. */
  readonly idKey: "epicId" | "legendaryId";
  /** Lowercase for the item name, title case for the store. */
  readonly slug: "epic" | "legendary";
  readonly label: string;
  /** Article for the item name: "an epic exercise sword". */
  readonly article: string;
  readonly charges: number;
  /** Mantus Coins, the only currency these are sold for. */
  readonly price: number;
  /** Hits (and charges) per hit of an ordinary exercise weapon. */
  readonly speedMultiplier: number;
  /** Magic effect drawn on the dummy on every hit. */
  readonly hitEffectId: number;
  /** Distance missile, replacing the family's own on far-use weapons. */
  readonly missileId: number;
  /** Tooltip line, so the tier's pace is on the item itself. */
  readonly description: string;
}

/** CONST_ME_PURPLE_ELECTRIC_SPARK and CONST_ME_ORANGE_ENERGY_SPARK. */
const PURPLE_LIGHTNING = 303;
const ORANGE_LIGHTNING = 177;
/** CONST_ANI_ENERGY (violet rings) and CONST_ANI_FIRE (orange bolt). */
const ENERGY_MISSILE = 5;
const FIRE_MISSILE = 4;

export const CUSTOM_EXERCISE_TIERS: ReadonlyArray<CustomExerciseTier> = [
  {
    idKey: "epicId",
    slug: "epic",
    label: "Epic",
    article: "an",
    charges: 14_000,
    price: 30,
    speedMultiplier: 5,
    hitEffectId: PURPLE_LIGHTNING,
    missileId: ENERGY_MISSILE,
    description:
      "Wreathed in purple lightning, it trains 5x as fast as an " +
      "ordinary exercise weapon and spends its charges just as fast.",
  },
  {
    idKey: "legendaryId",
    slug: "legendary",
    label: "Legendary",
    article: "a",
    charges: 30_000,
    price: 60,
    speedMultiplier: 5,
    hitEffectId: ORANGE_LIGHTNING,
    missileId: FIRE_MISSILE,
    description:
      "Wreathed in dark orange lightning, it trains 5x as fast as an " +
      "ordinary exercise weapon and spends its charges just as fast.",
  },
];
