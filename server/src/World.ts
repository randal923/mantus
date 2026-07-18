import type { Direction, Position, ViewRange } from "@tibia/protocol";
import { canSee } from "./canSee";
import type { Creature } from "./creature/Creature";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import type { MapData } from "./MapData";
import type { ItemMutation } from "./item/ItemMutation";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import type { MapItem } from "./MapItem";
import { getStepDurationMs } from "./getStepDurationMs";
import { Player } from "./Player";
import { positionKey } from "./positionKey";
import { SpatialGrid } from "./SpatialGrid";

const DIRECTION_DELTAS: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
  northeast: [1, -1],
  southeast: [1, 1],
  southwest: [-1, 1],
  northwest: [-1, -1],
};

/** A full spawn ring this far out means the temple area is packed solid. */
const SPAWN_SEARCH_RADIUS = 256;

export type MoveResult =
  | {
      moved: false;
      turned: boolean;
      reason: "cooldown" | "blocked" | "occupied" | "invalid-transition";
      retryAfterMs: number;
    }
  | {
      moved: true;
      turned: boolean;
      from: Position;
      durationMs: number;
    };

export class World {
  private readonly players = new Map<string, Player>();
  private readonly creatures = new Map<string, Creature>();
  private readonly grid = new SpatialGrid();
  private readonly hiddenMapItemIds = new Set<string>();
  private readonly dynamicMapItems = new Map<string, MapItem[]>();
  private readonly tileItemRevisions = new Map<string, number>();
  private readonly positionReservations = new Map<string, string>();

  constructor(
    private readonly map: MapData,
    private readonly tickMs: number,
    worldItemDeltas: WorldItemDeltas = { hiddenSeedKeys: [], items: [] },
  ) {
    for (const seedKey of worldItemDeltas.hiddenSeedKeys) {
      this.hiddenMapItemIds.add(seedKey);
    }
    for (const item of worldItemDeltas.items) this.addDynamicWorldItem(item);
  }

  get mapName(): string {
    return this.map.name;
  }

  get templePosition(): Position {
    return { ...this.map.spawn };
  }

  townName(townId: number): string | undefined {
    return this.map.getTownName?.(townId);
  }

  isWalkable(position: Position): boolean {
    return this.map.isWalkable(position);
  }

  isPathable(position: Position): boolean {
    return this.map.isWalkable(position, true);
  }

  getTile(position: Position) {
    return this.map.getTile(position);
  }

  isProtectionZone(position: Position): boolean {
    return this.map.getTile(position)?.protectionZone ?? false;
  }

  isNoPvpZone(position: Position): boolean {
    return this.map.getTile(position)?.noPvpZone ?? false;
  }

  hasLineOfSight(from: Position, to: Position): boolean {
    if (from.z !== to.z) return false;
    let x = from.x;
    let y = from.y;
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const stepX = from.x < to.x ? 1 : -1;
    const stepY = from.y < to.y ? 1 : -1;
    let error = dx - dy;
    while (x !== to.x || y !== to.y) {
      const doubled = error * 2;
      if (doubled > -dy) {
        error -= dy;
        x += stepX;
      }
      if (doubled < dx) {
        error += dx;
        y += stepY;
      }
      if (x === to.x && y === to.y) return true;
      if (this.map.blocksProjectile({ x, y, z: from.z })) return false;
    }
    return true;
  }

  getMapItems(position: Position) {
    const key = positionKey(position);
    return [
      ...this.map
        .getItems(position)
        .filter((item) => !this.hiddenMapItemIds.has(item.instanceId)),
      ...(this.dynamicMapItems.get(key) ?? []),
    ].sort((left, right) => left.stackIndex - right.stackIndex);
  }

  isOccupied(position: Position): boolean {
    return (
      this.grid.query(position, 0, 0).length > 0 ||
      this.positionReservations.has(positionKey(position))
    );
  }

  reservePosition(position: Position, reservationId: string): boolean {
    const key = positionKey(position);
    if (!this.isWalkable(position) || this.isOccupied(position)) return false;
    this.positionReservations.set(key, reservationId);
    return true;
  }

  releasePosition(position: Position, reservationId: string): void {
    const key = positionKey(position);
    if (this.positionReservations.get(key) === reservationId) {
      this.positionReservations.delete(key);
    }
  }

