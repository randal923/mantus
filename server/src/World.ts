import type { Direction, Position, ViewRange } from "@tibia/protocol";
import { canSee } from "./canSee";
import type { Creature } from "./creature/Creature";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import type { MapData } from "./MapData";
import type { ItemMutation } from "./item/ItemMutation";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import type { Player } from "./Player";
import { SpatialGrid } from "./SpatialGrid";
import { DynamicMapItems } from "./world/DynamicMapItems";
import { MovementRules } from "./world/MovementRules";
import type { MoveResult } from "./world/MoveResult";
import { overrideMapData } from "./world/overrideMapData";
import { TileOccupancy } from "./world/TileOccupancy";

export type { MoveResult } from "./world/MoveResult";

export class World {
  private readonly players = new Map<string, Player>();
  private readonly creatures = new Map<string, Creature>();
  private readonly grid = new SpatialGrid();
  private readonly mapItems: DynamicMapItems;
  private readonly occupancy: TileOccupancy;
  private readonly movement: MovementRules;
  /** Static map data overlaid with door-owned passability overrides. */
  private readonly map: MapData;

  constructor(
    baseMap: MapData,
    tickMs: number,
    worldItemDeltas: WorldItemDeltas = { hiddenSeedKeys: [], items: [] },
    itemWeightForId: (itemId: number) => number | undefined = () => undefined,
    doorPassabilityForItemId: (
      itemId: number,
    ) => boolean | undefined = () => undefined,
  ) {
    this.mapItems = new DynamicMapItems(
      baseMap,
      itemWeightForId,
      doorPassabilityForItemId,
    );
    this.map = overrideMapData(baseMap, this.mapItems);
    this.occupancy = new TileOccupancy(this.map, this.grid);
    this.movement = new MovementRules(
      this.map,
      tickMs,
      this.grid,
      this.occupancy,
    );
    for (const seedKey of worldItemDeltas.hiddenSeedKeys) {
      this.mapItems.hideSeed(seedKey);
    }
    this.mapItems.registerLoadedWorldItems(worldItemDeltas.items);
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

  getHouseId(position: Position): number | undefined {
    return this.map.getHouseId?.(position);
  }

  getHouseTiles(houseId: number): ReadonlyArray<Position> {
    return this.map.getHouseTiles?.(houseId) ?? [];
  }

  /** Execution-time house-tile authorization consulted on every step. */
  setHousePolicy(
    policy: (player: Player, destination: Position) => boolean,
  ): void {
    this.movement.setHousePolicy(policy);
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
    return this.mapItems.getMapItems(position);
  }

  getWorldItem(instanceId: string) {
    return this.mapItems.getWorldItem(instanceId);
  }

  getWorldSubtree(rootId: string) {
    return this.mapItems.getWorldSubtree(rootId);
  }

  getMapAction(position: Position) {
    return this.map.getAction(position);
  }

  getDoorOverride(position: Position) {
    return this.mapItems.getTileOverride(position);
  }

  isOccupied(position: Position): boolean {
    return this.occupancy.isOccupied(position);
  }

  reservePosition(position: Position, reservationId: string): boolean {
    return this.occupancy.reservePosition(position, reservationId);
  }

  releasePosition(position: Position, reservationId: string): void {
    this.occupancy.releasePosition(position, reservationId);
  }

  findUnoccupiedPosition(preferred: Position, maxRadius: number): Position | null {
    return this.occupancy.findUnoccupiedPosition(preferred, maxRadius);
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
    return this.mapItems.mapItemTilesVisibleFrom(position, range);
  }

  mapItemTileState(position: Position) {
    return this.mapItems.mapItemTileState(position);
  }

  applyItemMutation(mutation: ItemMutation): Position[] {
    return this.mapItems.applyItemMutation(mutation);
  }

  applyCreatedWorldItems(items: ReadonlyArray<ItemMutation["after"][number]>): Position[] {
    return this.mapItems.applyCreatedWorldItems(items);
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
    return this.occupancy.findSpawn(preferred);
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
    return this.movement.tryMove(player, direction, now);
  }

  tryMoveCreature(
    creature: Creature,
    direction: Direction,
    now: number,
    leash?: { home: Position; radius: number },
  ): MoveResult {
    return this.movement.tryMoveCreature(creature, direction, now, leash);
  }

  tryUseMap(player: Player, target: Position, now: number): MoveResult {
    return this.movement.tryUseMap(player, target, now);
  }
}
