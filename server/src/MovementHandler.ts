import type { Direction, MoveMessage, UseMapMessage } from "@tibia/protocol";
import type { CharacterPersistence } from "./character/CharacterPersistence";
import type { Player } from "./Player";
import type { Session } from "./Session";
import type { Visibility } from "./Visibility";
import type { World } from "./World";

export class MovementHandler {
  constructor(
    private readonly world: World,
    private readonly visibility: Visibility,
    private readonly persistence: CharacterPersistence,
  ) {}

  handle(session: Session, intent: MoveMessage, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    session.movementDirection = intent.direction;
    if (!intent.queueStep) return;
    session.bufferedMovementDirection = intent.direction;
    const result = this.applyMove(session, player, intent.direction, now, true);
    if (result.moved || result.reason !== "cooldown") {
      session.bufferedMovementDirection = null;
    }
  }

  handleUseMap(session: Session, intent: UseMapMessage, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    this.publishResult(
      session,
      player,
      this.world.tryUseMap(player, intent.position, now),
      true,
    );
  }

  stop(session: Session): void {
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
  }

  continueMovement(session: Session, now: number): void {
    const bufferedDirection = session.bufferedMovementDirection;
    const direction = bufferedDirection ?? session.movementDirection;
    if (!session.playerId || !direction) return;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    const result = this.applyMove(session, player, direction, now, false);
    if (
      bufferedDirection &&
      (result.moved || result.reason !== "cooldown")
    ) {
      session.bufferedMovementDirection = null;
    }
  }

  private applyMove(
    session: Session,
    player: Player,
    direction: Direction,
    now: number,
    sendCorrection: boolean,
  ): ReturnType<World["tryMove"]> {
    const result = this.world.tryMove(player, direction, now);
    this.publishResult(session, player, result, sendCorrection);
    return result;
  }

  private publishResult(
    session: Session,
    player: Player,
    result: ReturnType<World["tryMove"]>,
    sendCorrection: boolean,
  ): void {
    if (result.moved || result.turned) this.persistence.markDirty(player);
    if (result.moved) {
      this.visibility.onPlayerStepped(
        session,
        player,
        result.from,
        result.durationMs,
      );
    }
    else if (result.turned) this.visibility.broadcastPose(player);
    if (!result.moved && sendCorrection) {
      session.send({
        type: "position-correction",
        playerId: player.id,
        position: { ...player.position },
        direction: player.direction,
        positionRevision: player.positionRevision,
        retryAfterMs: result.retryAfterMs,
        reason: result.reason,
      });
    }
  }
}
