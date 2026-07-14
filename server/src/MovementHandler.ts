import type { Direction, MoveMessage } from "@tibia/protocol";
import type { Player } from "./Player";
import type { Session } from "./Session";
import type { Visibility } from "./Visibility";
import type { World } from "./World";

export class MovementHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
  ) {}

  handle(session: Session, intent: MoveMessage, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    session.movementDirection = intent.direction;
    this.applyMove(session, player, intent.direction, now);
  }

  stop(session: Session): void {
    session.movementDirection = null;
  }

  continueMovement(session: Session, now: number): void {
    if (!session.playerId || !session.movementDirection) return;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    this.applyMove(session, player, session.movementDirection, now);
  }

  private applyMove(
    session: Session,
    player: Player,
    direction: Direction,
    now: number,
  ): void {
    const result = this.world.tryMove(player, direction, now);
    if (result.moved) this.visibility.onPlayerStepped(session, player);
    else if (result.turned) this.visibility.broadcastPose(player);
  }
}
