import { WHEEL_BASE_VOCATION } from "@tibia/protocol";
import type { Player } from "../Player";
import type { SpellDefinition } from "./Spell";
import { WHEEL_AREA_BEAM7, WHEEL_AREA_BEAM10 } from "./wheelUpgradedAreas";

/** Damage percent per beam target at red stage 1/2/3 (player_wheel.cpp:3204-3216). */
const BEAM_DAMAGE_BY_STAGE = [10, 12, 14] as const;

export interface WheelBeamMastery {
  /** Upgraded beam area for this spell, when it has one. */
  readonly area: SpellDefinition["area"] | null;
  /**
   * Percent added per beam target, accumulating across the first three
   * targets the beam processes (Canary shares one CombatDamage across the
   * sweep — combat.cpp:1486-1490, player_wheel.cpp:4006-4013).
   */
  readonly damagePercentPerTarget: number;
  /** Every spell cooldown shortens by this much per target hit (max 3). */
  readonly cooldownReductionPerTargetMs: number;
}

/**
 * The Sorcerer red revelation. Active from stage 1 for Energy Beam, Great
 * Energy Beam, and Great Death Beam (Canary m_beamMasterySpells); read from
 * the server-owned wheel state at cast time. Great Death Beam's length is
 * grade-driven through its augment areas, so it keeps `area: null` here.
 */
export function wheelBeamMasteryFor(
  player: Player,
  spell: SpellDefinition,
): WheelBeamMastery | null {
  if (WHEEL_BASE_VOCATION[player.vocation] !== "Sorcerer") return null;
  const stage = player.wheelBonuses.revelationStages.red;
  if (stage < 1) return null;
  if (
    spell.id !== "exevo-vis-lux" &&
    spell.id !== "exevo-gran-vis-lux" &&
    spell.id !== "exevo-max-mort"
  ) {
    return null;
  }
  const area =
    spell.id === "exevo-vis-lux"
      ? WHEEL_AREA_BEAM7
      : spell.id === "exevo-gran-vis-lux"
        ? WHEEL_AREA_BEAM10
        : null;
  return {
    area,
    damagePercentPerTarget:
      BEAM_DAMAGE_BY_STAGE[Math.min(stage, 3) - 1] ?? 0,
    cooldownReductionPerTargetMs: 1_000,
  };
}
