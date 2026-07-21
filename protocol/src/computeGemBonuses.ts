import {
  GEM_GRADE_MULTIPLIERS,
  GEM_RESONANCE_SLICES,
  GEM_STAT_RATES,
  type GemResistElement,
} from "./gemAtelier";
import { WHEEL_SLICES } from "./wheel";
import { GEM_BASIC_MODS, GEM_SUPREME_MODS } from "./gemAtelierMods";
import type { GemGrades, RevealedGem } from "./gemAtelierMessages";
import type { WheelBaseVocation, WheelDomain } from "./wheel";

export interface GemBonusContribution {
  readonly maxHealth: number;
  readonly maxMana: number;
  readonly capacity: number;
  readonly mitigationPercent: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechPercent: number;
  readonly criticalDamagePercent: number;
  readonly dodgePercent: number;
  readonly resistances: Readonly<Record<GemResistElement, number>>;
  /** Extra revelation points per domain (Revelation Mastery supremes). */
  readonly revelationPoints: Readonly<Record<WheelDomain, number>>;
}

export const EMPTY_GEM_RESISTANCES: Readonly<Record<GemResistElement, number>> =
  {
    physical: 0,
    holy: 0,
    death: 0,
    fire: 0,
    earth: 0,
    ice: 0,
    energy: 0,
    "mana-drain": 0,
    "life-drain": 0,
  };

/** Vessel resonance per domain: how many of its 3 resonance slices are maxed. */
export function computeResonanceUnlocks(
  slices: ReadonlyArray<number>,
): Record<WheelDomain, number> {
  const unlocks: Record<WheelDomain, number> = {
    green: 0,
    red: 0,
    blue: 0,
    purple: 0,
  };
  for (const [domain, sliceIds] of Object.entries(GEM_RESONANCE_SLICES)) {
    for (const sliceId of sliceIds) {
      const definition = WHEEL_SLICES[sliceId - 1];
      if (definition && (slices[sliceId - 1] ?? 0) === definition.maxPoints) {
        unlocks[domain as WheelDomain] += 1;
      }
    }
  }
  return unlocks;
}

const basicModById = new Map(GEM_BASIC_MODS.map((mod) => [mod.id, mod]));
const supremeModById = new Map(GEM_SUPREME_MODS.map((mod) => [mod.id, mod]));

const gradeOf = (
  entries: ReadonlyArray<{ modId: number; grade: number }>,
  modId: number,
): number => entries.find((entry) => entry.modId === modId)?.grade ?? 0;

/**
 * Effects of the gems equipped in the wheel's vessels. A domain's resonance
 * level (0..3 maxed resonance slices) gates how many of its gem's mods
 * apply: 1 = first basic mod, 2 = second, 3 = the supreme mod. Spell-augment
 * supreme mods are display-only and contribute nothing here (TODO.md).
 */
export function computeGemBonuses(
  equippedGems: ReadonlyArray<RevealedGem>,
  grades: GemGrades,
  resonances: Readonly<Record<WheelDomain, number>>,
  vocation: WheelBaseVocation,
): GemBonusContribution {
  const rates = GEM_STAT_RATES[vocation];
  let maxHealth = 0;
  let maxMana = 0;
  let capacity = 0;
  let mitigationPercent = 0;
  let lifeLeechPercent = 0;
  let manaLeechPercent = 0;
  let criticalDamagePercent = 0;
  let dodgePercent = 0;
  const resistances: Record<GemResistElement, number> = {
    ...EMPTY_GEM_RESISTANCES,
  };
  const revelationPoints: Record<WheelDomain, number> = {
    green: 0,
    red: 0,
    blue: 0,
    purple: 0,
  };

  const applyBasicMod = (modId: number) => {
    const mod = basicModById.get(modId);
    if (!mod) return;
    const multiplier =
      GEM_GRADE_MULTIPLIERS[gradeOf(grades.basic, modId)] ?? 1;
    for (const effect of mod.effects) {
      switch (effect.kind) {
        case "resistance":
          resistances[effect.element] +=
            effect.percent * (effect.scalesWithGrade ? multiplier : 1);
          break;
        case "mitigation":
          mitigationPercent += effect.percent * multiplier;
          break;
        case "stat": {
          const value = Math.round(
            ((effect.step * rates[effect.stat]) / 100) * multiplier,
          );
          if (effect.stat === "health") maxHealth += value;
          if (effect.stat === "mana") maxMana += value;
          if (effect.stat === "capacity") capacity += value;
          break;
        }
      }
    }
  };

  const applySupremeMod = (modId: number) => {
    const mod = supremeModById.get(modId);
    if (!mod) return;
    const multiplier =
      GEM_GRADE_MULTIPLIERS[gradeOf(grades.supreme, modId)] ?? 1;
    const effect = mod.effect;
    switch (effect.kind) {
      case "dodge":
        dodgePercent += effect.percent * multiplier;
        break;
      case "critical-damage":
        criticalDamagePercent += effect.percent * multiplier;
        break;
      case "life-leech":
        lifeLeechPercent += effect.percent * multiplier;
        break;
      case "mana-leech":
        manaLeechPercent += effect.percent * multiplier;
        break;
      case "revelation":
        revelationPoints[effect.domain] += Math.round(
          effect.points * multiplier,
        );
        break;
      case "spell":
        break;
    }
  };

  for (const gem of equippedGems) {
    const resonance = resonances[gem.domain] ?? 0;
    if (resonance >= 1 && gem.basicModIds[0] !== undefined) {
      applyBasicMod(gem.basicModIds[0]);
    }
    if (
      resonance >= 2 &&
      gem.quality !== "lesser" &&
      gem.basicModIds[1] !== undefined
    ) {
      applyBasicMod(gem.basicModIds[1]);
    }
    if (
      resonance >= 3 &&
      gem.quality === "greater" &&
      gem.supremeModId !== undefined
    ) {
      applySupremeMod(gem.supremeModId);
    }
  }

  return {
    maxHealth,
    maxMana,
    capacity,
    mitigationPercent,
    lifeLeechPercent,
    manaLeechPercent,
    criticalDamagePercent,
    dodgePercent,
    resistances,
    revelationPoints,
  };
}