  findUnoccupiedPosition(preferred: Position, maxRadius: number): Position | null {
    for (let radius = 0; radius <= maxRadius; radius++) {
      for (let y = preferred.y - radius; y <= preferred.y + radius; y++) {
        for (let x = preferred.x - radius; x <= preferred.x + radius; x++) {
          if (
            Math.max(Math.abs(x - preferred.x), Math.abs(y - preferred.y)) !==
            radius
          ) {
            continue;
          }
          const position = { x, y, z: preferred.z };
          if (this.isWalkable(position) && !this.isOccupied(position)) {
            return position;
          }
        }
      }
    }
    return null;
  }

  /** Players within the view box centered on (x, y). */
  playersNear(
    position: Position,
    range: { x: number; y: number },
  ): Player[] {
    return this.grid
      .query(position, range.x, range.y)
      .filter((creature): creature is Player => creature.kind === "player");
  }

  canSee(viewer: Position, target: Position, range: ViewRange): boolean {
    return canSee(
      viewer,
      target,
      range,
      getFirstVisibleFloor(viewer, this.map),
    );
  }

  creaturesVisibleFrom(position: Position, range: ViewRange): Creature[] {
    const firstFloor = getFirstVisibleFloor(position, this.map);
    const floors =
      position.z > 7
        ? [position.z]
        : Array.from(
            { length: position.z - firstFloor + 1 },
            (_, index) => firstFloor + index,
          );
    const creatures = new Set<Creature>();
    for (const z of floors) {
      const shift = position.z - z;
      const center = { x: position.x + shift, y: position.y + shift, z };
      for (const creature of this.grid.query(center, range.x, range.y)) {
        if (this.canSee(position, creature.position, range)) {
          creatures.add(creature);
        }
      }
    }
    return [...creatures];
  }

  creaturesNear(
    position: Position,
    range: { x: number; y: number },
  ): Creature[] {
    return this.grid.query(position, range.x, range.y);
  }

  creaturesAt(position: Position): Creature[] {
    return this.grid.query(position, 0, 0);
  }

  playersVisibleFrom(position: Position, range: ViewRange): Player[] {
    return this.creaturesVisibleFrom(position, range).filter(
      (creature): creature is Player => creature.kind === "player",
    );
  }

  mapItemTilesVisibleFrom(position: Position, range: ViewRange) {
    const firstFloor = getFirstVisibleFloor(position, this.map);
    const floors =
      position.z > 7
        ? [position.z]
        : Array.from(
            { length: position.z - firstFloor + 1 },
            (_, index) => firstFloor + index,
          );
    const tiles = [];
    for (const z of floors) {
      const shift = position.z - z;
      const centerX = position.x + shift;
      const centerY = position.y + shift;
      for (let y = centerY - range.y; y <= centerY + range.y; y++) {
        for (let x = centerX - range.x; x <= centerX + range.x; x++) {
          const tilePosition = { x, y, z };
          const items = this.getMapItems(tilePosition);
          if (items.length === 0) continue;
          tiles.push({
            position: tilePosition,
            revision: this.tileItemRevisions.get(positionKey(tilePosition)) ?? 0,
            items: items.map((item) => ({
              instanceId: item.instanceId,
              itemId: item.itemId,
              stackIndex: item.stackIndex,
              revision: item.revision ?? 1,
              count: item.count ?? 1,
            })),
          });
        }
      }
    }
    return tiles;
  }

  mapItemTileState(position: Position) {
    const items = this.getMapItems(position);
    return {
      position: { ...position },
      revision: this.tileItemRevisions.get(positionKey(position)) ?? 0,
      items: items.map((item) => ({
        instanceId: item.instanceId,
        itemId: item.itemId,
        stackIndex: item.stackIndex,
        revision: item.revision ?? 1,
        count: item.count ?? 1,
      })),
    };
  }

