import type { Direction, Position, ViewRange } from "@tibia/protocol";
import { canSee } from "./canSee";
import type { Creature } from "./creature/Creature";
import { Monster } from "./creature/Monster";
import { CombatFieldManager } from "./combat/CombatFieldManager";
import { getFirstVisibleFloor } from "./getFirstVisibleFloor";
import type { MapData } from "./MapData";
import type { ItemMutation } from "./item/ItemMutation";
import type { LootOrigin } from "./item/LootOrigin";
import type { WorldItemDeltas } from "./item/WorldItemDeltas";
import type { Player } from "./Player";
import { SpatialGrid } from "./SpatialGrid";
import { DynamicMapItems } from "./world/DynamicMapItems";
import { MovementRules } from "./world/MovementRules";
import type { MoveResult } from "./world/MoveResult";
import { overrideMapData } from "./world/overrideMapData";
import { TileOccupancy } from "./world/TileOccupancy";

export type { MoveResult } from "./world/MoveResult";

const GROUND_FLOOR = 7;

export class World {
  private readonly players = new Map<string, Player>();
  private readonly creatures = new Map<string, Creature>();
  private readonly grid = new SpatialGrid();
  private readonly firstVisibleFloorByCreature = new WeakMap<
    Creature,
    {
      readonly positionRevision: number;
      readonly mapRevision: number;
      readonly floor: number;
    }
  >();
  private readonly mapItems: DynamicMapItems;
  private readonly occupancy: TileOccupancy;
  private readonly movement: MovementRules;
  readonly combatFields = new CombatFieldManager();
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
    private readonly fieldForItemId: (
      itemId: number,
    ) => "energy" | "fire" | "poison" | undefined = () => undefined,
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
      (position, now) => this.fieldTypeAt(position, now),
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

  fieldTypeAt(
    position: Position,
    now: number,
  ): "energy" | "fire" | "poison" | undefined {
    const combatField = this.combatFields.get(position, now);
    if (combatField) return combatField.type;
    for (const item of this.mapItems.getMapItems(position)) {
      const type = this.fieldForItemId(item.itemId);
      if (type) return type;
    }
    return undefined;
  }

  get fieldRevision(): number {
    return this.combatFields.revision + this.mapItems.revision;
  }

  canCreaturePathTo(creature: Creature, position: Position, now: number): boolean {
    if (!this.isPathable(position)) return false;
    if (!(creature instanceof Monster)) return true;
    const field = this.fieldTypeAt(position, now);
    if (field === "energy") return creature.type.flags.canWalkOnEnergy;
    if (field === "fire") return creature.type.flags.canWalkOnFire;
    if (field === "poison") return creature.type.flags.canWalkOnPoison;
    return true;
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

  removeMapItem(instanceId: string, position: Position): boolean {
    return this.mapItems.removeMapItem(instanceId, position);
  }

  lootOrigin(itemId: string) {
    return this.mapItems.lootOrigin(itemId);
  }

  registerUnpersistedLootItems(
    items: ReadonlyArray<ItemMutation["after"][number]>,
    origin: LootOrigin,
  ): void {
    this.mapItems.registerUnpersistedLootItems(items, origin);
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

  canCreatureSee(
    viewer: Creature,
    target: Position,
    range: ViewRange,
  ): boolean {
    return canSee(
      viewer.position,
      target,
      range,
      this.firstVisibleFloorFor(viewer),
    );
  }

  creaturesVisibleFrom(position: Position, range: ViewRange): Creature[] {
    return this.creaturesVisibleFromFloor(
      position,
      range,
      getFirstVisibleFloor(position, this.map),
    );
  }

  creaturesVisibleTo(viewer: Creature, range: ViewRange): Creature[] {
    return this.creaturesVisibleFromFloor(
      viewer.position,
      range,
      this.firstVisibleFloorFor(viewer),
    );
  }

  private creaturesVisibleFromFloor(
    position: Position,
    range: ViewRange,
    firstFloor: number,
  ): Creature[] {
    const floors =
      position.z > GROUND_FLOOR
        ? [position.z]
        : Array.from(
            { length: GROUND_FLOOR - firstFloor + 1 },
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

  mapItemTilesEnteringView(
    from: Position,
    position: Position,
    range: ViewRange,
  ) {
    return this.mapItems.mapItemTilesEnteringView(from, position, range);
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
    const players = new Set<Player>();
    for (const z of this.grid.occupiedFloors()) {
      if (
        (position.z > GROUND_FLOOR && z !== position.z) ||
        (position.z <= GROUND_FLOOR && z > GROUND_FLOOR)
      ) {
        continue;
      }
      const shift = z - position.z;
      const center = { x: position.x - shift, y: position.y - shift, z };
      for (const creature of this.grid.query(center, range.x, range.y)) {
        const player = this.players.get(creature.id);
        if (!player) continue;
        if (this.canCreatureSee(player, position, range)) players.add(player);
      }
    }
    return [...players];
  }

  private firstVisibleFloorFor(creature: Creature): number {
    const cached = this.firstVisibleFloorByCreature.get(creature);
    if (
      cached?.positionRevision === creature.positionRevision &&
      cached.mapRevision === this.mapItems.revision
    ) {
      return cached.floor;
    }
    const floor = getFirstVisibleFloor(creature.position, this.map);
    this.firstVisibleFloorByCreature.set(creature, {
      positionRevision: creature.positionRevision,
      mapRevision: this.mapItems.revision,
      floor,
    });
    return floor;
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

  get playerCount(): number {
    return this.players.size;
  }

  get monsterCount(): number {
    let count = 0;
    for (const creature of this.creatures.values()) {
      if (creature.kind === "monster") count++;
    }
    return count;
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

  turnPlayer(player: Player, direction: Direction): boolean {
    return this.movement.turn(player, direction);
  }

  tryMoveCreature(
    creature: Creature,
    direction: Direction,
    now: number,
    leash?: { home: Position; radius: number },
  ): MoveResult {
    return this.movement.tryMoveCreature(creature, direction, now, leash);
  }

  tryMoveFearedCreature(
    creature: Creature,
    direction: Direction,
    now: number,
  ): MoveResult {
    return this.movement.tryMoveFearedCreature(creature, direction, now);
  }

  tryUseMap(player: Player, target: Position, now: number): MoveResult {
    return this.movement.tryUseMap(player, target, now);
  }

  tryUseRopeSpot(player: Player, target: Position, now: number): MoveResult {
    return this.movement.tryUseRopeSpot(player, target, now);
  }
}
