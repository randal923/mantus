import type { PlayerState, Position, ServerMessage } from "@tibia/protocol";
import { canSee, type ViewRange } from "./canSee";
import type { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";

/**
 * Owns who-knows-about-whom. Every message about a player entering, leaving,
 * or moving goes through here so no path can leak state beyond view range
 * (charter rule 6).
 */
export class Visibility {
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
    private readonly viewRange: ViewRange,
  ) {}

  /** Sessions of players within viewRange (+margin tiles) of a position. */
  *nearbySessions(
    position: Position,
    margin: number,
  ): Iterable<Session> {
    const range = {
      x: this.viewRange.x + margin,
      y: this.viewRange.y + margin,
    };
    for (const player of this.world.playersNear(position, range)) {
      const session = this.registry.sessionFor(player.id);
      if (session) yield session;
    }
  }

  /**
   * Introduces a spawning player and their neighbors to each other; returns
   * the states the joiner is allowed to see.
   */
  announceSpawn(joiner: Session, player: Player): PlayerState[] {
    joiner.knownPlayerIds.add(player.id);
    const visiblePlayers = [player.toState()];
    for (const other of this.nearbySessions(player.position, 0)) {
      if (other.id === joiner.id || !other.playerId) continue;
      const otherPlayer = this.world.getPlayer(other.playerId);
      if (!otherPlayer) continue;
      joiner.knownPlayerIds.add(otherPlayer.id);
      visiblePlayers.push(otherPlayer.toState());
      other.knownPlayerIds.add(player.id);
      other.send({ type: "player-joined", player: player.toState() });
    }
    return visiblePlayers;
  }

  announceLeave(leaver: Session, player: Player): void {
    // every session that knows a player is within view range of them
    for (const near of this.nearbySessions(player.position, 0)) {
      if (near.id === leaver.id) continue;
      if (!near.knownPlayerIds.delete(player.id)) continue;
      near.send({ type: "player-left", playerId: player.id });
    }
  }

  onPlayerStepped(mover: Session, player: Player): void {
    mover.send(this.movedMessage(player));
    this.reconcileMoverView(mover, player);
    // margin 1 covers viewers the one-tile step just left behind; larger
    // jumps (teleports, when they exist) must reconcile visibility themselves
    for (const session of this.nearbySessions(player.position, 1)) {
      if (session.id === mover.id || !session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (viewer) this.updateViewOfMover(session, viewer, player);
    }
  }

  broadcastPose(player: Player): void {
    const message = this.movedMessage(player);
    for (const session of this.nearbySessions(player.position, 0)) {
      if (!session.knownPlayerIds.has(player.id)) continue;
      session.send(message);
    }
  }

  private updateViewOfMover(
    viewerSession: Session,
    viewer: Player,
    moved: Player,
  ): void {
    const visible = canSee(viewer.position, moved.position, this.viewRange);
    const known = viewerSession.knownPlayerIds.has(moved.id);
    if (visible && known) {
      viewerSession.send(this.movedMessage(moved));
      return;
    }
    if (visible) {
      viewerSession.knownPlayerIds.add(moved.id);
      viewerSession.send({ type: "player-joined", player: moved.toState() });
      return;
    }
    if (known) {
      viewerSession.knownPlayerIds.delete(moved.id);
      viewerSession.send({ type: "player-left", playerId: moved.id });
    }
  }

  private reconcileMoverView(mover: Session, player: Player): void {
    // known players no longer visible → left view (known ⊆ near old position)
    for (const knownId of [...mover.knownPlayerIds]) {
      if (knownId === player.id) continue;
      const other = this.world.getPlayer(knownId);
      if (other && canSee(player.position, other.position, this.viewRange)) {
        continue;
      }
      mover.knownPlayerIds.delete(knownId);
      mover.send({ type: "player-left", playerId: knownId });
    }
    // nearby players not yet known → entered view
    for (const other of this.world.playersNear(player.position, this.viewRange)) {
      if (other.id === player.id || mover.knownPlayerIds.has(other.id)) {
        continue;
      }
      mover.knownPlayerIds.add(other.id);
      mover.send({ type: "player-joined", player: other.toState() });
    }
  }

  private movedMessage(player: Player): ServerMessage {
    return {
      type: "player-moved",
      playerId: player.id,
      position: { ...player.position },
      direction: player.direction,
    };
  }
}