  applyItemMutation(mutation: ItemMutation): Position[] {
    const changed = new Map<string, Position>();
    if (mutation.before?.location.kind === "world") {
      const { position } = mutation.before.location;
      changed.set(positionKey(position), position);
      if (mutation.before.seedKey) {
        this.hiddenMapItemIds.add(mutation.before.seedKey);
        this.removeDynamicWorldItem(
          mutation.before.seedKey,
          mutation.before.location.position,
        );
      } else {
        this.removeDynamicWorldItem(mutation.before.id, position);
      }
    }
    for (const item of mutation.after) {
      if (item.location.kind !== "world") continue;
      if (item.seedKey) this.hiddenMapItemIds.add(item.seedKey);
      this.removeDynamicWorldItem(item.id, item.location.position);
      if (item.seedKey) {
        this.removeDynamicWorldItem(item.seedKey, item.location.position);
      }
      this.addDynamicWorldItem(item);
      changed.set(positionKey(item.location.position), item.location.position);
    }
    for (const key of changed.keys()) {
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
    }
    return [...changed.values()];
  }

  applyCreatedWorldItems(items: ReadonlyArray<ItemMutation["after"][number]>): Position[] {
    const changed = new Map<string, Position>();
    for (const item of items) {
      if (item.location.kind !== "world") continue;
      this.addDynamicWorldItem(item);
      const key = positionKey(item.location.position);
      changed.set(key, item.location.position);
      this.tileItemRevisions.set(key, (this.tileItemRevisions.get(key) ?? 0) + 1);
    }
    return [...changed.values()];
  }

  playersWhoCanSee(position: Position, range: ViewRange): Player[] {
    const viewerFloors =
      position.z > 7
        ? [position.z]
        : Array.from({ length: 8 - position.z }, (_, index) => position.z + index);
    const players = new Set<Player>();
    for (const z of viewerFloors) {
      const shift = z - position.z;
      const center = { x: position.x - shift, y: position.y - shift, z };
      for (const creature of this.grid.query(center, range.x, range.y)) {
        const player = this.players.get(creature.id);
        if (!player) continue;
        if (this.canSee(player.position, position, range)) players.add(player);
      }
    }
    return [...players];
  }

