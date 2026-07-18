import type { CharacterPersistence } from "../character/CharacterPersistence";
import type { Creature } from "../creature/Creature";
import { findPath } from "../pathfinding/findPath";
import type { Player } from "../Player";
import type { Session } from "../Session";
import type { Visibility } from "../Visibility";
import type { MoveResult, World } from "../World";
import { isInRange } from "./isInRange";

const PLAYER_CHASE_PATH_BUDGET = 32;

export class ChaseController {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
  ) {}

  chaseTarget(
    session: Session,
    player: Player,
    target: Creature,
    now: number,
    range: number,
  ): void {
    if (
      !session.fightMode.chase ||
      session.movementDirection ||
      now < player.nextStepAt
    ) {
      return;
    }
    const path = findPath({
      start: player.position,
      isGoal: (position) => isInRange(position, target.position, range),
      canStep: (position) =>
        position.z === player.position.z &&
        this.world.isPathable(position) &&
        !this.world.isOccupied(position),
      maxVisited: PLAYER_CHASE_PATH_BUDGET,
    });
    const direction = path.directions[0];
    if (!direction) return;
    const result = this.world.tryMoveCreature(player, direction, now);
    this.publishChaseMovement(session, player, result);
  }

  private publishChaseMovement(
    session: Session,
    player: Player,
    result: MoveResult,
  ): void {
    if (result.moved) {
      this.persistence.markDirty(player);
      this.visibility.onPlayerStepped(
        session,
        player,
        result.from,
        result.durationMs,
      );
    } else if (result.turned) {
      this.persistence.markDirty(player);
      this.visibility.broadcastPose(player);
    }
  }
}
