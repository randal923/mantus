import {
  PROTOCOL_LIMITS,
  type CreatureState,
  type Position,
  type ServerMessage,
  type TileState,
  type ViewRange,
} from "@tibia/protocol";
import type { Creature } from "./creature/Creature";
import type { Player } from "./Player";
import type { Session } from "./Session";
import type { SessionRegistry } from "./SessionRegistry";
import type { World } from "./World";
import { positionKey } from "./positionKey";

/** Owns every view-filtered creature introduction, movement, and removal. */
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

  /** Introduces a spawning player and returns only creatures in their view. */
  announceSpawn(joiner: Session, player: Player): CreatureState[] {
    const visibleCreatures = this.world.creaturesVisibleFrom(
      player.position,
      joiner.viewRange,
    );
    for (const creature of visibleCreatures) {
      joiner.knownCreatureIds.add(creature.id);
    }
    for (const other of this.viewerSessionsFor(player.position, 0)) {
      if (other.id === joiner.id) continue;
      this.introduce(other, player);
    }
    return visibleCreatures.map((creature) => creature.toState());
  }

  announceCreatureSpawn(creature: Creature): void {
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      this.introduce(session, creature);
    }
  }

  announceLeave(leaver: Session, creature: Creature): void {
    for (const near of this.registry.all()) {
      if (near.id === leaver.id) continue;
      this.forget(near, creature.id);
    }
  }

  announceCreatureLeave(creature: Creature): void {
    for (const session of this.registry.all()) this.forget(session, creature.id);
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
    this.updateObservers(player, from, durationMs, mover.id);
  }

  onCreatureStepped(
    creature: Creature,
    from: Position,
    durationMs: number,
  ): void {
    this.updateObservers(creature, from, durationMs);
  }

  broadcastPose(creature: Creature): void {
    const message = this.movedMessage(creature, creature.position, 0);
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      if (!session.knownCreatureIds.has(creature.id)) continue;
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
    const currentKeys = new Set(current.map((tile) => positionKey(tile.position)));
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

  onMapItemsChanged(positions: ReadonlyArray<Position>): void {
    for (const position of positions) {
      const tile = this.world.mapItemTileState(position);
      for (const session of this.viewerSessionsFor(position, 0)) {
        session.knownMapItemTiles.set(positionKey(position), position);
        session.send({ type: "tile-states", visible: [tile], hidden: [] });
      }
    }
  }

  private updateObservers(
    creature: Creature,
    from: Position,
    durationMs: number,
    excludedSessionId?: string,
  ): void {
    const nearby = new Set([
      ...this.viewerSessionsFor(from, 1),
      ...this.viewerSessionsFor(creature.position, 1),
    ]);
    for (const session of nearby) {
      if (session.id === excludedSessionId || !session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (viewer) {
        this.updateViewOfCreature(session, viewer, creature, from, durationMs);
      }
    }
  }

  private updateViewOfCreature(
    viewerSession: Session,
    viewer: Player,
    moved: Creature,
    from: Position,
    durationMs: number,
  ): void {
    const visible = this.world.canSee(
      viewer.position,
      moved.position,
      viewerSession.viewRange,
    );
    const known = viewerSession.knownCreatureIds.has(moved.id);
    if (visible && known) {
      viewerSession.send(this.movedMessage(moved, from, durationMs));
      return;
    }
    if (visible) {
      this.introduce(viewerSession, moved);
      return;
    }
    if (known) this.forget(viewerSession, moved.id);
  }

  private reconcileMoverView(mover: Session, player: Player): void {
    for (const knownId of [...mover.knownCreatureIds]) {
      if (knownId === player.id) continue;
      const other = this.world.getCreature(knownId);
      if (
        other &&
        this.world.canSee(player.position, other.position, mover.viewRange)
      ) {
        continue;
      }
      this.forget(mover, knownId);
    }
    for (const other of this.world.creaturesVisibleFrom(
      player.position,
      mover.viewRange,
    )) {
      if (mover.knownCreatureIds.has(other.id)) continue;
      this.introduce(mover, other);
    }
  }

  private introduce(session: Session, creature: Creature): void {
    if (session.knownCreatureIds.has(creature.id)) return;
    session.knownCreatureIds.add(creature.id);
    session.send({ type: "creature-joined", creature: creature.toState() });
  }

  private forget(session: Session, creatureId: string): void {
    if (!session.knownCreatureIds.delete(creatureId)) return;
    session.send({ type: "creature-left", creatureId });
  }

  private movedMessage(
    creature: Creature,
    from: Position,
    durationMs: number,
  ): ServerMessage {
    return {
      type: "creature-moved",
      creatureId: creature.id,
      from: { ...from },
      position: { ...creature.position },
      direction: creature.direction,
      positionRevision: creature.positionRevision,
      durationMs,
    };
  }

  private rangeWithMargin(range: ViewRange, margin: number): ViewRange {
    return { x: range.x + margin, y: range.y + margin };
  }
}
