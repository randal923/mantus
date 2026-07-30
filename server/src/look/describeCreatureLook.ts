import type { Creature } from "../creature/Creature";
import { Monster } from "../creature/Monster";
import { Npc } from "../creature/Npc";
import { Player } from "../Player";
import {
  describePlayerLook,
  type PlayerLookState,
} from "./describePlayerLook";

/**
 * Canary's creature look: a monster or NPC reports its `nameDescription`
 * ("a chicken", "Bank clerk"), a player reports the public identity line.
 * The caller prefixes "You see ".
 */
export function describeCreatureLook(
  creature: Creature,
  self: boolean,
  state: PlayerLookState,
): string {
  if (creature instanceof Player) {
    return describePlayerLook(creature, self, state);
  }
  if (creature instanceof Monster || creature instanceof Npc) {
    return `${creature.type.description || creature.name}.`;
  }
  return `${creature.name}.`;
}
