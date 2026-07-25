import type {
  AutoWalkMessage,
  Direction,
  MoveMessage,
  Position,
  TurnMessage,
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
    if (session.travelOperationPending || session.promotionOperationPending) {
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

  handleTurn(session: Session, intent: TurnMessage): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    this.stop(session);
    if (session.travelOperationPending || session.promotionOperationPending) {
      return;
    }
    if (!this.world.turnPlayer(player, intent.direction)) return;
    this.persistence.markDirty(player);
    this.visibility.broadcastPose(player);
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
    if (session.travelOperationPending || session.promotionOperationPending) {
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
    if (session.travelOperationPending || session.promotionOperationPending) {
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

  /**
   * The digger falls through a hole they just opened (Canary's teleportTo in
   * onUseShovel). Destination is re-validated; a blocked floor below simply
   * leaves the hole open without moving anyone.
   */
  handleHoleFall(session: Session, holePosition: Position, now: number): void {
    if (!session.playerId) return;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    const below = {
      x: holePosition.x,
      y: holePosition.y,
      z: holePosition.z + 1,
    };
    if (
      below.z > 15 ||
      !this.world.isWalkable(below) ||
      this.world.isOccupied(below)
    ) {
      return;
    }
    this.stop(session);
    const from = this.world.relocateCreature(player, below);
    this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.markDirty(player);
  }

  /**
   * Server-decided relocation (pressure-plate snap-back). The destination is
   * re-validated here at execution time; an unwalkable or occupied tile leaves
   * the player where they are rather than teleporting them into geometry.
   */
  teleportPlayer(
    session: Session,
    player: Player,
    to: Position,
    now: number,
  ): void {
    if (!this.world.isWalkable(to) || this.world.isOccupied(to)) return;
    this.stop(session);
    const from = this.world.relocateCreature(player, to);
    player.nextStepAt = now;
    this.visibility.onPlayerTeleported(session, player, from);
    this.persistence.markDirty(player);
  }

  /** Rope used on a rope-spot tile; the tool itself is validated upstream. */
  handleRopeUse(session: Session, target: Position, now: number): void {
    if (!session.playerId) {
      session.sendError("join-required");
      return;
    }
    const player = this.world.getPlayer(session.playerId);
    if (!player) return;
    if (session.travelOperationPending || session.promotionOperationPending) {
      this.stop(session);
      return;
    }
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
    this.publishResult(
      session,
      player,
      this.world.tryUseRopeSpot(player, target, now),
      true,
      now,
    );
  }

  /** Movement leg of exani tera; the spell pipeline owns failure feedback. */
  handleMagicRopeSpell(session: Session, now: number): boolean {
    return this.applySpellFloorMove(session, now, (player) =>
      this.world.trySpellRopeSpot(player, player.position, now),
    );
  }

  /** Movement leg of exani hur; the spell pipeline owns failure feedback. */
  handleLevitateSpell(
    session: Session,
    parameter: "up" | "down",
    now: number,
  ): boolean {
    return this.applySpellFloorMove(session, now, (player) =>
      this.world.tryLevitate(player, parameter, now),
    );
  }

  private applySpellFloorMove(
    session: Session,
    now: number,
    move: (player: Player) => ReturnType<World["tryMove"]>,
  ): boolean {
    if (!session.playerId) return false;
    const player = this.world.getPlayer(session.playerId);
    if (!player) return false;
    if (session.travelOperationPending || session.promotionOperationPending) {
      return false;
    }
    const result = move(player);
    if (result.moved) this.stop(session);
    this.publishResult(session, player, result, false, now);
    return result.moved;
  }

  stop(session: Session): void {
    session.movementDirection = null;
    session.bufferedMovementDirection = null;
    session.autoWalkDirections = [];
  }

  continueMovement(session: Session, now: number): void {
    if (session.travelOperationPending || session.promotionOperationPending) {
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
