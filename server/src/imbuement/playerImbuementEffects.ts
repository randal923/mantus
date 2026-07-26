import type { Skill } from "@tibia/protocol";
import { itemImbuementsOf } from "../forge/itemImbuementsOf";
import type { Item } from "../item/Item";
import type { ImbuementCatalog } from "./ImbuementCatalog";

export interface PlayerImbuementEffects {
  readonly skills: Readonly<Partial<Record<Skill, number>>>;
  readonly magicLevel: number;
  /** Percent units ready for the combat formulas (500 bp -> 5). */
  readonly criticalChancePercent: number;
  readonly criticalDamagePercent: number;
  readonly lifeLeechPercent: number;
  readonly manaLeechPercent: number;
  /** First elemental-damage imbuement on the weapon, like Canary. */
  readonly elementalDamage: { readonly element: string; readonly percent: number } | null;
  /** Sequential per-hit reductions per element (Canary player.cpp:3872). */
  readonly absorb: Readonly<Record<string, ReadonlyArray<number>>>;
  /** Feet-slot vibrancy: paralysis removal chance, percent. */
  readonly paralysisRemoveChancePercent: number;
  /** Feet-slot vibrancy: deflects player-cast paralysis (Canary condition.cpp:96-136). */
  readonly paralysisPvpDeflect: boolean;
  /** Swiftness: flat walk-speed bonus, additive across items (Canary player.cpp:3260). */
  readonly speed: number;
  /**
   * Featherweight: percent of *base* capacity (Canary player.cpp:3266).
   * Canary overwrites its single `bonusCapacity` per apply event, which is
   * order-dependent with mixed tiers; the deterministic equivalent here is
   * the highest equipped percent.
   */
  readonly capacityPercent: number;
}

const EMPTY: PlayerImbuementEffects = {
  skills: {},
  magicLevel: 0,
  criticalChancePercent: 0,
  criticalDamagePercent: 0,
  lifeLeechPercent: 0,
  manaLeechPercent: 0,
  elementalDamage: null,
  absorb: {},
  paralysisRemoveChancePercent: 0,
  paralysisPvpDeflect: false,
  speed: 0,
  capacityPercent: 0,
};

/**
 * Aggregates the running imbuements on equipped items into the numbers the
 * combat paths read at execution time (Feature 78). Expired entries carry
 * zero remaining seconds and never contribute; leech ignores its vestigial
 * chance field exactly like Canary's consumption path (game.cpp:8983-9046),
 * while critical uses its chance (1000 -> 10%).
 */
export function playerImbuementEffects(
  equipment: ReadonlyArray<{ item: Item }>,
  catalog: ImbuementCatalog | undefined,
): PlayerImbuementEffects {
  if (!catalog) return EMPTY;
  const skills: Partial<Record<Skill, number>> = {};
  let magicLevel = 0;
  let criticalChancePercent = 0;
  let criticalDamagePercent = 0;
  let lifeLeechPercent = 0;
  let manaLeechPercent = 0;
  let elementalDamage: PlayerImbuementEffects["elementalDamage"] = null;
  const absorb: Record<string, number[]> = {};
  let paralysisRemoveChancePercent = 0;
  let paralysisPvpDeflect = false;
  let speed = 0;
  let capacityPercent = 0;
  let any = false;
  for (const entry of equipment) {
    for (const state of itemImbuementsOf(entry.item)) {
      const definition = catalog.imbuements.get(state.imbuementId);
      if (!definition) continue;
      any = true;
      const effect = definition.effect;
      switch (effect.kind) {
        case "skill":
          skills[effect.skill] = (skills[effect.skill] ?? 0) + effect.amount;
          break;
        case "magic-level":
          magicLevel += effect.amount;
          break;
        case "critical":
          criticalChancePercent += effect.chanceHundredthsPercent / 100;
          criticalDamagePercent += effect.damageHundredthsPercent / 100;
          break;
        case "leech":
          if (effect.resource === "life") {
            lifeLeechPercent += effect.amountHundredthsPercent / 100;
          } else {
            manaLeechPercent += effect.amountHundredthsPercent / 100;
          }
          break;
        case "damage":
          if (
            !elementalDamage &&
            entry.item.location.kind === "equipment" &&
            (entry.item.location.slot === "weapon" ||
              entry.item.location.slot === "ammo")
          ) {
            elementalDamage = { element: effect.element, percent: effect.percent };
          }
          break;
        case "reduction":
          (absorb[effect.element] ??= []).push(effect.percent);
          break;
        case "paralysis":
          if (
            entry.item.location.kind === "equipment" &&
            entry.item.location.slot === "boots"
          ) {
            paralysisRemoveChancePercent = Math.max(
              paralysisRemoveChancePercent,
              effect.removeChancePercent,
            );
            paralysisPvpDeflect = paralysisPvpDeflect || effect.pvpDeflect;
          }
          break;
        case "speed":
          speed += effect.amount;
          break;
        case "capacity":
          capacityPercent = Math.max(capacityPercent, effect.percent);
          break;
        default:
          break;
      }
    }
  }
  if (!any) return EMPTY;
  return {
    skills,
    magicLevel,
    criticalChancePercent,
    criticalDamagePercent,
    lifeLeechPercent,
    manaLeechPercent,
    elementalDamage,
    absorb,
    paralysisRemoveChancePercent,
    paralysisPvpDeflect,
    speed,
    capacityPercent,
  };
}
