import type { Creature } from "../creature/Creature";
import type { Player } from "../Player";
import type { SpellDefinition } from "./Spell";

/** Damage percent added per red stage when the target is low (player_wheel.cpp:3183). */
const EXECUTE_PERCENT_BY_STAGE = [100, 125, 150] as const;
const EXECUTE_HEALTH_PERCENT = 30;

/**
 * The Knight red revelation's execute bonus: Executioner's Throw deals
 * +100/125/150 % against targets at or below 30 % health
 * (Canary Game::applyWheelOfDestinyEffectsToDamage, game.cpp:8296-8302).
 * Read per target from the server-owned wheel state at damage time.
 */
export function wheelExecutionersThrowPercent(
  player: Player,
  spell: SpellDefinition,
  target: Creature,
): number {
  if (spell.id !== "exori-amp-kor") return 0;
  const stage = player.wheelBonuses.revelationStages.red;
  if (stage < 1) return 0;
  if (target.health * 100 > target.maxHealth * EXECUTE_HEALTH_PERCENT) return 0;
  return EXECUTE_PERCENT_BY_STAGE[Math.min(stage, 3) - 1] ?? 0;
}
