import type { Player } from "../Player";
import type { Session } from "../Session";
import type { World } from "../World";

export function playerForSession(
  world: World,
  session: Session,
): Player | null {
  return session.playerId
    ? (world.getPlayer(session.playerId) ?? null)
    : null;
}