  /** Spiral out from the map's spawn point until a free tile is found. */
  findSpawn(preferred?: Position): Position | null {
    if (
      preferred &&
      this.isWalkable(preferred) &&
      !this.isOccupied(preferred)
    ) {
      return { ...preferred };
    }
    const { x: cx, y: cy, z } = this.map.spawn;
    for (let radius = 0; radius < SPAWN_SEARCH_RADIUS; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const x = cx + dx;
          const y = cy + dy;
          const position = { x, y, z };
          if (this.isWalkable(position) && !this.isOccupied(position)) {
            return position;
          }
        }
      }
    }
    return null;
  }

  addPlayer(player: Player): void {
    this.addCreature(player);
    this.players.set(player.id, player);
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.removeCreature(playerId);
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  allPlayers(): Iterable<Player> {
    return this.players.values();
  }

  playerStates() {
    return [...this.players.values()].map((player) => player.toState());
  }

  addCreature(creature: Creature): void {
    if (this.creatures.has(creature.id)) {
      throw new Error(`creature id already exists: ${creature.id}`);
    }
    if (this.isOccupied(creature.position)) {
      throw new Error(`creature spawn position is occupied: ${creature.id}`);
    }
    this.creatures.set(creature.id, creature);
    this.grid.insert(creature);
  }

  removeCreature(creatureId: string): Creature | undefined {
    const creature = this.creatures.get(creatureId);
    if (!creature) return undefined;
    this.creatures.delete(creatureId);
    if (creature.kind === "player") this.players.delete(creatureId);
    this.grid.remove(creature);
    return creature;
  }

  getCreature(creatureId: string): Creature | undefined {
    return this.creatures.get(creatureId);
  }

  relocateCreature(creature: Creature, position: Position): Position {
    const from = creature.position;
    creature.moveTo(position);
    this.grid.move(creature, from);
    return from;
  }

  allCreatures(): Iterable<Creature> {
    return this.creatures.values();
  }

  creatureStates() {
    return [...this.creatures.values()].map((creature) => creature.toState());
  }

  /**
   * Validates and applies one step. All rules live here, at execution time:
   * walk-speed cooldown, bounds, blocked tiles, occupancy (charter rules 4, 8).
   */
  tryMove(player: Player, direction: Direction, now: number): MoveResult {
    return this.tryMoveInternal(player, direction, now, true);
  }

  tryMoveCreature(
    creature: Creature,
    direction: Direction,
    now: number,
    leash?: { home: Position; radius: number },
  ): MoveResult {
    return this.tryMoveInternal(creature, direction, now, false, leash);
  }

  private tryMoveInternal(
    creature: Creature,
    requestedDirection: Direction,
    now: number,
    allowTransitions: boolean,
    leash?: { home: Position; radius: number },
  ): MoveResult {
    const direction = creature.conditions.resolveDirection(
      requestedDirection,
      now,
    );
    const turned = creature.direction !== direction;
    creature.direction = direction;

    if (now < creature.nextStepAt) {
      return {
        moved: false,
        turned,
        reason: "cooldown",
        retryAfterMs: creature.nextStepAt - now,
      };
    }
    const [dx, dy] = DIRECTION_DELTAS[direction];
    const from = creature.position;
    const destination = {
      x: from.x + dx,
      y: from.y + dy,
      z: from.z,
    };
    if (
      creature instanceof Player &&
      creature.conditions.has("pz-lock") &&
      this.isProtectionZone(destination)
    ) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (
      leash &&
      (destination.z !== leash.home.z ||
        Math.max(
          Math.abs(destination.x - leash.home.x),
          Math.abs(destination.y - leash.home.y),
        ) > leash.radius)
    ) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (!this.isWalkable(destination)) {
      return { moved: false, turned, reason: "blocked", retryAfterMs: 0 };
    }
    if (this.isOccupied(destination)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const transition = allowTransitions
      ? this.map.getTransition(destination, direction)
      : undefined;
    const resolved = transition?.destination ?? destination;
    if (!this.isWalkable(resolved)) {
      return {
        moved: false,
        turned,
        reason: transition ? "invalid-transition" : "blocked",
        retryAfterMs: 0,
      };
    }
    if (this.isOccupied(resolved)) {
      return { moved: false, turned, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(resolved);
    if (!groundSpeed) {
      return {
        moved: false,
        turned,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs = getStepDurationMs(
      creature.stepSpeed,
      groundSpeed,
      this.tickMs,
      dx !== 0 && dy !== 0,
    );
    creature.moveTo(resolved);
    creature.nextStepAt = now + durationMs;
    this.grid.move(creature, from);
    return { moved: true, turned, from, durationMs };
  }

  tryUseMap(player: Player, target: Position, now: number): MoveResult {
    const from = player.position;
    const distance = Math.abs(target.x - from.x) + Math.abs(target.y - from.y);
    if (target.z !== from.z || distance > 1) {
      return { moved: false, turned: false, reason: "blocked", retryAfterMs: 0 };
    }
    if (now < player.nextStepAt) {
      return {
        moved: false,
        turned: false,
        reason: "cooldown",
        retryAfterMs: player.nextStepAt - now,
      };
    }
    const action = this.map.getAction(target);
    if (!action || !this.isWalkable(action.destination)) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    if (this.isOccupied(action.destination)) {
      return { moved: false, turned: false, reason: "occupied", retryAfterMs: 0 };
    }
    const groundSpeed = this.map.getGroundSpeed(action.destination);
    if (!groundSpeed) {
      return {
        moved: false,
        turned: false,
        reason: "invalid-transition",
        retryAfterMs: 0,
      };
    }
    const durationMs = getStepDurationMs(
      player.stepSpeed,
      groundSpeed,
      this.tickMs,
    );
    player.moveTo(action.destination);
    player.nextStepAt = now + durationMs;
    this.grid.move(player, from);
    return { moved: true, turned: false, from, durationMs };
  }

  private addDynamicWorldItem(item: WorldItemDeltas["items"][number]): void {
    if (item.location.kind !== "world") return;
    const key = positionKey(item.location.position);
    const current = this.dynamicMapItems.get(key) ?? [];
    const instanceId = item.seedKey ?? item.id;
    this.dynamicMapItems.set(key, [
      ...current.filter((candidate) => candidate.instanceId !== instanceId),
      {
        instanceId,
        itemId: item.typeId,
        stackIndex: item.location.stackIndex,
        mutable: true,
        revision: item.version,
        count: item.count,
      },
    ]);
  }

  private removeDynamicWorldItem(itemId: string, position: Position): void {
    const key = positionKey(position);
    const current = this.dynamicMapItems.get(key);
    if (!current) return;
    const filtered = current.filter(
      (candidate) => candidate.instanceId !== itemId,
    );
    if (filtered.length === 0) {
      this.dynamicMapItems.delete(key);
      return;
    }
    this.dynamicMapItems.set(key, filtered);
  }
}
