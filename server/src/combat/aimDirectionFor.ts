import type { Direction } from "@tibia/protocol";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";
import { primaryDirectionToward } from "./primaryDirectionToward";
import type { SpellDefinition } from "./Spell";

/**
 * Canary's aim-at-target: for a spell the player has opted in to, a direction
 * cast lines up with the live attack target instead of the player's facing.
 * The target is re-read from the world at cast time and must still be visible
 * to this session, so a stale or forged id simply falls back to the facing —
 * it can never redirect a spell at something the player cannot see.
 */
export function aimDirectionFor(
  world: World,
  session: Session,
  player: Player,
  spell: SpellDefinition,
): Direction | undefined {
  if (!session.aimAtTargetSpellIds.has(spell.id)) return undefined;
  const targetId = session.attackTargetId;
  if (!targetId) return undefined;
  const target = world.getCreature(targetId);
  if (
    !target ||
    !session.knownCreatureIds.has(target.id) ||
    !world.canSee(player.position, target.position, session.viewRange)
  ) {
    return undefined;
  }
  return primaryDirectionToward(player.position, target.position);
}
