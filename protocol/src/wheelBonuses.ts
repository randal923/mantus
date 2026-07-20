import type { CharacterVocation } from "./character";
import {
  WHEEL_BASE_VOCATION,
  WHEEL_CONVICTION_VALUES,
  WHEEL_DEDICATION_RATES,
  WHEEL_DOMAINS,
  WHEEL_MITIGATION_PER_POINT,
  WHEEL_REVELATION_DAMAGE_HEALING,
  WHEEL_REVELATION_THRESHOLDS,
  WHEEL_SKILL_BOOST_TARGET,
  WHEEL_SLICES,
  type WheelDomain,
} from "./wheel";

export interface WheelBonuses {
  readonly maxHealth: number;
  readonly maxMana: number;
  readonly capacity: number;
  /** Mitigation multiplier bonus in percent (display + future combat use). */
  readonly mitigationPercent: number;
  readonly skillBoosts: {
    readonly melee: number;
    readonly distance: number;
    readonly magic: number;
    readonly fist: number;
  };
  readonly lifeLeechPercent: number;
  readonly manaLeechPercent: number;
  readonly revelationStages: Readonly<Record<WheelDomain, number>>;
  /** Flat damage and healing from revelation stages (future combat use). */
  readonly damageAndHealing: number;
}

export const EMPTY_WHEEL_BONUSES: WheelBonuses = {
  maxHealth: 0,
  maxMana: 0,
  capacity: 0,
  mitigationPercent: 0,
  skillBoosts: { melee: 0, distance: 0, magic: 0, fist: 0 },
  lifeLeechPercent: 0,
  manaLeechPercent: 0,
  revelationStages: { green: 0, red: 0, blue: 0, purple: 0 },
  damageAndHealing: 0,
};

/**
 * Derives every wheel perk from an allocation snapshot; recomputed from
 * scratch on load and on every save (reset-then-rebuild, like Canary).
 * Dedication perks scale per point; conviction perks require a full slice.
 */
export function computeWheelBonuses(
  slices: ReadonlyArray<number>,
  vocation: CharacterVocation,
): WheelBonuses {
  const base = WHEEL_BASE_VOCATION[vocation];
  const rates = WHEEL_DEDICATION_RATES[base];
  let maxHealth = 0;
  let maxMana = 0;
  let capacity = 0;
  let mitigationPercent = 0;
  const skillBoosts = { melee: 0, distance: 0, magic: 0, fist: 0 };
  let lifeLeechPercent = 0;
  let manaLeechPercent = 0;
  const domainPoints: Record<WheelDomain, number> = {
    green: 0,
    red: 0,
    blue: 0,
    purple: 0,
  };
  for (const definition of WHEEL_SLICES) {
    const points = slices[definition.id - 1] ?? 0;
    if (points <= 0) continue;
    domainPoints[definition.domain] += points;
    switch (definition.dedication) {
      case "health":
        maxHealth += rates.health * points;
        break;
      case "mana":
        maxMana += rates.mana * points;
        break;
      case "capacity":
        capacity += rates.capacity * points;
        break;
      case "mitigation":
        mitigationPercent += WHEEL_MITIGATION_PER_POINT * points;
        break;
      case "healthAndMana":
        maxHealth += rates.health * points;
        maxMana += rates.mana * points;
        break;
    }
    if (points !== definition.maxPoints) continue;
    switch (definition.conviction) {
      case "skill":
        skillBoosts[WHEEL_SKILL_BOOST_TARGET[base]] +=
          WHEEL_CONVICTION_VALUES.skillBoost;
        break;
      case "lifeLeech":
        lifeLeechPercent += WHEEL_CONVICTION_VALUES.lifeLeechPercent;
        break;
      case "manaLeech":
        manaLeechPercent += WHEEL_CONVICTION_VALUES.manaLeechPercent;
        break;
      default:
        break;
    }
  }
  const revelationStages = { green: 0, red: 0, blue: 0, purple: 0 };
  let damageAndHealing = 0;
  for (const domain of WHEEL_DOMAINS) {
    let stage = 0;
    for (const threshold of WHEEL_REVELATION_THRESHOLDS) {
      if (domainPoints[domain] >= threshold) stage += 1;
    }
    revelationStages[domain] = stage;
    if (stage > 0) {
      damageAndHealing += WHEEL_REVELATION_DAMAGE_HEALING[stage - 1] ?? 0;
    }
  }
  return {
    maxHealth,
    maxMana,
    capacity,
    mitigationPercent,
    skillBoosts,
    lifeLeechPercent,
    manaLeechPercent,
    revelationStages,
    damageAndHealing,
  };
}
