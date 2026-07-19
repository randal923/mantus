import type {
  AutoWalkMessage,
  Direction,
  MoveMessage,
  Position,
  UseMapMessage,
} from "@tibia/protocol";
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
    private readonly onPlayerStepped?: (
      session: Session,
      player: Player,
      from: Position,
      now: number,
    ) => void,
  ) {}

  handle(session: Session, intent: MoveMessage, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    if (session.travelOperationPending) {
      this.stop(session);
      return;
    }
    session.autoWalkDirections = [];
    session.movementDirection = intent.direction;
    if (!intent.queueStep) return;
    session.bufferedMovementDirection = intent.direction;
    const result = this.applyMove(session, player, intent.direction, now, true);
    if (result.moved || result.reason !== "cooldown") {
      session.bufferedMovementDirection = null;
    }
  }

  handleAutoWalk(
    session: Session,
    intent: AutoWalkMessage,
    now: number,
  ): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    if (session.travelOperationPending) {
      this.stop(session);
      return;
    }
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    if (player.positionRevision !== intent.positionRevision) {
      this.sendCorrection(session, player, "stale-revision", 0);
      return;
    }
    session.autoWalkDirections = [...intent.directions];
    this.continueAutoWalk(session, player, now);
  }

  handleUseMap(session: Session, intent: UseMapMessage, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    if (session.travelOperationPending) {
      this.stop(session);
      return;
    }
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    this.publishResult(
      session,
      player,
      this.world.tryUseMap(player, intent.position, now),
      true,
      now,
    );
  }

  stop(session: Session): void {
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
  }

  continueMovement(session: Session, now: number): void {
    if (session.travelOperationPending) {
      this.stop(session);
      return;
    }
    const bufferedDirection = session.bufferedMovementDirection;
    const direction = bufferedDirection ?? session.movementDirection;
    if (!session.playerId) return;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    if (!direction) {
      this.continueAutoWalk(session, player, now);
      return;
    }
    const result = this.applyMove(session, player, direction, now, false);
    if (
      bufferedDirection &&
      (result.moved || result.reason !== "cooldown")
    ) {
      session.bufferedMovementDirection = null;
    }
  }

  private continueAutoWalk(
    session: Session,
    player: Player,
    now: number,
  ): void {
    const direction = session.autoWalkDirections[0];
    if (!direction) return;
    const result = this.applyMove(session, player, direction, now, false);
    if (result.moved) {
      session.autoWalkDirections.shift();
      return;
    }
    if (result.reason === "cooldown") return;
    session.autoWalkDirections = [];
    this.sendCorrection(session, player, result.reason, result.retryAfterMs);
  }

  private applyMove(
    session: Session,
    player: Player,
    direction: Direction,
    now: number,
    sendCorrection: boolean,
  ): ReturnType<World["tryMove"]> {
    const result = this.world.tryMove(player, direction, now);
    this.publishResult(session, player, result, sendCorrection, now);
    return result;
  }

  private publishResult(
    session: Session,
    player: Player,
    result: ReturnType<World["tryMove"]>,
    sendCorrection: boolean,
    now: number,
  ): void {
    if (result.moved || result.turned) this.persistence.markDirty(player);
    if (result.moved) {
      this.visibility.onPlayerStepped(
        session,
        player,
        result.from,
        result.durationMs,
      );
      this.onPlayerStepped?.(session, player, result.from, now);
    }
    else if (result.turned) this.visibility.broadcastPose(player);
    if (!result.moved && sendCorrection) {
      this.sendCorrection(
        session,
        player,
        result.reason,
        result.retryAfterMs,
      );
    }
  }

  private sendCorrection(
    session: Session,
    player: Player,
    reason:
      | "cooldown"
      | "blocked"
      | "occupied"
      | "invalid-transition"
      | "stale-revision",
    retryAfterMs: number,
  ): void {
    session.send({
      type: "position-correction",
      playerId: player.id,
      position: { ...player.position },
      direction: player.direction,
      positionRevision: player.positionRevision,
      retryAfterMs,
      reason,
    });
  }
}
