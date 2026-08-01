import { canPlayerTarget } from "../combat/canPlayerTarget";
import { Monster } from "../creature/Monster";
import type { Player } from "../Player";
import type { PvpHooks } from "../pvp/PvpHooks";
import type { Session } from "../Session";
import type { World } from "../World";

/**
 * Picks the monster the hunting bot should attack: weakest first, nearest to
 * break the tie, creature id to break the remaining tie so two identical
 * monsters cannot make the target oscillate every tick.
 *
 * Ranking uses `healthPercent` — the same number the client is shown — rather
 * than raw hit points, and treats a monster whose health the client may not
 * see as untouched. Ranking those by their true health would let the bot's
 * choice reveal which hidden-health monster is weakest (charter rule 6).
 *
 * Every candidate is re-derived from live state at call time: only monsters
 * the session has actually been introduced to, that it can still see, and
 * that the player is allowed to attack right now (charter rule 4).
 */
export function selectAutoTarget(options: {
  readonly world: World;
  readonly session: Session;
  readonly player: Player;
  readonly pvpHooks?: PvpHooks | undefined;
  readonly isSummon: (monster: Monster) => boolean;
}): Monster | null {
  const { world, session, player } = options;
  let best: Monster | null = null;
  let bestRank: readonly [number, number, string] | null = null;
  for (const creature of world.creaturesNear(player.position, session.viewRange)) {
    if (!(creature instanceof Monster)) continue;
    if (creature.health <= 0) continue;
    if (!session.knownCreatureIds.has(creature.id)) continue;
    if (options.isSummon(creature)) continue;
    if (!world.canSee(player.position, creature.position, session.viewRange)) {
      continue;
    }
    if (
      !canPlayerTarget(world, session, player, creature, options.pvpHooks)
    ) {
      continue;
    }
    const rank = [
      creature.type.flags.healthHidden ? 100 : creature.healthPercent,
      Math.max(
        Math.abs(creature.position.x - player.position.x),
        Math.abs(creature.position.y - player.position.y),
      ),
      creature.id,
    ] as const;
    if (!bestRank || compare(rank, bestRank) < 0) {
      best = creature;
      bestRank = rank;
    }
  }
  return best;
}

function compare(
  left: readonly [number, number, string],
  right: readonly [number, number, string],
): number {
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2].localeCompare(right[2])
  );
}
