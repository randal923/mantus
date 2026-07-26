import { WHEEL_BASE_VOCATION } from "@tibia/protocol";
import type { Creature } from "../creature/Creature";
import type { Player } from "../Player";

const BONUS_BELOW_30 = [12, 18, 24] as const;
const BONUS_BELOW_60 = [6, 9, 12] as const;

/**
 * The Druid red-domain revelation: healing cast on *others* heals harder the
 * lower the target is (Canary PlayerWheel::checkBlessingGroveHealingByTarget,
 * player_wheel.cpp:3133-3160). Returns the bonus percent; the stage is read
 * from the caster's server-owned wheel allocation at execution time.
 */
export function blessingOfTheGroveBonus(
  source: Player,
  target: Creature,
): number {
  if (target === source) return 0;
  if (WHEEL_BASE_VOCATION[source.vocation] !== "Druid") return 0;
  const stage = source.wheelBonuses.revelationStages.red;
  if (stage < 1 || stage > 3) return 0;
  if (target.maxHealth <= 0) return 0;
  const healthPercent = (target.health * 100) / target.maxHealth;
  if (healthPercent <= 30) return BONUS_BELOW_30[stage - 1] ?? 0;
  if (healthPercent <= 60) return BONUS_BELOW_60[stage - 1] ?? 0;
  return 0;
}
