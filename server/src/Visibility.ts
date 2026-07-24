import {
  type DamageType,
  type HitBlock,
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

/**
 * Per-recipient creature-state customization (e.g. viewer-relative PVP
 * skull marks). Runs at send time for every creature projection so a
 * message never carries marks its recipient may not see (charter rule 6).
 */
export type CreatureStateDecorator = (
  viewer: Player,
  creature: Creature,
  state: CreatureState,
) => CreatureState;

/** Owns every view-filtered creature introduction, movement, and removal. */
export class Visibility {
  private stateDecorator: CreatureStateDecorator | null = null;

  constructor(
    private readonly world: World,
    private readonly registry: SessionRegistry,
  ) {}

  setCreatureStateDecorator(decorator: CreatureStateDecorator): void {
    this.stateDecorator = decorator;
  }

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

  private *knowingViewerSessions(creature: Creature): Iterable<Session> {
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      if (session.knownCreatureIds.has(creature.id)) yield session;
    }
  }

  /**
   * The recipient set shared by health/effect/combat-text broadcasts about
   * one creature. Compute it once per combat event and pass it to each
   * broadcast to avoid repeating the visibility scan.
   */
  knowingViewersOf(creature: Creature): ReadonlyArray<Session> {
    return [...this.knowingViewerSessions(creature)];
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
      if (this.world.canCreatureSee(player, position, range)) yield session;
    }
  }

  /** Introduces a spawning player and returns only creatures in their view. */
  announceSpawn(joiner: Session, player: Player): CreatureState[] {
    const visibleCreatures = this.world
      .creaturesVisibleTo(player, joiner.viewRange)
      .filter((creature) => this.canObserve(joiner, player, creature));
    for (const creature of visibleCreatures) {
      joiner.knownCreatureIds.add(creature.id);
    }
    for (const other of this.viewerSessionsFor(player.position, 0)) {
      if (other.id === joiner.id) continue;
      this.introduce(other, player);
    }
    return visibleCreatures.map((creature) => this.stateFor(player, creature));
  }

  announceCreatureSpawn(creature: Creature): void {
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      this.introduce(session, creature);
    }
  }

  announceLeave(leaver: Session, creature: Creature): void {
    for (const near of this.viewerSessionsFor(creature.position, 0)) {
      if (near.id === leaver.id) continue;
      this.forget(near, creature.id);
    }
  }

  announceCreatureLeave(creature: Creature): void {
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      this.forget(session, creature.id);
    }
  }

  onPlayerStepped(
    mover: Session,
    player: Player,
    from: Position,
    durationMs: number,
  ): void {
    const moved = JSON.stringify(this.movedMessage(player, from, durationMs));
    mover.sendSerialized(moved);
    this.reconcileMoverView(mover, player);
    this.syncMapItemsAfterStep(mover, player, from);
    this.updateObservers(player, from, durationMs, mover.id, moved);
  }

  onPlayerTeleported(mover: Session, player: Player, from: Position): void {
    const moved = JSON.stringify(this.movedMessage(player, from, 0));
    mover.sendSerialized(moved);
    this.reconcileMoverView(mover, player);
    this.syncMapItems(mover, player);
    this.updateObservers(player, from, 0, mover.id, moved);
  }

  onCreatureStepped(
    creature: Creature,
    from: Position,
    durationMs: number,
  ): void {
    this.updateObservers(
      creature,
      from,
      durationMs,
      undefined,
      JSON.stringify(this.movedMessage(creature, from, durationMs)),
    );
  }

  broadcastPose(creature: Creature): void {
    const message = this.movedMessage(creature, creature.position, 0);
    this.sendShared(message, this.knowingViewerSessions(creature));
  }

  broadcastHealth(
    creature: Creature,
    recipients?: ReadonlyArray<Session>,
  ): void {
    const message: ServerMessage = {
      type: "creature-health" as const,
      creatureId: creature.id,
      healthPercent: creature.healthPercent,
    };
    this.sendShared(message, recipients ?? this.knowingViewerSessions(creature));
  }

  broadcastCreatureSpeech(
    creature: Creature,
    text: string,
    yell: boolean,
  ): void {
    const message: ServerMessage = {
      type: "creature-spoke" as const,
      creatureId: creature.id,
      name: creature.name,
      mode: yell ? ("yell" as const) : ("say" as const),
      position: { ...creature.position },
      text,
    };
    this.sendShared(message, this.knowingViewerSessions(creature));
  }

  onCreatureStateChanged(creature: Creature): void {
    for (const session of this.viewerSessionsFor(creature.position, 0)) {
      if (!session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (!viewer) continue;
      const visible =
        this.world.canCreatureSee(viewer, creature.position, session.viewRange) &&
        this.canObserve(session, viewer, creature);
      const known = session.knownCreatureIds.has(creature.id);
      if (visible && known) {
        session.send({
          type: "creature-state-changed",
          creature: this.stateFor(viewer, creature),
        });
      } else if (visible) {
        this.introduce(session, creature);
      } else if (known && creature.id !== viewer.id) {
        this.forget(session, creature.id);
      }
    }
  }

  broadcastCombatText(
    creature: Creature,
    value: number,
    damageType: DamageType,
    block: HitBlock,
    recipients?: ReadonlyArray<Session>,
  ): void {
    const message: ServerMessage = {
      type: "combat-text",
      position: { ...creature.position },
      value,
      damageType,
      block,
    };
    this.sendShared(message, recipients ?? this.knowingViewerSessions(creature));
  }

  sendExperienceText(
    recipientPlayerId: string,
    creature: Creature,
    value: number,
  ): void {
    const recipient = this.world.getPlayer(recipientPlayerId);
    const session = this.registry.sessionFor(recipientPlayerId);
    if (
      !recipient ||
      !session ||
      !session.knownCreatureIds.has(creature.id) ||
      !this.world.canCreatureSee(
        recipient,
        creature.position,
        session.viewRange,
      )
    ) {
      return;
    }
    session.send({
      type: "experience-text",
      position: { ...creature.position },
      value,
    });
  }

  broadcastMagicEffect(
    position: Position,
    effectId: number,
    relatedCreatureId?: string,
    recipients?: ReadonlyArray<Session>,
  ): void {
    // Effect id 0 means "no effect" in imported content; sending it would
    // violate the protocol schema (magic-effect requires a positive id).
    if (effectId < 1) return;
    const message: ServerMessage = {
      type: "magic-effect",
      position: { ...position },
      effectId,
    };
    if (recipients) {
      this.sendShared(message, recipients);
      return;
    }
    const found: Session[] = [];
    for (const session of this.viewerSessionsFor(position, 0)) {
      if (
        relatedCreatureId &&
        !session.knownCreatureIds.has(relatedCreatureId)
      ) {
        continue;
      }
      found.push(session);
    }
    this.sendShared(message, found);
  }

  broadcastDistanceMissile(
    from: Position,
    to: Position,
    missileId: number,
    durationMs: number,
    relatedCreatureIds: ReadonlyArray<string> = [],
  ): void {
    const nearby = new Set<Session>();
    for (const session of this.viewerSessionsFor(from, 0)) nearby.add(session);
    for (const session of this.viewerSessionsFor(to, 0)) nearby.add(session);
    const message: ServerMessage = {
      type: "distance-missile",
      from: { ...from },
      to: { ...to },
      missileId,
      durationMs,
    };
    const recipients: Session[] = [];
    for (const session of nearby) {
      if (!session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (
        !viewer ||
        !this.world.canCreatureSee(viewer, from, session.viewRange) ||
        !this.world.canCreatureSee(viewer, to, session.viewRange) ||
        relatedCreatureIds.some(
          (creatureId) => !session.knownCreatureIds.has(creatureId),
        )
      ) {
        continue;
      }
      recipients.push(session);
    }
    this.sendShared(message, recipients);
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
    this.sendMapItemChanges(session, visible, hidden);
  }

  private syncMapItemsAfterStep(
    session: Session,
    player: Player,
    from: Position,
  ): void {
    const hidden: Position[] = [];
    for (const [key, position] of session.knownMapItemTiles) {
      if (this.world.canCreatureSee(player, position, session.viewRange)) {
        continue;
      }
      session.knownMapItemTiles.delete(key);
      hidden.push(position);
    }
    const visible = this.world
      .mapItemTilesEnteringView(from, player.position, session.viewRange)
      .filter((tile) => {
        const key = positionKey(tile.position);
        if (session.knownMapItemTiles.has(key)) return false;
        session.knownMapItemTiles.set(key, tile.position);
        return true;
      });
    this.sendMapItemChanges(session, visible, hidden);
  }

  private sendMapItemChanges(
    session: Session,
    visible: ReadonlyArray<TileState>,
    hidden: ReadonlyArray<Position>,
  ): void {
    for (let index = 0; index < hidden.length; index += 32) {
      session.send({
        type: "tile-states",
        visible: [],
        hidden: hidden.slice(index, index + 32),
      });
    }
    const envelopeBytes = Buffer.byteLength(
      JSON.stringify({ type: "tile-states", visible: [], hidden: [] }),
    );
    let batch: TileState[] = [];
    let batchBytes = envelopeBytes;
    for (const tile of visible) {
      // +1 covers the separating comma; overestimating by one byte on the
      // first tile only makes batches marginally smaller, never oversized.
      const tileBytes = Buffer.byteLength(JSON.stringify(tile)) + 1;
      if (
        batch.length > 0 &&
        batchBytes + tileBytes > PROTOCOL_LIMITS.maxMessageBytes
      ) {
        session.send({ type: "tile-states", visible: batch, hidden: [] });
        batch = [];
        batchBytes = envelopeBytes;
      }
      batch.push(tile);
      batchBytes += tileBytes;
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
    serializedMoved = JSON.stringify(
      this.movedMessage(creature, from, durationMs),
    ),
  ): void {
    const nearby = new Set<Session>();
    for (const session of this.viewerSessionsFor(from, 1)) nearby.add(session);
    for (const session of this.viewerSessionsFor(creature.position, 1)) {
      nearby.add(session);
    }
    for (const session of nearby) {
      if (session.id === excludedSessionId || !session.playerId) continue;
      const viewer = this.world.getPlayer(session.playerId);
      if (viewer) {
        this.updateViewOfCreature(
          session,
          viewer,
          creature,
          serializedMoved,
        );
      }
    }
  }

  private updateViewOfCreature(
    viewerSession: Session,
    viewer: Player,
    moved: Creature,
    serializedMoved: string,
  ): void {
    const visible = this.world.canCreatureSee(
      viewer,
      moved.position,
      viewerSession.viewRange,
    ) && this.canObserve(viewerSession, viewer, moved);
    const known = viewerSession.knownCreatureIds.has(moved.id);
    if (visible && known) {
      viewerSession.sendSerialized(serializedMoved);
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
        this.world.canCreatureSee(player, other.position, mover.viewRange) &&
        this.canObserve(mover, player, other)
      ) {
        continue;
      }
      this.forget(mover, knownId);
    }
    for (const other of this.world.creaturesVisibleTo(player, mover.viewRange)) {
      if (!this.canObserve(mover, player, other)) continue;
      if (mover.knownCreatureIds.has(other.id)) continue;
      this.introduce(mover, other);
    }
  }

  private introduce(session: Session, creature: Creature): void {
    if (session.knownCreatureIds.has(creature.id)) return;
    if (!session.playerId) return;
    const viewer = this.world.getPlayer(session.playerId);
    if (!viewer || !this.canObserve(session, viewer, creature)) return;
    session.knownCreatureIds.add(creature.id);
    session.send({
      type: "creature-joined",
      creature: this.stateFor(viewer, creature),
    });
  }

  private stateFor(viewer: Player, creature: Creature): CreatureState {
    const state = creature.toState();
    return this.stateDecorator
      ? this.stateDecorator(viewer, creature, state)
      : state;
  }

  private forget(session: Session, creatureId: string): void {
    if (!session.knownCreatureIds.delete(creatureId)) return;
    if (session.attackTargetId === creatureId) {
      session.attackTargetId = null;
      session.send({ type: "attack-target-changed", creatureId: null });
    }
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

  private canObserve(
    _session: Session,
    viewer: Player,
    creature: Creature,
  ): boolean {
    return creature.id === viewer.id || !creature.conditions.has("invisible");
  }

  private sendShared(
    message: ServerMessage,
    recipients: Iterable<Session>,
  ): void {
    const serialized = JSON.stringify(message);
    for (const session of recipients) session.sendSerialized(serialized);
  }
}
