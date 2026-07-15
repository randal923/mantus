import {
  PROTOCOL_LIMITS,
  type PlayerState,
  type Position,
  type ServerMessage,
  type TileState,
  type ViewRange,
} from "@tibia/protocol";
import type { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { positionKey } from "./positionKey";

/**
 * Owns who-knows-about-whom. Every message about a player entering, leaving,
 * or moving goes through here so no path can leak state beyond view range
 * (charter rule 6).
 */
export class Visibility {
  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
  ) {}

  *visibleSessionsFrom(
    viewer: Session,
    position: Position,
    margin: number,
  ): Iterable<Session> {
    const range = this.rangeWithMargin(viewer.viewRange, margin);
    for (const player of this.world.playersVisibleFrom(position, range)) {
      const session = this.registry.sessionFor(player.id);
      if (session) yield session;
    }
  }

  *viewerSessionsFor(position: Position, margin: number): Iterable<Session> {
    const maximumRange = {
      x: PROTOCOL_LIMITS.maxViewRangeX + margin,
      y: PROTOCOL_LIMITS.maxViewRangeY + margin,
    };
    for (const player of this.world.playersWhoCanSee(position, maximumRange)) {
      const session = this.registry.sessionFor(player.id);
      if (!session) continue;
      const range = this.rangeWithMargin(session.viewRange, margin);
      if (this.world.canSee(player.position, position, range)) yield session;
    }
  }

  /**
   * Introduces a spawning player and their neighbors to each other; returns
   * the states the joiner is allowed to see.
   */
  announceSpawn(joiner: Session, player: Player): PlayerState[] {
    joiner.knownPlayerIds.add(player.id);
    const visiblePlayers = [player.toState()];
    for (const other of this.visibleSessionsFrom(joiner, player.position, 0)) {
      if (other.id === joiner.id || !other.playerId) continue;
      const otherPlayer = this.world.getPlayer(other.playerId);
      if (!otherPlayer) continue;
      joiner.knownPlayerIds.add(otherPlayer.id);
      visiblePlayers.push(otherPlayer.toState());
    }
    for (const other of this.viewerSessionsFor(player.position, 0)) {
      if (other.id === joiner.id || !other.playerId) continue;
      other.knownPlayerIds.add(player.id);
      other.send({ type: "player-joined", player: player.toState() });
    }
    return visiblePlayers;
  }

  announceLeave(leaver: Session, player: Player): void {
    for (const near of this.registry.all()) {
      if (near.id === leaver.id) continue;
      if (!near.knownPlayerIds.delete(player.id)) continue;
      near.send({ type: "player-left", playerId: player.id });
    }
  }

  onPlayerStepped(
    mover: Session,
    player: Player,
    from: Position,
    durationMs: number,
  ): void {
    mover.send(this.movedMessage(player, from, durationMs));
    this.reconcileMoverView(mover, player);
    this.syncMapItems(mover, player);
    // margin 1 covers viewers the one-tile step just left behind; larger
    // jumps (teleports, when they exist) must reconcile visibility themselves
    const nearby = new Set([
      ...this.viewerSessionsFor(from, 1),
      ...this.viewerSessionsFor(player.position, 1),
    ]);
    for (const session of nearby) {
      if (session.id === mover.id || !session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (viewer) this.updateViewOfMover(session, viewer, player, from, durationMs);
    }
  }

  broadcastPose(player: Player): void {
    const message = this.movedMessage(player, player.position, 0);
    for (const session of this.viewerSessionsFor(player.position, 0)) {
      if (!session.knownPlayerIds.has(player.id)) continue;
      session.send(message);
    }
  }

  onViewerRangeChanged(session: Session, player: Player): void {
    this.reconcileMoverView(session, player);
    this.syncMapItems(session, player);
  }

  syncMapItems(session: Session, player: Player): void {
    const current = this.world.mapItemTilesVisibleFrom(
      player.position,
      session.viewRange,
    );
    const currentKeys = new Set(
      current.map((tile) => positionKey(tile.position)),
    );
    const hidden: Position[] = [];
    for (const [key, position] of session.knownMapItemTiles) {
      if (currentKeys.has(key)) continue;
      session.knownMapItemTiles.delete(key);
      hidden.push(position);
    }
    const visible = current.filter((tile) => {
      const key = positionKey(tile.position);
      if (session.knownMapItemTiles.has(key)) return false;
      session.knownMapItemTiles.set(key, tile.position);
      return true;
    });
    for (let index = 0; index < hidden.length; index += 32) {
      session.send({
        type: "tile-states",
        visible: [],
        hidden: hidden.slice(index, index + 32),
      });
    }
    let batch: TileState[] = [];
    for (const tile of visible) {
      const candidate = [...batch, tile];
      const bytes = Buffer.byteLength(
        JSON.stringify({ type: "tile-states", visible: candidate, hidden: [] }),
      );
      if (bytes > PROTOCOL_LIMITS.maxMessageBytes && batch.length > 0) {
        session.send({ type: "tile-states", visible: batch, hidden: [] });
        batch = [tile];
      } else {
        batch = candidate;
      }
    }
    if (batch.length > 0) {
      session.send({ type: "tile-states", visible: batch, hidden: [] });
    }
  }

  private updateViewOfMover(
    viewerSession: Session,
    viewer: Player,
    moved: Player,
    from: Position,
    durationMs: number,
  ): void {
    const visible = this.world.canSee(
      viewer.position,
      moved.position,
      viewerSession.viewRange,
    );
    const known = viewerSession.knownPlayerIds.has(moved.id);
    if (visible && known) {
      viewerSession.send(this.movedMessage(moved, from, durationMs));
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
      if (
        other &&
        this.world.canSee(player.position, other.position, mover.viewRange)
      ) {
        continue;
      }
      mover.knownPlayerIds.delete(knownId);
      mover.send({ type: "player-left", playerId: knownId });
    }
    // nearby players not yet known → entered view
    for (const other of this.world.playersVisibleFrom(
      player.position,
      mover.viewRange,
    )) {
      if (other.id === player.id || mover.knownPlayerIds.has(other.id)) {
        continue;
      }
      mover.knownPlayerIds.add(other.id);
      mover.send({ type: "player-joined", player: other.toState() });
    }
  }

  private movedMessage(
    player: Player,
    from: Position,
    durationMs: number,
  ): ServerMessage {
    return {
      type: "player-moved",
      playerId: player.id,
      from: { ...from },
      position: { ...player.position },
      direction: player.direction,
      positionRevision: player.positionRevision,
      durationMs,
    };
  }

  private rangeWithMargin(range: ViewRange, margin: number): ViewRange {
    return { x: range.x + margin, y: range.y + margin };
  }
}
